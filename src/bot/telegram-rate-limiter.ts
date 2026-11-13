import { logger } from "../utils/logger.js";
import { createScopeKeyFromParams } from "./scope.js";

const GLOBAL_MIN_INTERVAL_MS = 40;
const PER_CHAT_SEND_INTERVAL_MS = 1100;
const PER_CHAT_EDIT_INTERVAL_MS = 250;
const GROUP_WINDOW_MS = 60_000;
const GROUP_LIMIT_PER_WINDOW = 20;

export const MAX_QUEUE_JOBS = 200;
/** Hard ceiling for user traffic too; rejections reschedule via transient paths. */
export const MAX_USER_QUEUE_JOBS = 1000;
/** Backoff when Telegram says 429 but gives no timing info. */
export const DEFAULT_UNKNOWN_429_DELAY_MS = 5000;
const RETRY_JITTER_MS = 500;
const FAIRNESS_CONSECUTIVE_LIMIT = 5;

const RATE_LIMITED_METHODS = new Set<string>([
  "sendMessage",
  "editMessageText",
  "editMessageReplyMarkup",
  "sendDocument",
  "sendPhoto",
  "sendAudio",
  "sendVoice",
  "sendVideo",
  "sendAnimation",
  "sendMediaGroup",
  "deleteMessage",
  "pinChatMessage",
  "unpinChatMessage",
  "answerCallbackQuery",
  "createForumTopic",
  "editForumTopic",
  "closeForumTopic",
]);

/**
 * A 429 storm must never wedge the bot forever: after this many consecutive
 * retry_after responses the job fails open so the queues keep draining and
 * callers see an error they can handle.
 */
export const MAX_429_ATTEMPTS = 10;

export class RateLimitExceededError extends Error {
  constructor(method: string) {
    super(`Telegram rate limit persisted for ${method}; giving up to keep queues draining`);
    this.name = "RateLimitExceededError";
  }
}

/**
 * Runs a Telegram call with the same give-up budget as the queued paths.
 * Use this for direct (non-queued) sends: pin edits, final deliveries,
 * documents. A persistent 429 storm fails loudly instead of wedging the
 * per-session delivery chain forever.
 */
export async function runWithRateLimitRetries<T>(
  label: string,
  run: () => Promise<T>,
  maxAttempts: number = MAX_429_ATTEMPTS,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run();
    } catch (error) {
      const retryAfterMs = parseRetryAfterMs(error);
      if (!retryAfterMs) {
        throw error;
      }
      // Budget counts retries: the total is the initial try plus
      // maxAttempts retries, same as the queued and direct paths.
      if (attempt >= maxAttempts) {
        logger.warn(`[RateLimiter] Giving up on ${label} after ${attempt + 1} rate limits`);
        throw new RateLimitExceededError(label);
      }
      const delayMs = retryDelayMs(retryAfterMs);
      logger.info(`[RateLimiter] Telegram rate limit for ${label}; retry in ${delayMs}ms`);
      await sleep(delayMs);
    }
  }
}

interface QueueJob {
  method: string;
  payload: unknown;
  scopeKey: string | null;
  chatId: number | null;
  isGroupLike: boolean;
  notBefore: number;
  attempts429: number;
  /**
   * Repaints (message edits) lose to user traffic: during a flood the
   * client's questions, answers and commands must jump ahead of stream
   * and dashboard repaints instead of queueing behind them.
   */
  kind: "user" | "repaint";
  run: () => Promise<unknown>;
  resolves: Array<(value: unknown) => void>;
  rejects: Array<(error: unknown) => void>;
}

/** Edits re-render what the user already sees; everything else moves the conversation forward. */
const REPAINT_METHODS = new Set(["editMessageText", "editMessageReplyMarkup"]);

function isEditLikeMethod(method: string): boolean {
  return method === "editMessageText" || method === "editMessageReplyMarkup";
}

function getPerChatIntervalMs(job: QueueJob): number {
  return isEditLikeMethod(job.method) ? PER_CHAT_EDIT_INTERVAL_MS : PER_CHAT_SEND_INTERVAL_MS;
}

function countsTowardsGroupWindow(job: QueueJob): boolean {
  // Stream text edits can self-induce floods, so they share the group
  // window. Markup-only edits stay exempt.
  return job.method !== "editMessageReplyMarkup";
}

