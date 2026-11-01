import { assistantRunState } from "./assistant-run-state.js";
import { getStoredAgent } from "../agent/manager.js";
import { getStoredModel } from "../model/manager.js";
import { getTopicBindingBySessionId } from "../topic/manager.js";
import { TOPIC_SESSION_STATUS } from "../settings/manager.js";
import { SCOPE_CONTEXT, createScopeKeyFromParams } from "./scope.js";
import { logger } from "../utils/logger.js";

type LiveEvent = {
  type: string;
  properties?: unknown;
};

function activeBindingScopeKey(sessionId: string): string | null {
  const binding = getTopicBindingBySessionId(sessionId);
  if (
    !binding ||
    binding.ephemeral ||
    (binding.status !== TOPIC_SESSION_STATUS.ACTIVE &&
      binding.status !== TOPIC_SESSION_STATUS.ABANDONED)
  ) {
    return null;
  }
  return createScopeKeyFromParams({
    chatId: binding.chatId,
    threadId: binding.threadId,
    context: SCOPE_CONTEXT.GROUP_TOPIC,
  });
}

function startRunIfMissing(sessionId: string, scopeKey: string, reason: string): void {
  if (!sessionId || assistantRunState.getRun(sessionId)) {
    return;
  }
  const storedModel = getStoredModel(scopeKey);
  assistantRunState.startRun(sessionId, {
    startedAt: Date.now(),
    configuredAgent: getStoredAgent(scopeKey),
    configuredProviderID: storedModel.providerID,
    configuredModelID: storedModel.modelID,
  });
  logger.debug("[AssistantRun] Opened opportunistic run clock", { sessionId, reason, scopeKey });
}

/**
 * Start a missing run clock for turns from another client or after a restart.
 * Never restart an existing run.
 */
export function ensureAssistantRunForLiveEvent(event: LiveEvent): void {
  if (!event || event.type !== "session.status") {
    return;
  }
  const properties = event.properties as
    | { sessionID?: unknown; status?: { type?: unknown } }
    | undefined;
  const sessionId = typeof properties?.sessionID === "string" ? properties.sessionID : null;
  if (!sessionId || properties?.status?.type !== "busy") {
    return;
  }
  const scopeKey = activeBindingScopeKey(sessionId);
  if (!scopeKey) {
    return;
  }
  startRunIfMissing(sessionId, scopeKey, "session-status-busy");
}

/**
 * Backstop for tokens with no run record. Starts the clock if the busy
 * event was missed.
 */
export function ensureAssistantRunForTokens(sessionId: string, scopeKey: string): void {
  startRunIfMissing(sessionId, scopeKey, "tokens-without-run");
}
