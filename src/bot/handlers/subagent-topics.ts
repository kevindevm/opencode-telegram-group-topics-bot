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
import {
  parseRetryAfterMs,
  RateLimitExceededError,
} from "../telegram-rate-limiter.js";
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
    // A 429 here gets one delayed retry: the transcript would otherwise be
    // lost silently if this was the subagent's only emission.
    if (error instanceof RateLimitExceededError || parseRetryAfterMs(error) !== null) {
      if (!pendingFinalizeRetries.has(childSessionId)) {
        pendingFinalizeRetries.add(childSessionId);
        setTimeout(() => {
          pendingFinalizeRetries.delete(childSessionId);
          if (!getTopicBindingBySessionId(childSessionId)) {
            void ensureSubagentTopic(api, parentSessionId, info).catch((retryError) => {
              logger.warn("[SubagentTopic] Scheduled create retry failed:", {
                childSessionId,
                retryError,
              });
            });
          }
        }, FINALIZE_RETRY_DELAY_MS).unref?.();
      }
    } else {
      logger.error("[SubagentTopic] Failed to create subagent topic:", error);
    }
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
  // Already finalized with this status: the rename landed on a previous
  // attempt, but the close may not have (e.g. a 429 after the edit). Close
  // is idempotent, so confirm it instead of assuming it. A 429 here gets
  // one delayed retry since terminal emissions may never repeat.
  if (currentName.startsWith(`${icon} `)) {
    try {
      await api.closeForumTopic(binding.chatId, binding.threadId);
    } catch (error) {
      if (isAlreadyFinalizedError(error)) {
        return true;
      }
      if (error instanceof RateLimitExceededError || parseRetryAfterMs(error) !== null) {
        logger.warn("[SubagentTopic] Transcript close rate limited, retrying once later:", {
          childSessionId,
        });
        scheduleFinalizeRetry(api, childSessionId, status, description);
        return false;
      }
      logger.error("[SubagentTopic] Failed to confirm transcript topic close:", error);
    }
    return true;
  }
  const baseName = currentName.replace(/^[🧩✅❌]\s*/u, "").trim() || description.trim();
  const nextName = formatTopicTitle(`${icon} ${baseName}`);

  try {
    // Close first: closing is idempotent (a second close reports the topic
    // as already closed, which counts as finalized), while a rename applied
    // without the close would trip the icon guard below and skip the close
    // forever on the next terminal emission.
    await api.closeForumTopic(binding.chatId, binding.threadId);
    if (nextName && nextName !== currentName) {
      await api.editForumTopic(binding.chatId, binding.threadId, { name: nextName });
      updateTopicBindingNameBySessionId(childSessionId, nextName);
    }
    logger.info(
      `[SubagentTopic] Closed transcript topic for subagent ${childSessionId}: thread=${binding.threadId}`,
    );
    return true;
  } catch (error) {
    if (isAlreadyFinalizedError(error)) {
      updateTopicBindingNameBySessionId(childSessionId, nextName);
      return true;
    }
    if (error instanceof RateLimitExceededError || parseRetryAfterMs(error) !== null) {
      logger.warn("[SubagentTopic] Transcript finalize rate limited, retrying once later:", {
        childSessionId,
      });
      scheduleFinalizeRetry(api, childSessionId, status, description);
    } else {
      logger.error("[SubagentTopic] Failed to finalize subagent topic:", error);
    }
    return false;
  }
}

/**
 * One-shot delayed retry for 429-killed finalizes. Terminal emissions may
 * never repeat, so without this a storm leaves the transcript open (and
 * editable) forever. Retried once: still failing means waiting for the next
 * emission, same as before.
 */
const FINALIZE_RETRY_DELAY_MS = 60_000;
const pendingFinalizeRetries = new Set<string>();

function scheduleFinalizeRetry(
  api: ForumTopicApi,
  childSessionId: string,
  status: "completed" | "error",
  description: string,
): void {
  if (pendingFinalizeRetries.has(childSessionId)) {
    return;
  }
  pendingFinalizeRetries.add(childSessionId);
  if (pendingFinalizeRetries.size > 200) {
    const oldest = pendingFinalizeRetries.values().next();
    if (!oldest.done) {
      pendingFinalizeRetries.delete(oldest.value);
    }
  }
  setTimeout(() => {
    pendingFinalizeRetries.delete(childSessionId);
    void finalizeSubagentTopic(api, childSessionId, status, description).catch((retryError) => {
      logger.warn("[SubagentTopic] Scheduled finalize retry failed:", {
        childSessionId,
        retryError,
      });
    });
  }, FINALIZE_RETRY_DELAY_MS).unref?.();
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