function parseMessageId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = Reflect.get(payload, "message_id");
  return typeof value === "number" ? value : null;
}

function parseChatId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = Reflect.get(payload, "chat_id");
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function parseThreadId(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const value = Reflect.get(payload, "message_thread_id");
  return typeof value === "number" ? value : null;
}

function scopeKeyFromPayload(payload: unknown): string | null {
  const chatId = parseChatId(payload);
  if (chatId === null) {
    return null;
  }

  if (chatId > 0) {
    return createScopeKeyFromParams({
      chatId,
      context: "dm",
    });
  }

  const threadId = parseThreadId(payload);
  if (threadId !== null) {
    return createScopeKeyFromParams({
      chatId,
      threadId,
      context: threadId === 1 ? "group-general" : "group-topic",
    });
  }

  return createScopeKeyFromParams({
    chatId,
    context: "group-general",
  });
}

function isGroupLikeChat(chatId: number | null): boolean {
  return chatId !== null && chatId < 0;
}

function collectRateLimitText(error: unknown): string {
  const parts: string[] = [];
  if (typeof error === "string") {
    parts.push(error);
  } else if (error && typeof error === "object") {
    const description = Reflect.get(error, "description");
    if (typeof description === "string") {
      parts.push(description);
    }
    const message = Reflect.get(error, "message");
    if (typeof message === "string") {
      parts.push(message);
    }
  }
  return parts.join("\n");
}

/**
 * Shared 429 detector: accepts numeric retry_after, string numbers,
 * "retry after N" / "retry_after N" inside error description strings, and
 * camelCase / millisecond variants some clients emit. A bare 429
 * (error_code only, no timing info) still backs off with a conservative
 * default instead of failing the call as non-retryable.
 */
