import { logger } from "../utils/logger.js";
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
  onFinalizeSession: (sessionId: string, pendingCompletionText: string | null) => Promise<boolean>;
  onFinalDeliveryCommitted: (sessionId: string) => Promise<void>;
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
  ) => Promise<boolean>;
  private readonly onFinalDeliveryCommitted: (sessionId: string) => Promise<void>;
  private readonly handlers: SessionOutputActionHandlers;
  private readonly sessionTasks = new Map<string, Promise<void>>();
  private readonly finalDeliveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingFinalDeliveries = new Set<string>();
  /**
   * Completions waiting for the next final delivery, in arrival order. A
   * queue (not a single slot): when an SSE gap swallows `session.idle`, the
   * next idle must deliver every pending turn text, not just the latest —
   * overwriting the slot silently dropped turns and scrambled message order.
   */
  private readonly pendingAssistantCompletions = new Map<string, PendingAssistantCompletion[]>();
  private readonly activityVersions = new Map<string, number>();

  constructor(options: SessionOutputCoordinatorOptions) {
    this.settleMs = options.settleMs;
    this.onFinalizeSession = options.onFinalizeSession;
    this.onFinalDeliveryCommitted = options.onFinalDeliveryCommitted;
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

  async flushPendingFinalDelivery(sessionId: string): Promise<boolean> {
    const hasScheduledDelivery = this.pendingFinalDeliveries.has(sessionId);
    const hasQueuedCompletions = (this.pendingAssistantCompletions.get(sessionId)?.length ?? 0) > 0;
    if (!hasScheduledDelivery && !hasQueuedCompletions) {
      return false;
    }

    // A swallowed `session.idle` leaves queued completions with no scheduled
    // delivery behind; flushing for the next prompt must still deliver them
    // instead of waiting for an idle that already happened.
    this.pendingFinalDeliveries.add(sessionId);
    this.clearFinalDeliveryTimer(sessionId);
    return await this.enqueueTask(sessionId, async () => await this.runFinalDelivery(sessionId));
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

  scheduleFinalDelivery(sessionId: string): void {
    if (!sessionId) {
      return;
    }

    this.pendingFinalDeliveries.add(sessionId);
    this.clearFinalDeliveryTimer(sessionId);
    const expectedVersion = this.activityVersions.get(sessionId) ?? 0;

    const timer = setTimeout(() => {
      this.finalDeliveryTimers.delete(sessionId);
      void this.enqueueTask(sessionId, async () => {
        if (!this.pendingFinalDeliveries.has(sessionId)) {
          return false;
        }

        const currentVersion = this.activityVersions.get(sessionId) ?? 0;
        if (currentVersion !== expectedVersion) {
          this.scheduleFinalDelivery(sessionId);
          return false;
        }

        return await this.runFinalDelivery(sessionId);
      });
    }, this.settleMs);

    this.finalDeliveryTimers.set(sessionId, timer);
  }

  cancelFinalDelivery(sessionId: string): void {
    this.clearFinalDeliveryTimer(sessionId);
    this.pendingFinalDeliveries.delete(sessionId);
    this.activityVersions.delete(sessionId);
    this.finalDeliveryAttempts.delete(sessionId);
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
    const normalizedText = text.trim();
    if (!sessionId || !normalizedText) {
      return;
    }

    const queue = this.pendingAssistantCompletions.get(sessionId) ?? [];
    queue.push({ text: normalizedText });
    // Bound the queue so a session that never idles cannot grow it without
    // end; oldest-first is dropped loudly, newest work is preserved.
    while (queue.length > SessionOutputCoordinator.MAX_QUEUED_COMPLETIONS) {
      queue.shift();
      logger.error(
        `[Bot] Session completion queue overflow; dropping oldest completion for ${sessionId}`,
      );
    }
    this.pendingAssistantCompletions.set(sessionId, queue);
    // Fresh content deserves a fresh retry budget.
    this.finalDeliveryAttempts.delete(sessionId);
  }

  private static readonly MAX_QUEUED_COMPLETIONS = 20;

  private readonly finalDeliveryAttempts = new Map<string, number>();
  private static readonly MAX_FINAL_DELIVERY_ATTEMPTS = 50;

  private async runFinalDelivery(sessionId: string): Promise<boolean> {
    const snapshot = this.pendingAssistantCompletions.get(sessionId) ?? [];
    // Take the snapshot out of the queue: arrivals during delivery append a
    // fresh queue and trigger another round instead of being committed early.
    this.pendingAssistantCompletions.delete(sessionId);

    const deliverNext = async (text: string | null): Promise<boolean> => {
      let finalized: boolean;
      try {
        finalized = await this.onFinalizeSession(sessionId, text);
      } catch (error) {
        if (!this.noteFinalDeliveryAttempt(sessionId, error)) {
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
        this.scheduleFinalDelivery(sessionId);
        return false;
      }
      return true;
    };

    if (snapshot.length === 0) {
      // No turn text, but the flush still repaints pin/keyboard state.
      if (!(await deliverNext(null))) {
        return false;
      }
    } else {
      for (let index = 0; index < snapshot.length; index++) {
        if (!(await deliverNext(snapshot[index]?.text ?? null))) {
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
    this.pendingFinalDeliveries.delete(sessionId);
    this.activityVersions.delete(sessionId);
    this.pendingAssistantCompletions.delete(sessionId);
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
    this.pendingFinalDeliveries.delete(sessionId);
    this.pendingAssistantCompletions.delete(sessionId);
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
