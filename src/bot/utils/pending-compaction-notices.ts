const pendingCompactionNotices = new Set<string>();

/**
 * Sessions only enter this set on compaction and leave on delivery; a
 * session deleted mid-flow (or an event gap) must not grow it for the life
 * of the process, so evict oldest-first past the cap.
 */
const MAX_PENDING_COMPACTION_NOTICES = 500;

function pruneOverflow(): void {
  while (pendingCompactionNotices.size > MAX_PENDING_COMPACTION_NOTICES) {
    const oldest = pendingCompactionNotices.values().next();
    if (oldest.done) {
      return;
    }
    pendingCompactionNotices.delete(oldest.value);
  }
}

export function markPendingCompactionNotice(sessionId: string): void {
  pendingCompactionNotices.add(sessionId);
  pruneOverflow();
}

export function consumePendingCompactionNotice(sessionId: string): boolean {
  if (!pendingCompactionNotices.has(sessionId)) {
    return false;
  }

  pendingCompactionNotices.delete(sessionId);
  return true;
}

export function clearPendingCompactionNotice(sessionId: string): void {
  pendingCompactionNotices.delete(sessionId);
}
