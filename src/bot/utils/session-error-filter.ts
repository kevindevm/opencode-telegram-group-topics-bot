const OPERATION_ABORTED_MARKERS = [
  "the operation was aborted",
  "operation was aborted",
  "aborterror",
];

export function isOperationAbortedSessionError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return OPERATION_ABORTED_MARKERS.some((marker) => normalized.includes(marker));
}

const INVALID_REQUEST_MARKERS = [
  "invalid request",
  "invalidrequest",
  "invalid parameters",
  "invalid parameter",
];

export function isInvalidRequestSessionError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return INVALID_REQUEST_MARKERS.some((marker) => normalized.includes(marker));
}

export class SessionErrorThrottle {
  private readonly lastBySession = new Map<string, { message: string; timestamp: number }>();

  /**
   * One entry per session that ever errored: without a cap, sessions that
   * come and go grow this map for the life of the process. Stale entries
   * are harmless for suppression (window check), so oldest-first eviction
   * past the cap is safe.
   */
  private static readonly MAX_TRACKED_SESSIONS = 500;

  constructor(private readonly windowMs: number = 3000) {}

  shouldSuppress(sessionId: string, message: string, now: number = Date.now()): boolean {
    const normalized = message.trim().toLowerCase();
    if (!normalized) {
      return false;
    }

    const previous = this.lastBySession.get(sessionId);
    this.lastBySession.set(sessionId, {
      message: normalized,
      timestamp: now,
    });
    while (this.lastBySession.size > SessionErrorThrottle.MAX_TRACKED_SESSIONS) {
      const oldest = this.lastBySession.keys().next();
      if (oldest.done) {
        break;
      }
      this.lastBySession.delete(oldest.value);
    }

    if (!previous) {
      return false;
    }

    return previous.message === normalized && now - previous.timestamp < this.windowMs;
  }
}
