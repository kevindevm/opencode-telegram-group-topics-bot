import { logger } from "../utils/logger.js";

export const TRUST_LEVEL = {
  ASK: "ask",
  EDITS: "edits",
  ALL: "all",
} as const;

export type TrustLevel = (typeof TRUST_LEVEL)[keyof typeof TRUST_LEVEL];

const TRUST_TTL_MS = 4 * 60 * 60 * 1000;

const trustBySession = new Map<string, { level: TrustLevel; at: number }>();

/** File mutations and reads auto-approved at the `edits` level. */
const EDIT_SAFE_PERMISSIONS = new Set([
  "read",
  "list",
  "glob",
  "grep",
  "lsp",
  "edit",
  "write",
  "apply_patch",
]);

export function isTrustLevel(value: string): value is TrustLevel {
  return value === TRUST_LEVEL.ASK || value === TRUST_LEVEL.EDITS || value === TRUST_LEVEL.ALL;
}

export function setTrustLevel(sessionId: string, level: TrustLevel): void {
  if (!sessionId) {
    return;
  }

  if (level === TRUST_LEVEL.ASK) {
    trustBySession.delete(sessionId);
    return;
  }

  trustBySession.set(sessionId, { level, at: Date.now() });
  logger.info(`[TrustManager] Trust level for session ${sessionId}: ${level}`);
  pruneExpiredTrustLevels();
}

const MAX_TRUST_ENTRIES = 1000;

/** Evicts expired entries (and oldest-first beyond the cap) so abandoned sessions never accumulate. */
function pruneExpiredTrustLevels(): void {
  const now = Date.now();
  for (const [sessionId, entry] of trustBySession) {
    if (now - entry.at >= TRUST_TTL_MS) {
      trustBySession.delete(sessionId);
    }
  }

  while (trustBySession.size > MAX_TRUST_ENTRIES) {
    const oldest = trustBySession.keys().next();
    if (oldest.done) {
      return;
    }

    trustBySession.delete(oldest.value);
  }
}

export function getTrustLevel(sessionId: string): TrustLevel {
  pruneExpiredTrustLevels();
  const entry = trustBySession.get(sessionId);
  if (!entry) {
    return TRUST_LEVEL.ASK;
  }

  if (Date.now() - entry.at >= TRUST_TTL_MS) {
    trustBySession.delete(sessionId);
    return TRUST_LEVEL.ASK;
  }

  return entry.level;
}

export function clearTrustLevel(sessionId: string): void {
  trustBySession.delete(sessionId);
}

export function isAutoAllowed(level: TrustLevel, permission: string): boolean {
  if (level === TRUST_LEVEL.ALL) {
    return true;
  }

  if (level === TRUST_LEVEL.EDITS) {
    return EDIT_SAFE_PERMISSIONS.has(permission);
  }

  return false;
}

export function __resetTrustForTests(): void {
  trustBySession.clear();
}
