import { getTopicBindingBySessionId } from "../topic/manager.js";
import { TOPIC_SESSION_STATUS } from "../settings/manager.js";
import { consumeForwardedPrompt } from "../session/forwarded-prompts.js";

export interface PcUserMirrorTarget {
  chatId: number;
  threadId: number | null;
}

export interface PcUserMirrorPayload {
  sessionId: string;
  messageId: string;
  text: string;
  target: PcUserMirrorTarget;
}

const pendingPcUserMessages = new Set<string>();
const mirroredPcUserMessageIds = new Set<string>();

const MAX_PENDING = 200;
const MAX_MIRRORED = 1000;

function messageKey(sessionId: string, messageId: string): string {
  return `${sessionId}:${messageId}`;
}

function pruneCappedSet(set: Set<string>, cap: number): void {
  while (set.size > cap) {
    const oldest = set.values().next();
    if (oldest.done) {
      return;
    }

    set.delete(oldest.value);
  }
}

/**
 * Notes a user-role message announcement so the text part that follows it
 * can be attributed. Called for `message.updated` events with role "user".
 */
export function registerPcUserMessage(sessionId: string, messageId: string): void {
  if (!sessionId || !messageId || mirroredPcUserMessageIds.has(messageId)) {
    return;
  }

  pendingPcUserMessages.add(messageKey(sessionId, messageId));
  pruneCappedSet(pendingPcUserMessages, MAX_PENDING);
}

/**
 * Matches a text part against a pending user message. Returns the mirror
 * payload when the part completes a mirrorable PC prompt, otherwise null.
 * Skips prompts the bot forwarded itself (already visible in Telegram).
 */
export function takePcUserText(
  sessionId: string,
  messageId: string,
  text: string,
): PcUserMirrorPayload | null {
  if (!sessionId || !messageId) {
    return null;
  }

  const key = messageKey(sessionId, messageId);
  if (!pendingPcUserMessages.has(key) || mirroredPcUserMessageIds.has(messageId)) {
    return null;
  }

  pendingPcUserMessages.delete(key);

  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  if (consumeForwardedPrompt(sessionId, normalized)) {
    return null;
  }

  const binding = getTopicBindingBySessionId(sessionId);
  // Abandoned means a past /abort stopped streaming, not that the topic is
  // gone: fresh PC activity still mirrors there. Closed/stale bindings point
  // at deleted topics, so those stay silent (matching the router, which also
  // resolves them and lets the send fail loudly instead).
  if (
    !binding ||
    (binding.status !== TOPIC_SESSION_STATUS.ACTIVE &&
      binding.status !== TOPIC_SESSION_STATUS.ABANDONED)
  ) {
    return null;
  }

  mirroredPcUserMessageIds.add(messageId);
  pruneCappedSet(mirroredPcUserMessageIds, MAX_MIRRORED);

  return {
    sessionId,
    messageId,
    text: normalized,
    target: { chatId: binding.chatId, threadId: binding.threadId },
  };
}

export function __resetPcUserMirrorForTests(): void {
  pendingPcUserMessages.clear();
  mirroredPcUserMessageIds.clear();
}
