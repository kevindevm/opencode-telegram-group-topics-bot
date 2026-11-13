import { logger } from "../utils/logger.js";
import { RateLimitExceededError } from "./telegram-rate-limiter.js";
import type { Question } from "../question/types.js";
import type { PermissionRequest } from "../permission/types.js";
import type {
  SessionRetryInfo,
  SubagentInfo,
  ToolFileInfo,
  ToolInfo,
} from "../summary/aggregator.js";

export type SessionOutputAction =
  | {
      kind: "assistant_update";
      sessionId: string;
      messageId: string;
      text: string;
    }
  | {
      kind: "assistant_complete";
      sessionId: string;
      messageId: string;
      text: string;
    }
  | {
      kind: "tool";
      sessionId: string;
      toolInfo: ToolInfo;
      visibleToUser: boolean;
    }
  | {
      kind: "subagent";
      sessionId: string;
      subagents: SubagentInfo[];
      visibleToUser: boolean;
    }
  | {
      kind: "tool_file";
      sessionId: string;
      fileInfo: ToolFileInfo;
    }
  | {
      kind: "question";
      sessionId: string;
      questions: Question[];
      requestId: string;
    }
  | {
      kind: "permission";
      sessionId: string;
      request: PermissionRequest;
    }
  | {
      kind: "thinking";
      sessionId: string;
      visibleToUser: boolean;
    }
  | {
      kind: "session_idle";
      sessionId: string;
    }
  | {
      kind: "session_error";
      sessionId: string;
      message: string;
    }
  | {
      kind: "session_retry";
      sessionId: string;
      retryInfo: SessionRetryInfo;
    };

interface SessionOutputActionHandlers {
  onAssistantUpdate: (
    action: Extract<SessionOutputAction, { kind: "assistant_update" }>,
  ) => Promise<void>;
  onAssistantComplete: (
    action: Extract<SessionOutputAction, { kind: "assistant_complete" }>,
  ) => Promise<void>;
  onTool: (action: Extract<SessionOutputAction, { kind: "tool" }>) => Promise<void>;
  onSubagent: (action: Extract<SessionOutputAction, { kind: "subagent" }>) => Promise<void>;
  onToolFile: (action: Extract<SessionOutputAction, { kind: "tool_file" }>) => Promise<void>;
  onQuestion: (action: Extract<SessionOutputAction, { kind: "question" }>) => Promise<void>;
  onPermission: (action: Extract<SessionOutputAction, { kind: "permission" }>) => Promise<void>;
  onThinking: (action: Extract<SessionOutputAction, { kind: "thinking" }>) => Promise<void>;
  onSessionError: (
    action: Extract<SessionOutputAction, { kind: "session_error" }>,
  ) => Promise<void>;
  onSessionRetry: (
    action: Extract<SessionOutputAction, { kind: "session_retry" }>,
  ) => Promise<void>;
}

interface SessionOutputCoordinatorOptions {
  settleMs: number;
  onFinalizeSession: (
    sessionId: string,
    pendingCompletionText: string | null,
    isLast: boolean,
  ) => Promise<boolean>;
  onFinalDeliveryCommitted: (sessionId: string) => Promise<void>;
  /** Optional: invoked once when the give-up budget is exhausted and the pending turn is dropped. */
  onFinalDeliveryGiveUp?: (sessionId: string) => Promise<void> | void;
  /** Optional best-effort plain-text notice before a non-429 give-up drop. */
  onFinalDeliveryNotice?: (sessionId: string) => Promise<void> | void;
  handlers: SessionOutputActionHandlers;
}

interface PendingAssistantCompletion {
  text: string;
}

export class SessionOutputCoordinator {
  private readonly settleMs: number;
  private readonly onFinalizeSession: (
    sessionId: string,
    pendingCompletionText: string | null,
    isLast: boolean,
  ) => Promise<boolean>;
  private readonly onFinalDeliveryCommitted: (sessionId: string) => Promise<void>;
  private readonly onFinalDeliveryGiveUp?: (sessionId: string) => Promise<void> | void;
  private readonly onFinalDeliveryNotice?: (sessionId: string) => Promise<void> | void;
  private readonly handlers: SessionOutputActionHandlers;
  private readonly sessionTasks = new Map<string, Promise<void>>();
  private readonly finalDeliveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingFinalDeliveries = new Set<string>();
  private readonly finalDeliveryInFlight = new Set<string>();
  /**
   * A settle timer that fires while a round is already running must not be
   * lost: the round may finish with nothing left to deliver and no new
   * activity to re-arm it, so the flag below requests one more round.
   */
  private readonly rescheduleAfterFlight = new Set<string>();
  /**
   * Completions queue up in arrival order. Deliver all pending texts on the
   * next idle, not just the latest.
   */
  private readonly pendingAssistantCompletions = new Map<string, PendingAssistantCompletion[]>();
  private readonly activityVersions = new Map<string, number>();

