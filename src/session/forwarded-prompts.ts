/**
 * Tracks prompts the bot itself forwarded to OpenCode so the PC user-message
 * mirror can tell them apart from prompts typed on another client.
 *
 * Entries are one-shot: the first matching user message consumes the mark.
 * Matches expire quickly; a same-text prompt arriving much later is treated
 * as a new, mirrorable message.
 */
const forwardedBySession = new Map<string, { text: string; at: number }>();

const FORWARDED_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;

export function markForwardedPrompt(sessionId: string, text: string): void {
  const normalized = text.trim();
  if (!sessionId || !normalized) {
    return;
  }

  if (forwardedBySession.size >= MAX_ENTRIES) {
    const oldest = forwardedBySession.keys().next();
    if (!oldest.done) {
      forwardedBySession.delete(oldest.value);
    }
  }

  forwardedBySession.set(sessionId, { text: normalized, at: Date.now() });
}

export function consumeForwardedPrompt(sessionId: string, text: string): boolean {
  const entry = forwardedBySession.get(sessionId);
  if (!entry) {
    return false;
  }

  if (Date.now() - entry.at >= FORWARDED_TTL_MS) {
    forwardedBySession.delete(sessionId);
    return false;
  }

  if (entry.text !== text.trim()) {
    return false;
  }

  forwardedBySession.delete(sessionId);
  return true;
}

export function __resetForwardedPromptsForTests(): void {
  forwardedBySession.clear();
}
