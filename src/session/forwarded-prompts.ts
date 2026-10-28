/**
 * Tracks prompts the bot itself forwarded to OpenCode so the PC user-message
 * mirror can tell them apart from prompts typed on another client.
 *
 * Entries are one-shot: the first matching user message consumes the mark.
 * Matches expire quickly; a same-text prompt arriving much later is treated
 * as a new, mirrorable message.
 */
interface ForwardedEntry {
  text: string;
  at: number;
}

/**
 * One entry per queued prompt: rapid consecutive prompts must each keep
 * their own mark, otherwise a later mark overwrites the earlier one and the
 * earlier prompt mirrors back as if it came from another client.
 */
const forwardedBySession = new Map<string, ForwardedEntry[]>();

const FORWARDED_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 500;
/** Bound on tracked sessions so dead sessions never accumulate without a final prompt. */
const MAX_SESSIONS = 1000;

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

  if (!forwardedBySession.has(sessionId)) {
    while (forwardedBySession.size >= MAX_SESSIONS) {
      const oldest = forwardedBySession.keys().next();
      if (oldest.done) {
        break;
      }

      forwardedBySession.delete(oldest.value);
    }
  }

  const entries = forwardedBySession.get(sessionId) ?? [];
  entries.push({ text: normalized, at: Date.now() });
  while (entries.length > MAX_ENTRIES) {
    entries.shift();
  }

  forwardedBySession.set(sessionId, entries);
}

/** Drops every mark of a finished session so its entry cannot linger. */
export function clearForwardedPromptsForSession(sessionId: string): void {
  if (!sessionId) {
    return;
  }

  forwardedBySession.delete(sessionId);

  const prefix = `${sessionId}:`;
  for (const key of mirroredPcTexts.keys()) {
    if (key.startsWith(prefix)) {
      mirroredPcTexts.delete(key);
    }
  }
}

function findForwardedEntry(sessionId: string, text: string): number {
  const entries = forwardedBySession.get(sessionId);
  if (!entries) {
    return -1;
  }

  const normalized = text.trim();
  const now = Date.now();
  let found = -1;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (now - entries[index].at >= FORWARDED_TTL_MS) {
      entries.splice(index, 1);
      continue;
    }

    if (found === -1 && entries[index].text === normalized) {
      found = index;
    }
  }

  if (entries.length === 0) {
    forwardedBySession.delete(sessionId);
  }

  return found;
}

export function consumeForwardedPrompt(sessionId: string, text: string): boolean {
  const index = findForwardedEntry(sessionId, text);
  if (index === -1) {
    return false;
  }

  forwardedBySession.get(sessionId)?.splice(index, 1);
  if (forwardedBySession.get(sessionId)?.length === 0) {
    forwardedBySession.delete(sessionId);
  }
  return true;
}

/** Peeks without consuming: is this text a prompt the bot itself forwarded? */
export function isForwardedPrompt(sessionId: string, text: string): boolean {
  return findForwardedEntry(sessionId, text) !== -1;
}

export function unmarkForwardedPrompt(sessionId: string, text: string): void {
  const index = findForwardedEntry(sessionId, text);
  if (index === -1) {
    return;
  }

  forwardedBySession.get(sessionId)?.splice(index, 1);
  if (forwardedBySession.get(sessionId)?.length === 0) {
    forwardedBySession.delete(sessionId);
  }
}

export function __resetForwardedPromptsForTests(): void {
  forwardedBySession.clear();
  mirroredPcTexts.clear();
}
