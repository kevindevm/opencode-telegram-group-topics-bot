import { createScopeKeyFromParams, SCOPE_CONTEXT } from "../scope.js";
import {
  getSessionRouteTarget,
  getTopicBindingByScopeKey,
  getTopicBindingBySessionId,
  registerTopicSessionBinding,
  type TopicBindingInput,
} from "../../topic/manager.js";
import { formatTopicTitle } from "../../topic/title-format.js";
import {
  updateTopicBindingNameBySessionId,
} from "../../topic/manager.js";
import type { SubagentInfo } from "../../summary/aggregator.js";
import { inheritDisplayOverrides } from "../../display/manager.js";
import { logger } from "../../utils/logger.js";

const SUBAGENT_TOPIC_ICON = "🧩";
const SUBAGENT_TOPIC_DONE_ICON = "✅";
const SUBAGENT_TOPIC_FAILED_ICON = "❌";
const SUBAGENT_TOPIC_FALLBACK_NAME = "Subagente";

interface ForumTopicApi {
  createForumTopic(
    chatId: number,
    name: string,
    options?: Record<string, unknown>,
  ): Promise<{ message_thread_id: number }>;
  editForumTopic(
    chatId: number,
    threadId: number,
    payload: { name?: string },
  ): Promise<unknown>;
  closeForumTopic(chatId: number, threadId: number): Promise<unknown>;
}

function buildTopicTitle(description: string, agent: string): string {
  const label = description.trim() || agent.trim() || SUBAGENT_TOPIC_FALLBACK_NAME;
  return formatTopicTitle(`${SUBAGENT_TOPIC_ICON} ${label}`);
}

/**
 * Ensures the child session has its own transcript topic. Only depth-1
 * subagents (whose parent owns a regular topic) get one; deeper nesting
 * stays on the parent card to avoid topic sprawl. Idempotent: the ephemeral
 * binding itself is the created marker, and concurrent calls for the same
 * child share one in-flight creation so a retry storm cannot orphan topics.
 */
const pendingCreations = new Map<string, Promise<boolean>>();

export async function ensureSubagentTopic(
  api: ForumTopicApi,
  parentSessionId: string,
  info: Pick<SubagentInfo, "sessionId" | "description" | "agent">,
): Promise<boolean> {
  const childSessionId = info.sessionId;
  if (!childSessionId) {
    return false;
  }

  if (getTopicBindingBySessionId(childSessionId)) {
    return true;
  }

  const inFlight = pendingCreations.get(childSessionId);
  if (inFlight) {
    return inFlight;
  }

  const creation = createSubagentTopic(api, parentSessionId, info).finally(() => {
    if (pendingCreations.get(childSessionId) === creation) {
      pendingCreations.delete(childSessionId);
    }
  });
  pendingCreations.set(childSessionId, creation);
  return creation;
}

async function createSubagentTopic(
  api: ForumTopicApi,
  parentSessionId: string,
  info: Pick<SubagentInfo, "sessionId" | "description" | "agent">,
): Promise<boolean> {
  const childSessionId = info.sessionId;
  if (!childSessionId) {
    return false;
  }

  if (getTopicBindingBySessionId(childSessionId)) {
    return true;
  }

  const parentTarget = getSessionRouteTarget(parentSessionId);
  const parentBinding = getTopicBindingBySessionId(parentSessionId);
  if (!parentTarget || !parentBinding || parentBinding.ephemeral) {
    return false;
  }

  const title = buildTopicTitle(info.description, info.agent);

  try {
    const created = await api.createForumTopic(parentTarget.chatId, title);
    const input: TopicBindingInput = {
      scopeKey: createScopeKeyFromParams({
        chatId: parentTarget.chatId,
        threadId: created.message_thread_id,
        context: SCOPE_CONTEXT.GROUP_TOPIC,
      }),
      chatId: parentTarget.chatId,
      threadId: created.message_thread_id,
      sessionId: childSessionId,
      projectId: parentBinding.projectId,
      ...(parentBinding.projectWorktree
        ? { projectWorktree: parentBinding.projectWorktree }
        : {}),
      topicName: title,
      ephemeral: true,
    };
    registerTopicSessionBinding(input);
    if (parentBinding.scopeKey) {
      inheritDisplayOverrides(parentBinding.scopeKey, input.scopeKey);
    }
    logger.info(
      `[SubagentTopic] Created transcript topic for subagent ${childSessionId}: thread=${created.message_thread_id}`,
    );
    return true;
  } catch (error) {
    logger.error("[SubagentTopic] Failed to create subagent topic:", error);
    return false;
  }
}

/**
 * Renames the transcript topic with its terminal status and closes it so the
 * finished transcript stays readable but read-only.
 */
export async function finalizeSubagentTopic(
  api: ForumTopicApi,
  childSessionId: string,
  status: "completed" | "error",
  description: string,
): Promise<boolean> {
  const binding = getTopicBindingBySessionId(childSessionId);
  if (!binding?.ephemeral) {
    return false;
  }

  const icon = status === "completed" ? SUBAGENT_TOPIC_DONE_ICON : SUBAGENT_TOPIC_FAILED_ICON;
  const currentName = binding.topicName ?? "";
  // Already finalized with this status: skip API calls entirely so repeated
  // terminal emissions don't rename/close in a loop.
  if (currentName.startsWith(`${icon} `)) {
    return true;
  }
  const baseName = currentName.replace(/^[🧩✅❌]\s*/u, "").trim() || description.trim();
  const nextName = formatTopicTitle(`${icon} ${baseName}`);

  try {
    if (nextName && nextName !== currentName) {
      await api.editForumTopic(binding.chatId, binding.threadId, { name: nextName });
      updateTopicBindingNameBySessionId(childSessionId, nextName);
    }
    await api.closeForumTopic(binding.chatId, binding.threadId);
    logger.info(
      `[SubagentTopic] Closed transcript topic for subagent ${childSessionId}: thread=${binding.threadId}`,
    );
    return true;
  } catch (error) {
    if (isAlreadyFinalizedError(error)) {
      updateTopicBindingNameBySessionId(childSessionId, nextName);
      return true;
    }
    logger.error("[SubagentTopic] Failed to finalize subagent topic:", error);
    return false;
  }
}

/** Transcript-only topics reject user prompts; chat stays in the parent. */
export function isEphemeralTopicScope(scopeKey: string): boolean {
  return getTopicBindingByScopeKey(scopeKey)?.ephemeral === true;
}

/** Error shapes that mean "already in the desired terminal state". */
function isAlreadyFinalizedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown }).message === "string"
        ? (error as { message: string }).message
        : typeof (error as { description?: unknown }).description === "string"
          ? (error as { description: string }).description
          : "";
  return (
    message.includes("TOPIC_NOT_MODIFIED") ||
    message.includes("TOPIC_CLOSED") ||
    message.toLowerCase().includes("already closed")
  );
}