  constructor(options: SessionOutputCoordinatorOptions) {
    this.settleMs = options.settleMs;
    this.onFinalizeSession = options.onFinalizeSession;
    this.onFinalDeliveryCommitted = options.onFinalDeliveryCommitted;
    this.onFinalDeliveryGiveUp = options.onFinalDeliveryGiveUp;
    this.onFinalDeliveryNotice = options.onFinalDeliveryNotice;
    this.handlers = options.handlers;
  }

  dispatch(action: SessionOutputAction): void {
    if (this.shouldMarkActivity(action)) {
      this.markActivity(action.sessionId);
    }

    switch (action.kind) {
      case "assistant_update":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onAssistantUpdate(action);
        });
        return;
      case "assistant_complete":
        this.trackAssistantCompletion(action.sessionId, action.text);
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onAssistantComplete(action);
        });
        return;
      case "tool":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onTool(action);
        });
        return;
      case "subagent":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onSubagent(action);
        });
        return;
      case "tool_file":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onToolFile(action);
        });
        return;
      case "question":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onQuestion(action);
        });
        return;
      case "permission":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onPermission(action);
        });
        return;
      case "thinking":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onThinking(action);
        });
        return;
      case "session_idle":
        this.scheduleFinalDelivery(action.sessionId);
        return;
      case "session_error":
        this.clearSession(action.sessionId);
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onSessionError(action);
        });
        return;
      case "session_retry":
        this.enqueue(action.sessionId, async () => {
          await this.handlers.onSessionRetry(action);
        });
        return;
    }
  }

  enqueue(sessionId: string, task: () => Promise<void>): void {
    void this.enqueueTask(sessionId, task);
  }

  /**
   * Delivers queued completions ahead of a new prompt. Runs through the same
   * per-session chain, so a turn stuck in 429 backoff still delays the next
   * prompt: that ordering is what keeps answers and follow-ups sequential.
   */
  async flushPendingFinalDelivery(sessionId: string): Promise<boolean> {
    const hasScheduledDelivery = this.pendingFinalDeliveries.has(sessionId);
    const hasQueuedCompletions = (this.pendingAssistantCompletions.get(sessionId)?.length ?? 0) > 0;
    if (!hasScheduledDelivery && !hasQueuedCompletions) {
      return false;
    }

    if (this.finalDeliveryInFlight.has(sessionId)) {
      return true;
    }

    // A swallowed `session.idle` leaves queued completions with no scheduled
    // delivery behind; flushing for the next prompt must still deliver them
    // instead of waiting for an idle that already happened.
    this.pendingFinalDeliveries.add(sessionId);
    this.clearFinalDeliveryTimer(sessionId);
    this.finalDeliveryInFlight.add(sessionId);
    try {
      return await this.enqueueTask(sessionId, async () => {
        try {
          return await this.runFinalDelivery(sessionId);
        } finally {
          this.finalDeliveryInFlight.delete(sessionId);
        }
      });
    } catch (error) {
      this.finalDeliveryInFlight.delete(sessionId);
      throw error;
    }
  }

  private enqueueTask<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previousTask: Promise<unknown> = this.sessionTasks.get(sessionId) ?? Promise.resolve();
    const nextTask = previousTask
      .catch(() => undefined)
      .then(() => task())
      .catch((error) => {
        logger.error("[Bot] Session delivery task failed", {
          sessionId,
          error,
        });
        throw error;
      })
      .finally(() => {
        if (this.sessionTasks.get(sessionId) === trackedTask) {
          this.sessionTasks.delete(sessionId);
        }
      });

    const trackedTask = nextTask.then(() => undefined).catch(() => undefined);
    this.sessionTasks.set(sessionId, trackedTask);
    return nextTask;
  }

  markActivity(sessionId: string): void {
    if (!sessionId) {
      return;
    }

    const nextVersion = (this.activityVersions.get(sessionId) ?? 0) + 1;
    this.activityVersions.set(sessionId, nextVersion);

    if (!this.pendingFinalDeliveries.has(sessionId)) {
      return;
    }

    this.clearFinalDeliveryTimer(sessionId);
    this.scheduleFinalDelivery(sessionId);
  }

  scheduleFinalDelivery(sessionId: string, delayMs: number = this.settleMs): void {
    if (!sessionId) {
      return;
    }

    this.pendingFinalDeliveries.add(sessionId);
    this.clearFinalDeliveryTimer(sessionId);
    const expectedVersion = this.activityVersions.get(sessionId) ?? 0;

    const timer = setTimeout(() => {
      this.finalDeliveryTimers.delete(sessionId);
      if (this.finalDeliveryInFlight.has(sessionId)) {
        this.rescheduleAfterFlight.add(sessionId);
        return;
      }
      this.finalDeliveryInFlight.add(sessionId);
      void this.enqueueTask(sessionId, async () => {
        try {
          if (!this.pendingFinalDeliveries.has(sessionId)) {
            return false;
          }

          const currentVersion = this.activityVersions.get(sessionId) ?? 0;
          if (currentVersion !== expectedVersion) {
            this.scheduleFinalDelivery(sessionId);
            return false;
          }

          return await this.runFinalDelivery(sessionId);
        } finally {
          this.finalDeliveryInFlight.delete(sessionId);
          if (
            this.rescheduleAfterFlight.delete(sessionId) &&
            this.pendingFinalDeliveries.has(sessionId)
          ) {
            this.scheduleFinalDelivery(sessionId);
          }
        }
      });
    }, delayMs);

    this.finalDeliveryTimers.set(sessionId, timer);
  }

  cancelFinalDelivery(sessionId: string): void {
    this.clearFinalDeliveryTimer(sessionId);
    this.pendingFinalDeliveries.delete(sessionId);
    this.activityVersions.delete(sessionId);
    this.finalDeliveryAttempts.delete(sessionId);
    this.rateLimitStreaks.delete(sessionId);
    this.rateLimitStreakStartedAt.delete(sessionId);
    this.completionOverflowDrops.delete(sessionId);
    this.finalDeliveryInFlight.delete(sessionId);
    this.rescheduleAfterFlight.delete(sessionId);
  }

  clearSession(sessionId: string): void {
    this.cancelFinalDelivery(sessionId);
    this.pendingAssistantCompletions.delete(sessionId);
    // Drop the delivery chain so post-clear work never waits behind a
    // stale (possibly hung) task from before the reset.
    this.sessionTasks.delete(sessionId);
  }

  clearAll(): void {
    for (const timer of this.finalDeliveryTimers.values()) {
      clearTimeout(timer);
    }

    this.finalDeliveryTimers.clear();
    this.pendingFinalDeliveries.clear();
    this.pendingAssistantCompletions.clear();
    this.activityVersions.clear();
    this.rateLimitStreaks.clear();
    this.rateLimitStreakStartedAt.clear();
    this.finalDeliveryAttempts.clear();
    this.completionOverflowDrops.clear();
    this.finalDeliveryInFlight.clear();
    this.rescheduleAfterFlight.clear();
    this.sessionTasks.clear();
  }

  private clearFinalDeliveryTimer(sessionId: string): void {
    const timer = this.finalDeliveryTimers.get(sessionId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.finalDeliveryTimers.delete(sessionId);
  }

  private trackAssistantCompletion(sessionId: string, text: string): void {
    let normalizedText = text.trim();
    if (!sessionId || !normalizedText) {
      return;
    }

    let dropped = this.completionOverflowDrops.get(sessionId) ?? 0;
    const queue = this.pendingAssistantCompletions.get(sessionId) ?? [];
    queue.push({ text: normalizedText });
    // Bound the queue so a session that never idles cannot grow it without
    // end; oldest-first is dropped loudly, newest work is preserved.
    while (queue.length > SessionOutputCoordinator.MAX_QUEUED_COMPLETIONS) {
      queue.shift();
      dropped += 1;
      logger.error(
        `[Bot] Session completion queue overflow; dropping oldest completion for ${sessionId}`,
      );
    }
    if (dropped > 0) {
      const shown = Math.min(dropped, SessionOutputCoordinator.MAX_OVERFLOW_MARKER_COUNT);
      const suffix = dropped > SessionOutputCoordinator.MAX_OVERFLOW_MARKER_COUNT ? "+" : "";
      normalizedText = `[system notice: ${shown}${suffix} earlier updates dropped] ${normalizedText}`;
      queue[queue.length - 1] = { text: normalizedText };
      this.completionOverflowDrops.set(sessionId, dropped);
    }
    this.pendingAssistantCompletions.set(sessionId, queue);
  }

  private static readonly MAX_QUEUED_COMPLETIONS = 20;
  private static readonly MAX_OVERFLOW_MARKER_COUNT = 99;

  private readonly finalDeliveryAttempts = new Map<string, number>();
  private static readonly MAX_FINAL_DELIVERY_ATTEMPTS = 50;
  /**
   * Delay before retrying a rate-limited final delivery. Long on purpose:
   * Telegram flood waits are measured in seconds-to-minutes, and hammering
   * every settle interval only extends them.
   */
  private static readonly RATE_LIMIT_RETRY_DELAY_MS = 15_000;
  /** Consecutive rate-limited final deliveries per session (log throttling). */
  private readonly rateLimitStreaks = new Map<string, number>();
  /** When the current consecutive 429 streak started; the give-up cap is wall-clock. */
  private readonly rateLimitStreakStartedAt = new Map<string, number>();
  /** Dropped completion counts pending a gap marker on the next tracked text. */
  private readonly completionOverflowDrops = new Map<string, number>();
  /**
   * Wall-clock cap for consecutive rate limits: rounds vary wildly in
   * length (each already includes the queue's own backoff), so counting
   * rounds cannot bound real time. Past this the ban is not transient for
   * this turn: drop it loudly instead of looking hung forever. The non-429
   * notice hook fires, so the user is told instead of left waiting.
   */
  private static readonly MAX_CONSECUTIVE_RATE_LIMIT_MS = 10 * 60 * 1000;

  private async runFinalDelivery(sessionId: string): Promise<boolean> {
    const snapshot = this.pendingAssistantCompletions.get(sessionId) ?? [];
    // Take the snapshot out of the queue: arrivals during delivery append a
    // fresh queue and trigger another round instead of being committed early.
    this.pendingAssistantCompletions.delete(sessionId);

    const deliverNext = async (text: string | null, isLast: boolean): Promise<boolean> => {
      let finalized: boolean;
      try {
        finalized = await this.onFinalizeSession(sessionId, text, isLast);
      } catch (error) {
        // Telegram flood control is transient: keep the turn queued and
        // retry with a long delay instead of spending the give-up budget.
        // Dropping here is what froze topics after a 429 storm even though
        // the retry_after window had long passed.
        if (error instanceof RateLimitExceededError) {
          const streak = (this.rateLimitStreaks.get(sessionId) ?? 0) + 1;
          this.rateLimitStreaks.set(sessionId, streak);
          if (!this.rateLimitStreakStartedAt.has(sessionId)) {
            this.rateLimitStreakStartedAt.set(sessionId, Date.now());
          }
          const streakMs = Date.now() - (this.rateLimitStreakStartedAt.get(sessionId) ?? Date.now());
          if (streak === 1 || streak % 10 === 0) {
            logger.warn("[Bot] Session final delivery rate-limited; keeping it queued", {
              sessionId,
              streak,
            });
          }
          if (streakMs >= SessionOutputCoordinator.MAX_CONSECUTIVE_RATE_LIMIT_MS) {
            logger.error(
              `[Bot] Session final delivery rate-limited for ${Math.round(streakMs / 1000)}s; giving up to avoid an endless retry loop`,
              { sessionId, streak },
            );
            this.rateLimitStreaks.delete(sessionId);
            this.rateLimitStreakStartedAt.delete(sessionId);
            this.finalDeliveryAttempts.set(
              sessionId,
              SessionOutputCoordinator.MAX_FINAL_DELIVERY_ATTEMPTS - 1,
            );
            this.noteFinalDeliveryAttempt(sessionId, error);
            return false;
          }
          if (!this.pendingFinalDeliveries.has(sessionId)) {
            return false;
          }
          this.scheduleFinalDelivery(sessionId, SessionOutputCoordinator.RATE_LIMIT_RETRY_DELAY_MS);
          return false;
        }
        if (!this.noteFinalDeliveryAttempt(sessionId, error)) {
          return false;
        }
        if (!this.pendingFinalDeliveries.has(sessionId)) {
          return false;
        }
        logger.error("[Bot] Session final delivery failed; will retry", { sessionId }, error);
        this.scheduleFinalDelivery(sessionId);
        return false;
      }
      if (!finalized) {
        if (!this.noteFinalDeliveryAttempt(sessionId)) {
          return false;
        }
        if (!this.pendingFinalDeliveries.has(sessionId)) {
          return false;
        }
        this.scheduleFinalDelivery(sessionId);
        return false;
      }
      return true;
    };

    if (snapshot.length === 0) {
      // No turn text, but the flush still repaints pin/keyboard state.
      if (!(await deliverNext(null, true))) {
        return false;
      }
    } else {
      for (let index = 0; index < snapshot.length; index++) {
        // Only the very last message of the turn carries any footer;
        // earlier ones go out plain. Arrivals queued mid-delivery mean
        // this batch is not the last, so none of them takes the footer.
        const arrivalsPending = (this.pendingAssistantCompletions.get(sessionId)?.length ?? 0) > 0;
        const isLast =
          index === snapshot.length - 1 && !arrivalsPending;
        if (!(await deliverNext(snapshot[index]?.text ?? null, isLast))) {
          if (!this.pendingFinalDeliveries.has(sessionId)) {
            return false;
          }
          // Keep the undelivered tail ahead of any arrivals from the retry
          // window so turn order is preserved.
          const remaining = snapshot.slice(index).filter((item) => item.text.trim().length > 0);
          const arrivals = this.pendingAssistantCompletions.get(sessionId) ?? [];
          this.pendingAssistantCompletions.set(sessionId, [...remaining, ...arrivals]);
          return false;
        }
      }
    }

    const arrivals = this.pendingAssistantCompletions.get(sessionId) ?? [];
    if (arrivals.length > 0) {
      this.scheduleFinalDelivery(sessionId);
      return false;
    }

    this.finalDeliveryAttempts.delete(sessionId);
    this.rateLimitStreaks.delete(sessionId);
    this.rateLimitStreakStartedAt.delete(sessionId);
    this.pendingFinalDeliveries.delete(sessionId);
    this.activityVersions.delete(sessionId);
    this.pendingAssistantCompletions.delete(sessionId);
    this.completionOverflowDrops.delete(sessionId);
    await this.onFinalDeliveryCommitted(sessionId);
    return true;
  }

  /**
   * Counts consecutive failed delivery attempts so a permanently failing
   * session (deleted topic, revoked token) does not retry forever. Returns
   * false once the budget is exhausted; the pending delivery is dropped with
   * a loud error instead of looping silently every settle interval.
   */
  private noteFinalDeliveryAttempt(sessionId: string, error?: unknown): boolean {
    const attempts = (this.finalDeliveryAttempts.get(sessionId) ?? 0) + 1;
    this.finalDeliveryAttempts.set(sessionId, attempts);
    if (attempts < SessionOutputCoordinator.MAX_FINAL_DELIVERY_ATTEMPTS) {
      return true;
    }
    logger.error(
      `[Bot] Session final delivery failed ${attempts} times; giving up to avoid an endless retry loop`,
      { sessionId, error },
    );
    this.finalDeliveryAttempts.delete(sessionId);
    this.rateLimitStreaks.delete(sessionId);
    this.rateLimitStreakStartedAt.delete(sessionId);
    this.pendingFinalDeliveries.delete(sessionId);
    this.pendingAssistantCompletions.delete(sessionId);
    this.completionOverflowDrops.delete(sessionId);
    // The turn is dropped: clear any run record so its clock can never leak
    // into a later, unrelated delivery.
    void (async () => {
      // Always try the notice, including after a 429-cap give-up: it goes
      // through the queued send, so it lands when the storm passes instead
      // of leaving the user staring at a frozen topic.
      try {
        await this.onFinalDeliveryNotice?.(sessionId);
      } catch {
        // Best effort only: a failed notice must not break the give-up.
      }
      try {
        await this.onFinalDeliveryGiveUp?.(sessionId);
      } catch (giveUpError) {
        logger.warn("[Bot] Final delivery give-up hook failed", {
          sessionId,
          error: giveUpError,
        });
      }
    })();
    return false;
  }

  private shouldMarkActivity(action: SessionOutputAction): boolean {
    switch (action.kind) {
      case "assistant_update":
      case "assistant_complete":
      case "tool_file":
      case "question":
      case "permission":
        return true;
      case "tool":
      case "subagent":
      case "thinking":
        return action.visibleToUser;
      case "session_retry":
        return true;
      case "session_idle":
      case "session_error":
        return false;
    }
  }
}