export function parseRetryAfterMs(error: unknown): number | null {
  if (error && typeof error === "object") {
    const params = Reflect.get(error, "parameters");
    if (params && typeof params === "object") {
      const seconds = readRetryAfterSeconds(params, "retry_after")
        ?? readRetryAfterSeconds(params, "retryAfter");
      if (seconds !== null) {
        return seconds * 1000;
      }
      const ms = readRetryAfterSeconds(params, "retry_after_ms")
        ?? readRetryAfterSeconds(params, "retryAfterMs");
      if (ms !== null) {
        return ms;
      }
    }
  }

  const match = /retry[_ ]after\s*:?\s*(\d+(?:\.\d+)?)/i.exec(collectRateLimitText(error));
  if (match) {
    const seconds = Number(match[1]);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  // error_code 429 alone is sufficient evidence of flood control, even with
  // no description or parameters attached.
  if (error && typeof error === "object" && Reflect.get(error, "error_code") === 429) {
    return DEFAULT_UNKNOWN_429_DELAY_MS;
  }

  return null;
}

function readRetryAfterSeconds(params: object, key: string): number | null {
  const value: unknown = Reflect.get(params, key);
  const seconds =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function retryDelayMs(retryAfterMs: number): number {
  return retryAfterMs + 100 + Math.random() * RETRY_JITTER_MS;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EnqueueOptions {
  /** Override the default user/repaint classification; default keeps it. */
  priority?: "user" | "repaint";
}

export class TelegramRateLimiter {
  private readonly queue: QueueJob[] = [];
  private processing = false;
  private lastGlobalSentAt = 0;
  private readonly lastSentAtByChat = new Map<number, number>();
  private readonly groupWindowByChat = new Map<number, number[]>();
  private readonly backoffUntilByChat = new Map<number, number>();
  private activeScopeKey: string | null = null;
  private lastPickedScopeKey: string | null = null;
  private consecutiveScopePicks = 0;

  private findCoalescibleEditIndex(method: string, payload: unknown): number {
    if (!isEditLikeMethod(method)) {
      return -1;
    }
    const scopeKey = scopeKeyFromPayload(payload);
    const messageId = parseMessageId(payload);
    if (!scopeKey || messageId === null) {
      return -1;
    }

    for (let index = this.queue.length - 1; index >= 0; index--) {
      const job = this.queue[index];
      if (job.method !== method || job.scopeKey !== scopeKey) {
        continue;
      }

      if (parseMessageId(job.payload) === messageId) {
        return index;
      }
    }

    return -1;
  }

  setActiveScopeKey(scopeKey: string | null): void {
    this.activeScopeKey = scopeKey;
  }

  private async executeWithRetryAfter<T>(method: string, run: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        const retryAfterMs = parseRetryAfterMs(error);
        if (!retryAfterMs) {
          throw error;
        }

        // Budget counts retries: the total is the initial try plus
        // MAX_429_ATTEMPTS retries, same as the queued and wrapper paths.
        if (attempt >= MAX_429_ATTEMPTS) {
          logger.warn(`[RateLimiter] Giving up on ${method} after ${attempt + 1} rate limits`);
          throw new RateLimitExceededError(method);
        }

        const delayMs = retryDelayMs(retryAfterMs);
        logger.info(`[RateLimiter] Telegram rate limit for ${method}; retry in ${delayMs}ms`);
        await sleep(delayMs);
      }
    }
  }

  enqueue<T>(
    method: string,
    payload: unknown,
    run: () => Promise<T>,
    opts?: EnqueueOptions,
  ): Promise<T> {
    if (!RATE_LIMITED_METHODS.has(method)) {
      return this.executeWithRetryAfter(method, run);
    }

    const promise = new Promise<unknown>((resolve, reject) => {
      if (isEditLikeMethod(method)) {
        const existingIndex = this.findCoalescibleEditIndex(method, payload);
        if (existingIndex >= 0) {
          const existingJob = this.queue[existingIndex];
          existingJob.payload = payload;
          existingJob.run = run as () => Promise<unknown>;
          existingJob.resolves.push(resolve);
          existingJob.rejects.push(reject);
          return;
        }
      }

      const chatId = parseChatId(payload);
      const job: QueueJob = {
        method,
        payload,
        scopeKey: scopeKeyFromPayload(payload),
        chatId,
        isGroupLike: isGroupLikeChat(chatId),
        notBefore: 0,
        attempts429: 0,
        kind: opts?.priority ?? (REPAINT_METHODS.has(method) ? "repaint" : "user"),
        run: run as () => Promise<unknown>,
        resolves: [resolve],
        rejects: [reject],
      };

      this.queue.push(job);
      this.enforceQueueBound();
      if (this.queue.length > 25) {
        logger.debug(`[RateLimiter] Outbound queue depth=${this.queue.length}`);
      }

      this.ensureProcessing();
    });
    return promise as Promise<T>;
  }

  private enforceQueueBound(): void {
    let dropped = 0;
    while (this.queue.length > MAX_QUEUE_JOBS) {
      const victimIndex = this.queue.findIndex((job) => job.kind === "repaint");
      if (victimIndex < 0) {
        break;
      }
      const [victim] = this.queue.splice(victimIndex, 1);
      dropped += 1;
      // Reject so awaiting callers follow the existing failure paths.
      // Dropped jobs surface as RateLimitExceededError on purpose: the
      // coordinator treats that as transient and reschedules instead of
      // counting it against the give-up budget.
      const giveUp = new RateLimitExceededError(victim.method);
      for (const reject of victim.rejects) {
        reject(giveUp);
      }
    }
    if (dropped > 0) {
      logger.warn(
        `[RateLimiter] Queue overflow; dropped ${dropped} repaint jobs (depth=${this.queue.length})`,
      );
    }
    // User traffic is never dropped silently: an unbounded user queue means
    // a runaway producer, so cap it too and fail loudly. Rejected callers
    // see RateLimitExceededError and follow the transient retry paths.
    // Newest-first: in-order delivery matters, so the oldest queued work
    // (already awaited the longest) is preserved over the latest arrival.
    let droppedUser = 0;
    while (this.queue.length > MAX_USER_QUEUE_JOBS) {
      let victimIndex = -1;
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        if (this.queue[index]?.kind === "user") {
          victimIndex = index;
          break;
        }
      }
      if (victimIndex < 0) {
        break;
      }
      const [victim] = this.queue.splice(victimIndex, 1);
      droppedUser += 1;
      const giveUp = new RateLimitExceededError(victim.method);
      for (const reject of victim.rejects) {
        reject(giveUp);
      }
    }
    if (droppedUser > 0) {
      logger.error(
        `[RateLimiter] Queue overflow; dropped ${droppedUser} user jobs (depth=${this.queue.length}). Producer is outrunning Telegram; some sends will retry late.`,
      );
    } else if (this.queue.length > MAX_QUEUE_JOBS) {
      logger.warn(
        `[RateLimiter] Queue full of user jobs (depth=${this.queue.length}); waiting to drain`,
      );
    }
  }

  private ensureProcessing(): void {
    if (this.processing) {
      return;
    }

    this.processing = true;
    void this.processLoop();
  }

  private findNextIndex(now: number): { index: number; waitMs: number } {
    let best: { index: number; tier: number; scopeKey: string | null } | null = null;
    const ready: Array<{ index: number; tier: number; scopeKey: string | null }> = [];
    let minWaitMs = Number.POSITIVE_INFINITY;
    let minWaitIndex = 0;
    const seenScopeKeys = new Set<string>();

    for (let index = 0; index < this.queue.length; index++) {
      const job = this.queue[index];

      // Keep strict in-order delivery per scope.
      // If a scope already has an earlier queued job, skip later jobs for the same scope
      // until the head-of-line job is processed.
      if (job.scopeKey) {
        if (seenScopeKeys.has(job.scopeKey)) {
          continue;
        }

        seenScopeKeys.add(job.scopeKey);
      }

      const waitMs = this.getWaitMs(job, now);

      if (waitMs <= 0) {
        // Lower tier runs first: user traffic before repaints, active scope
        // first within the tier. FIFO breaks remaining ties.
        const tier =
          (job.kind === "user" ? 0 : 2) +
          (this.activeScopeKey && job.scopeKey === this.activeScopeKey ? 0 : 1);
        ready.push({ index, tier, scopeKey: job.scopeKey });
        if (!best || tier < best.tier || (tier === best.tier && index < best.index)) {
          best = { index, tier, scopeKey: job.scopeKey };
        }

        continue;
      }

      if (waitMs < minWaitMs) {
        minWaitMs = waitMs;
        minWaitIndex = index;
      }
    }

    if (!best) {
      return {
        index: minWaitIndex,
        waitMs: Number.isFinite(minWaitMs) ? Math.max(1, minWaitMs) : 1,
      };
    }

    const top = best;
    if (
      this.consecutiveScopePicks >= FAIRNESS_CONSECUTIVE_LIMIT &&
      top.scopeKey === this.lastPickedScopeKey
    ) {
      // One scope must not starve the rest: after several consecutive picks
      // from the same scope, run the oldest-ready job from another scope at
      // the same or next tier instead, once. The counter resets below.
      let alternative: { index: number; tier: number; scopeKey: string | null } | null = null;
      for (const candidate of ready) {
        if (candidate.scopeKey === this.lastPickedScopeKey) {
          continue;
        }
        if (candidate.tier > top.tier + 1) {
          continue;
        }
        if (!alternative || candidate.index < alternative.index) {
          alternative = candidate;
        }
      }
      if (alternative) {
        return { index: alternative.index, waitMs: 0 };
      }
    }

    return { index: top.index, waitMs: 0 };
  }

  private notePickedScope(scopeKey: string | null): void {
    if (scopeKey === this.lastPickedScopeKey) {
      this.consecutiveScopePicks += 1;
      return;
    }
    this.lastPickedScopeKey = scopeKey;
    this.consecutiveScopePicks = 1;
  }

  private pruneGroupWindow(chatId: number, now: number): number[] {
    const current = this.groupWindowByChat.get(chatId) ?? [];
    const pruned = current.filter((ts) => now - ts < GROUP_WINDOW_MS);
    this.groupWindowByChat.set(chatId, pruned);
    return pruned;
  }

  private getWaitMs(job: QueueJob, now: number = Date.now()): number {
    const waits: number[] = [];

    waits.push(job.notBefore - now);

    waits.push(this.lastGlobalSentAt + GLOBAL_MIN_INTERVAL_MS - now);

    if (job.chatId !== null) {
      const lastPerChat = this.lastSentAtByChat.get(job.chatId) ?? 0;
      waits.push(lastPerChat + getPerChatIntervalMs(job) - now);
      const backoffUntil = this.backoffUntilByChat.get(job.chatId);
      if (backoffUntil !== undefined) {
        if (backoffUntil <= now) {
          this.backoffUntilByChat.delete(job.chatId);
        } else {
          waits.push(backoffUntil - now);
        }
      }
    }

    if (job.isGroupLike && job.chatId !== null && countsTowardsGroupWindow(job)) {
      const timestamps = this.pruneGroupWindow(job.chatId, now);
      if (timestamps.length >= GROUP_LIMIT_PER_WINDOW) {
        waits.push(timestamps[0] + GROUP_WINDOW_MS - now);
      }
    }

    return Math.max(0, ...waits);
  }

  private markSent(job: QueueJob): void {
    const now = Date.now();
    this.lastGlobalSentAt = now;

    if (job.chatId !== null) {
      this.lastSentAtByChat.set(job.chatId, now);
    }

    if (job.isGroupLike && job.chatId !== null && countsTowardsGroupWindow(job)) {
      const timestamps = this.pruneGroupWindow(job.chatId, now);
      timestamps.push(now);
      this.groupWindowByChat.set(job.chatId, timestamps);
    }
  }

  private async executeJob(job: QueueJob): Promise<"done" | "retry"> {
    try {
      const result = await job.run();
      this.markSent(job);
      for (const resolve of job.resolves) {
        resolve(result);
      }
      return "done";
    } catch (error) {
      const retryAfterMs = parseRetryAfterMs(error);
      if (!retryAfterMs) {
        for (const reject of job.rejects) {
          reject(error);
        }
        return "done";
      }

      job.attempts429 += 1;
      // Budget counts retries: the total is the initial try plus
      // MAX_429_ATTEMPTS retries, same as the direct paths.
      if (job.attempts429 > MAX_429_ATTEMPTS) {
        logger.warn(
          `[RateLimiter] Giving up on ${job.method} after ${job.attempts429} rate limits`,
        );
        const giveUp = new RateLimitExceededError(job.method);
        for (const reject of job.rejects) {
          reject(giveUp);
        }
        return "done";
      }

      const delayMs = retryDelayMs(retryAfterMs);
      job.notBefore = Date.now() + delayMs;
      if (job.chatId !== null) {
        this.backoffUntilByChat.set(job.chatId, job.notBefore);
      }
      logger.info(`[RateLimiter] Telegram rate limit for ${job.method}; retry in ${delayMs}ms`);
      return "retry";
    }
  }

  private requeueRetryJob(job: QueueJob): void {
    if (isEditLikeMethod(job.method)) {
      // A newer edit for the same message makes this retry stale: drop the
      // old payload instead of resending it ahead of the fresh one. The old
      // waiters join the newer job so they resolve with the latest repaint.
      const newerIndex = this.findCoalescibleEditIndex(job.method, job.payload);
      if (newerIndex >= 0) {
        const newer = this.queue[newerIndex];
        newer.resolves.push(...job.resolves);
        newer.rejects.push(...job.rejects);
        logger.debug(
          `[RateLimiter] Dropping stale ${job.method} retry; newer edit already queued`,
        );
        return;
      }
    }

    if (!job.scopeKey) {
      this.queue.push(job);
      return;
    }

    const sameScopeIndex = this.queue.findIndex((queued) => queued.scopeKey === job.scopeKey);
    if (sameScopeIndex < 0) {
      this.queue.push(job);
      return;
    }

    this.queue.splice(sameScopeIndex, 0, job);
  }

  private async processLoop(): Promise<void> {
    try {
      while (this.queue.length > 0) {
        const now = Date.now();
        const selection = this.findNextIndex(now);
        if (selection.waitMs > 0) {
          await sleep(selection.waitMs);
          continue;
        }

        const index = selection.index;
        const [job] = this.queue.splice(index, 1);
        this.notePickedScope(job.scopeKey);
        const outcome = await this.executeJob(job);
        if (outcome === "retry") {
          this.requeueRetryJob(job);
        }
      }
    } finally {
      this.processing = false;
      if (this.queue.length > 0) {
        this.ensureProcessing();
      }
    }
  }
}
