import { logger } from "../../utils/logger.js";

export interface StalledChain {
  owner: string;
  sessionId: string;
  ageMs: number;
}

/**
 * Watchdog for per-session promise chains (final delivery, live stream).
 * A task that never settles wedges every later delivery for that session
 * while direct sends keep flowing, so the topic goes silent with no error
 * anywhere. The watch only observes and shouts: it never aborts work, on
 * purpose, because a 429 storm can legitimately keep a delivery busy for
 * minutes.
 */
export class ChainStallWatch {
  private readonly startedAt = new Map<string, number>();
  private readonly warnedFor = new Set<string>();
  private started = false;

  constructor(
    private readonly owner: string,
    private readonly stallMs: number = 60_000,
    private readonly intervalMs: number = 30_000,
  ) {}

  markStart(sessionId: string, now: number = Date.now()): void {
    if (!sessionId) {
      return;
    }
    this.startedAt.set(sessionId, now);
    this.warnedFor.delete(sessionId);
  }

  markDone(sessionId: string): void {
    if (!sessionId) {
      return;
    }
    this.startedAt.delete(sessionId);
    this.warnedFor.delete(sessionId);
  }

  /**
   * Sessions whose running task outlived the stall budget. Each stuck
   * task is reported once; a fresh task re-arms it.
   */
  checkStalled(now: number = Date.now()): StalledChain[] {
    const stalled: StalledChain[] = [];
    for (const [sessionId, startedAt] of this.startedAt) {
      const ageMs = now - startedAt;
      if (ageMs < this.stallMs || this.warnedFor.has(sessionId)) {
        continue;
      }
      this.warnedFor.add(sessionId);
      stalled.push({ owner: this.owner, sessionId, ageMs });
    }
    return stalled;
  }

  /** Starts the periodic loud check. Idempotent; safe to call twice. */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    const timer = setInterval(() => {
      for (const stalled of this.checkStalled()) {
        logger.error(`[${stalled.owner}] Session delivery chain stalled`, {
          sessionId: stalled.sessionId,
          ageSec: Math.round(stalled.ageMs / 1000),
        });
      }
    }, this.intervalMs);
    (timer as unknown as { unref?: () => void }).unref?.();
  }
}
