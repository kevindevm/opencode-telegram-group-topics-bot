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

/** Recently mirrored (session, text) pairs to avoid double-mirroring the same prompt. */
const mirroredPcTexts = new Map<string, number>();
const MIRRORED_TEXT_TTL_MS = 90 * 1000;
const MAX_MIRRORED_TEXTS = 500;

function mirroredTextKey(sessionId: string, text: string): string {
  return `${sessionId}:${text}`;
}

function pruneMirroredTexts(now: number): void {
  for (const [key, at] of mirroredPcTexts) {
    if (now - at >= MIRRORED_TEXT_TTL_MS) {
      mirroredPcTexts.delete(key);
    }
  }

  while (mirroredPcTexts.size > MAX_MIRRORED_TEXTS) {
    const oldest = mirroredPcTexts.keys().next();
    if (oldest.done) {
      return;
    }
    mirroredPcTexts.delete(oldest.value);
  }
}

/**
 * Claims a (session, text) pair for mirroring. Returns false when the same
 * text was already mirrored recently (e.g. inbox delivery and run-start poll
 * racing for the same PC prompt).
 */
export function claimPcTextMirror(sessionId: string, text: string): boolean {
  const normalized = text.trim();
  if (!sessionId || !normalized) {
    return false;
  }

  const now = Date.now();
  pruneMirroredTexts(now);

  const key = mirroredTextKey(sessionId, normalized);
  if (mirroredPcTexts.has(key)) {
    return false;
  }

  mirroredPcTexts.set(key, now);
  return true;
}

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

/** Peeks without consuming: is this text a prompt the bot itself forwarded? */
export function isForwardedPrompt(sessionId: string, text: string): boolean {
  const entry = forwardedBySession.get(sessionId);
  if (!entry) {
    return false;
  }

  if (Date.now() - entry.at >= FORWARDED_TTL_MS) {
    forwardedBySession.delete(sessionId);
    return false;
  }

  return entry.text === text.trim();
}

export function unmarkForwardedPrompt(sessionId: string, text: string): void {
  const entry = forwardedBySession.get(sessionId);
  if (!entry) {
    return;
  }

  if (entry.text === text.trim()) {
    forwardedBySession.delete(sessionId);
  }
}

export function __resetForwardedPromptsForTests(): void {
  forwardedBySession.clear();
  mirroredPcTexts.clear();
}
