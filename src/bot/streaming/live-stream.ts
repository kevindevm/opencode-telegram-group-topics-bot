import { buildThinkingMessage, hasOnlyThinkingLine } from "../utils/thinking-message.js";
import { logger } from "../../utils/logger.js";
import type { TelegramTextFormat } from "../utils/telegram-text.js";
import type { TelegramRenderedPart } from "../../telegram/render/types.js";
import {
  getTelegramRetryAfterMs,
  isTelegramMessageNotModifiedError,
} from "../utils/send-with-markdown-fallback.js";
import { ChainStallWatch } from "../utils/chain-stall-watch.js";
import { RateLimitExceededError, runWithRateLimitRetries } from "../telegram-rate-limiter.js";

const DEFAULT_THROTTLE_MS = 1000;
const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_RETRY_FLUSH_ATTEMPTS = 10;
/** Wait after the queue already spent its own budget; storm is ongoing. */
const EXHAUSTED_QUEUE_RETRY_DELAY_MS = 15_000;
const THINKING_PREFIX = "__thinking__";
const MAX_REPLACEABLE_SERVICE_LENGTH = 3500;
const CLEAR_SESSION_TIMEOUT_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LiveProvisionalMode = "full" | "off" | "activity";

interface LiveStreamOptions {
  sendText: (
    sessionId: string,
    text: string,
    format?: TelegramTextFormat,
    includeKeyboard?: boolean,
  ) => Promise<number | null>;
  editText: (
    sessionId: string,
    messageId: number,
    text: string,
    format?: TelegramTextFormat,
    includeKeyboard?: boolean,
    rawFallbackText?: string,
  ) => Promise<void>;
  editRenderedPart?: (
    sessionId: string,
    messageId: number,
    part: TelegramRenderedPart,
    includeKeyboard?: boolean,
  ) => Promise<void>;
  deleteText?: (sessionId: string, messageId: number) => Promise<void>;
  throttleMs?: number;
  /**
   * Pilot gate: "full" streams everything, "off" sends no provisional
   * message at all, "activity" streams service entries (thinking status,
   * tool progress) but never the raw assistant text. State still
   * accumulates so seal/finalize bookkeeping stays consistent.
   * Defaults to "full" (current behavior).
   */
  provisionalMode?: LiveProvisionalMode;
}

interface AssistantEntry {
  kind: "assistant";
  messageId: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

interface ServiceEntry {
  kind: "service";
  text: string;
  replaceKey?: string;
}

type StreamEntry = AssistantEntry | ServiceEntry;

interface AssistantState {
  messageId: string | null;
  fullText: string;
  committedLength: number;
  replaySuppressionPrefix: string | null;
  archivedMessageIds: number[];
}

interface ServiceState {
  thinkingText: string | null;
  updates: string[];
}

interface SessionState {
  messageId: number | null;
  lastSentText: string;
  entries: StreamEntry[];
  assistant: AssistantState;
  service: ServiceState;
}

function renderEntries(entries: StreamEntry[]): string {
  return entries
    .map((entry) => entry.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n")
    .trim();
}

function splitLongText(text: string, limit: number): [string, string] {
  if (text.length <= limit) {
    return [text, ""];
  }

  let splitIndex = text.lastIndexOf("\n", limit);
  if (splitIndex <= 0 || splitIndex < Math.floor(limit * 0.5)) {
    splitIndex = limit;
  }

  const prefix = text.slice(0, splitIndex).trimEnd();
  const suffix = text.slice(splitIndex).replace(/^\n+/, "").trimStart();
  return [prefix, suffix];
}

function getTrimmedRange(
  text: string,
  baseOffset: number,
): { text: string; start: number; end: number } {
  const trimmedStart = text.trimStart();
  if (!trimmedStart) {
    return { text: "", start: baseOffset, end: baseOffset };
  }

  const leadingLength = text.length - trimmedStart.length;
  const trimmed = trimmedStart.trimEnd();
  const trailingLength = trimmedStart.length - trimmed.length;
  const start = baseOffset + leadingLength;
  const end = baseOffset + text.length - trailingLength;
  return {
    text: trimmed,
    start,
    end,
  };
}

function splitAssistantEntry(
  entry: AssistantEntry,
  limit: number,
): [AssistantEntry, AssistantEntry | null] {
  const [prefixSourceText, suffixSourceText] = splitLongText(entry.text, limit);
  if (!suffixSourceText) {
    return [entry, null];
  }

  const prefixRange = getTrimmedRange(prefixSourceText, entry.startOffset);
  const suffixBaseOffset = entry.endOffset - suffixSourceText.length;
  const suffixRange = getTrimmedRange(suffixSourceText, suffixBaseOffset);

  return [
    {
      kind: "assistant",
      messageId: entry.messageId,
      text: prefixRange.text,
      startOffset: prefixRange.start,
      endOffset: prefixRange.end,
    },
    {
      kind: "assistant",
      messageId: entry.messageId,
      text: suffixRange.text,
      startOffset: suffixRange.start,
      endOffset: suffixRange.end,
    },
  ];
}

function splitServiceEntry(
  entry: ServiceEntry,
  limit: number,
): [ServiceEntry, ServiceEntry | null] {
  const [prefixText, suffixText] = splitLongText(entry.text, limit);
  if (!suffixText) {
    return [entry, null];
  }

  return [
    {
      kind: "service",
      text: prefixText,
      replaceKey: entry.replaceKey,
    },
    {
      kind: "service",
      text: suffixText,
      replaceKey: entry.replaceKey,
    },
  ];
}

function splitEntriesForLimit(entries: StreamEntry[]): {
  sentEntries: StreamEntry[];
  remainingEntries: StreamEntry[];
} {
  const sentEntries: StreamEntry[] = [];

  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const candidateText = renderEntries([...sentEntries, entry]);
    if (candidateText.length <= TELEGRAM_MESSAGE_LIMIT) {
      sentEntries.push(entry);
      continue;
    }

    if (sentEntries.length > 0) {
      return {
        sentEntries,
        remainingEntries: entries.slice(index),
      };
    }

    const [prefixEntry, suffixEntry] =
      entry.kind === "assistant"
        ? splitAssistantEntry(entry, TELEGRAM_MESSAGE_LIMIT)
        : splitServiceEntry(entry, TELEGRAM_MESSAGE_LIMIT);

    return {
      sentEntries: [prefixEntry],
      remainingEntries: suffixEntry
        ? [suffixEntry, ...entries.slice(index + 1)]
        : entries.slice(index + 1),
    };
  }

  return {
    sentEntries,
    remainingEntries: [],
  };
}

export class LiveStream {
  private readonly sendText;
  private readonly editText;
  private readonly editRenderedPart;
  private readonly deleteText;
  private readonly throttleMs: number;
  private readonly provisionalMode: LiveProvisionalMode;
  private readonly states = new Map<string, SessionState>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly sessionTasks = new Map<string, Promise<void>>();
  private readonly retryFlushAttempts = new Map<string, number>();
  /** Watchdog: a hung stream task wedges the whole session silently. */
  private readonly stallWatch = new ChainStallWatch("Bot/LiveStream");

  /** Starts the stuck-chain watchdog. Idempotent; call once at startup. */
  startStallWatchdog(): void {
    this.stallWatch.start();
  }

  constructor(options: LiveStreamOptions) {
    this.sendText = options.sendText;
    this.editText = options.editText;
    this.editRenderedPart = options.editRenderedPart;
    this.deleteText = options.deleteText;
    this.throttleMs = options.throttleMs ?? DEFAULT_THROTTLE_MS;
    this.provisionalMode = options.provisionalMode ?? "full";
  }

  private renderProvisional(entries: StreamEntry[]): string {
    if (this.provisionalMode === "activity") {
      return renderEntries(entries.filter((entry) => entry.kind !== "assistant"));
    }
    return renderEntries(entries);
  }

  async updateAssistant(
    sessionId: string,
    assistantMessageId: string,
    text: string,
  ): Promise<void> {
    const normalizedText = text.trim();
    if (!sessionId || !assistantMessageId || !normalizedText) {
      return;
    }

    await this.breakAssistantBoundary(sessionId, assistantMessageId);

    this.applyMutation(sessionId, (state) => {
      this.syncAssistantEntry(state, assistantMessageId, normalizedText);
    });
  }

  async completeAssistant(
    sessionId: string,
    assistantMessageId: string,
    text: string,
  ): Promise<void> {
    const normalizedText = text.trim();
    if (!sessionId || !assistantMessageId || !normalizedText) {
      return;
    }

    this.applyMutation(sessionId, (state) => {
      this.syncAssistantEntry(state, assistantMessageId, normalizedText);
      if (state.assistant.messageId === assistantMessageId) {
        state.assistant.fullText = normalizedText;
      }
    });
  }

  showThinking(sessionId: string, text: string): void {
    if (!sessionId || !text.trim()) {
      return;
    }

    this.applyMutation(sessionId, (state) => {
      state.service.thinkingText = text.trim();
      this.syncThinkingEntry(state);
    });
  }

  pushServiceUpdate(sessionId: string, text: string): void {
    const normalizedText = text.trim();
    if (!sessionId || !normalizedText) {
      return;
    }

    this.applyMutation(sessionId, (state) => {
      if (state.service.updates[state.service.updates.length - 1] !== normalizedText) {
        state.service.updates.push(normalizedText);
      }

      state.entries.push({ kind: "service", text: normalizedText });
    });
  }

  replaceServiceByPrefix(sessionId: string, prefix: string, text: string): void {
    const normalizedPrefix = prefix.trim();
    if (!sessionId || !normalizedPrefix) {
      return;
    }

    this.applyMutation(sessionId, (state) => {
      const existingEntry = state.entries.find(
        (entry) => entry.kind === "service" && entry.replaceKey === normalizedPrefix,
      );
      state.service.updates = state.service.updates.filter(
        (update) => !update.startsWith(normalizedPrefix) && update !== existingEntry?.text,
      );

      const normalizedText = text.trim();
      const existingIndex = state.entries.findIndex(
        (entry) => entry.kind === "service" && entry.replaceKey === normalizedPrefix,
      );

      const truncatedText =
        normalizedText.length > MAX_REPLACEABLE_SERVICE_LENGTH
          ? `${normalizedText.slice(0, MAX_REPLACEABLE_SERVICE_LENGTH - 3)}...`
          : normalizedText;

      if (!normalizedText) {
        if (existingIndex >= 0) {
          state.entries.splice(existingIndex, 1);
        }
        return;
      }

      state.service.updates.push(truncatedText);
      const nextEntry: ServiceEntry = {
        kind: "service",
        text: truncatedText,
        replaceKey: normalizedPrefix,
      };

      if (existingIndex >= 0) {
        state.entries[existingIndex] = nextEntry;
      } else {
        state.entries.push(nextEntry);
      }
    });
  }

  async clearThinkingOnlySession(sessionId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state || !hasOnlyThinkingLine(state.service.thinkingText, state.service.updates)) {
      return;
    }

    this.applyMutation(sessionId, (nextState) => {
      nextState.service.thinkingText = null;
      this.syncThinkingEntry(nextState);
    });
  }

  async sealCurrentMessage(
    sessionId: string,
    resetAssistantState: boolean = false,
    suppressAssistantReplay: boolean = false,
  ): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {
      return;
    }

    this.clearTimer(sessionId);
    await this.enqueueTask(sessionId, async () => {
      await this.flushSessionState(sessionId);
    });

    const visibleAssistantText = state.entries
      .filter((entry): entry is AssistantEntry => entry.kind === "assistant")
      .map((entry) => entry.text)
      .join("\n\n")
      .trim();

    state.messageId = null;
    state.lastSentText = "";
    state.entries = [];
    state.service = { thinkingText: null, updates: [] };

    if (resetAssistantState) {
      state.assistant = {
        messageId: null,
        fullText: "",
        committedLength: 0,
        replaySuppressionPrefix: null,
        archivedMessageIds: [],
      };
      return;
    }

    if (state.assistant.messageId) {
      state.assistant.committedLength = state.assistant.fullText.length;
    }

    state.assistant.replaySuppressionPrefix =
      suppressAssistantReplay && visibleAssistantText ? visibleAssistantText : null;
  }

  async breakServiceBoundary(sessionId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {
      return;
    }

    const hasAssistantEntry = state.entries.some((entry) => entry.kind === "assistant");
    const hasServiceEntry = state.entries.some((entry) => entry.kind === "service");
    if (!hasAssistantEntry || hasServiceEntry) {
      return;
    }

    await this.sealCurrentMessage(sessionId, false, true);
  }

  async breakAssistantBoundary(sessionId: string, assistantMessageId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {
      return;
    }

    const hasServiceEntry = state.service.updates.length > 0;
    const hasAssistantEntry = state.entries.some((entry) => entry.kind === "assistant");
    if (!hasServiceEntry || hasAssistantEntry) {
      return;
    }

    if (state.assistant.messageId === assistantMessageId) {
      return;
    }

    await this.sealCurrentMessage(sessionId, false, false);
  }

  async flushSession(sessionId: string): Promise<void> {
    if (!this.states.has(sessionId)) {
      return;
    }

    this.clearTimer(sessionId);
    await this.enqueueTask(sessionId, async () => {
      await this.flushSessionState(sessionId);
    });
  }

  /** Telegram id of the message currently streamed for the session, if any. */
  getLiveMessageId(sessionId: string): number | null {
    return this.states.get(sessionId)?.messageId ?? null;
  }

  async finalizeCurrentMessage(
    sessionId: string,
    options: {
      format: TelegramTextFormat;
      includeKeyboard: boolean;
      rawFallbackText?: string;
      renderedPart?: TelegramRenderedPart;
      /**
       * Authoritative completion text. The live buffer can accumulate
       * duplicated chunks mid-stream (cumulative deltas, replayed
       * snapshots); when the turn ends the visible message must be
       * rewritten with the corrected final text, not the live render.
       */
      finalText?: string;
    },
  ): Promise<boolean> {
    const state = this.states.get(sessionId);
    if (!state || state.messageId === null) {
      return false;
    }

    if (this.provisionalMode === "activity") {
      // Pilot: the activity lane stays as history; the final goes out as
      // a fresh message instead of overwriting the tool trail.
      this.clearTimer(sessionId);
      return false;
    }

    this.clearTimer(sessionId);
    return await this.enqueueTask(sessionId, async () => {
      await this.flushSessionState(sessionId);

      const latestState = this.states.get(sessionId);
      if (!latestState || latestState.messageId === null) {
        return false;
      }

      const liveText = renderEntries(latestState.entries);
      const text = options.finalText?.trim() ? options.finalText : liveText;
      if (!text) {
        return false;
      }

      if (
        !this.canUseAssistantFormat(latestState) ||
        latestState.assistant.archivedMessageIds.length > 0
      ) {
        return false;
      }

      if (options.renderedPart && this.editRenderedPart) {
        try {
          await this.editRenderedPart(
            sessionId,
            latestState.messageId,
            options.renderedPart,
            options.includeKeyboard,
          );
        } catch (error) {
          if (!isTelegramMessageNotModifiedError(error)) {
            throw error;
          }

          logger.debug("[LiveStream] Suppressing no-op final message edit", {
            sessionId,
            messageId: latestState.messageId,
          });
        }
      } else {
        await this.editText(
          sessionId,
          latestState.messageId,
          text,
          options.format,
          options.includeKeyboard,
          options.rawFallbackText,
        );
      }
      latestState.messageId = null;
      latestState.lastSentText = "";
      latestState.entries = [];
      latestState.service = { thinkingText: null, updates: [] };
      latestState.assistant = {
        messageId: null,
        fullText: "",
        committedLength: 0,
        replaySuppressionPrefix: null,
        archivedMessageIds: [],
      };
      return true;
    });
  }

  async cleanupAfterFinalDelivery(sessionId: string): Promise<void> {    const state = this.states.get(sessionId);
    if (!state) {
      return;
    }

    const deleteMessage = async (messageId: number): Promise<void> => {
      if (!this.deleteText) {
        return;
      }

      await this.deleteStreamMessage(sessionId, messageId);
    };

    this.clearTimer(sessionId);
    await this.enqueueTask(sessionId, async () => {
      await this.flushSessionState(sessionId);

      // Activity mode keeps the lane as visible history: previous carriers
      // stay, so there is nothing to clean up here.
      const keepHistory = this.provisionalMode === "activity";

      const latestState = this.states.get(sessionId);
      if (!latestState || latestState.messageId === null) {
        if (latestState && !keepHistory) {
          for (const archivedMessageId of latestState.assistant.archivedMessageIds) {
            await deleteMessage(archivedMessageId);
          }
          latestState.assistant.archivedMessageIds = [];
        }
        return;
      }

      if (!keepHistory) {
        for (const archivedMessageId of latestState.assistant.archivedMessageIds) {
          await deleteMessage(archivedMessageId);
        }
        latestState.assistant.archivedMessageIds = [];
      }

      const hasAssistantEntry = latestState.entries.some((entry) => entry.kind === "assistant");
      if (!hasAssistantEntry) {
        return;
      }

      const remainingEntries = latestState.entries.filter((entry) => entry.kind !== "assistant");
      const remainingText = renderEntries(remainingEntries);

      // A thinking-only leftover must not survive as a hung "thinking"
      // message next to the delivered answer: there is no turn left to
      // replace it, so remove it instead of trimming the stream down to it.
      if (
        remainingText &&
        hasOnlyThinkingLine(latestState.service.thinkingText, latestState.service.updates)
      ) {
        await deleteMessage(latestState.messageId);
        latestState.messageId = null;
        latestState.lastSentText = "";
        latestState.entries = [];
        latestState.service = { thinkingText: null, updates: [] };
        return;
      }

      if (!remainingText) {
        await deleteMessage(latestState.messageId);
        latestState.messageId = null;
        latestState.lastSentText = "";
        latestState.entries = [];
        return;
      }

      if (latestState.lastSentText !== remainingText) {
        try {
          await this.editText(sessionId, latestState.messageId, remainingText, "raw", false);
          latestState.lastSentText = remainingText;
        } catch (error) {
          logger.warn("[LiveStream] Failed to trim stream message during final cleanup", {
            sessionId,
            error,
          });
        }
      }

      latestState.entries = remainingEntries;
      latestState.assistant = {
        messageId: null,
        fullText: "",
        committedLength: 0,
        replaySuppressionPrefix: latestState.assistant.replaySuppressionPrefix,
        archivedMessageIds: [],
      };
    });
  }

  /**
   * Deletes the live stream message outright. Used when the final answer was
   * delivered as fresh messages: keeping the stream (service lines included)
   * next to them reads as duplication. Also drops the delivered entries so a
   * turn starting before the commit seal cannot flush stale service lines or
   * replay the delivered assistant text into the next live message.
   */
  async deleteLiveMessage(sessionId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state || state.messageId === null || !this.deleteText) {
      return;
    }

    this.clearTimer(sessionId);
    await this.enqueueTask(sessionId, async () => {
      const latestState = this.states.get(sessionId);
      if (!latestState || latestState.messageId === null || !this.deleteText) {
        return;
      }

      if (this.provisionalMode === "activity") {
        // Pilot: keep the activity lane as visible history. Clear the
        // bookkeeping without deleting the message.
        latestState.messageId = null;
        latestState.lastSentText = "";
        latestState.assistant.committedLength = latestState.assistant.fullText.length;
        latestState.entries = [];
        latestState.service = { thinkingText: null, updates: [] };
        return;
      }

      const messageId = latestState.messageId;
      await this.deleteStreamMessage(sessionId, messageId);

      latestState.messageId = null;
      latestState.lastSentText = "";
      // The assistant text went out as fresh messages; keep the committed
      // length so a replayed snapshot of the same text is suppressed instead
      // of duplicated, and drop everything visible so far.
      latestState.assistant.committedLength = latestState.assistant.fullText.length;
      latestState.entries = [];
      latestState.service = { thinkingText: null, updates: [] };
    });
  }

  async clearSession(sessionId: string, reason: string): Promise<void> {
    if (!this.states.has(sessionId)) {
      return;
    }

    logger.debug(`[LiveStream] Clearing session state: session=${sessionId}, reason=${reason}`);
    this.clearTimer(sessionId);
    await this.enqueueTask(sessionId, async () => undefined);
    this.states.delete(sessionId);
    this.retryFlushAttempts.delete(sessionId);
    this.unbudgetedRetryStreaks.delete(sessionId);
  }

  async clearAll(reason: string): Promise<void> {
    for (const sessionId of Array.from(this.states.keys())) {
      // Never let one hung session (e.g. a Telegram call stuck in a retry
      // sleep) block the whole shutdown: move on after a bounded wait.
      const cleared = this.clearSession(sessionId, reason);
      const timedOut = sleep(CLEAR_SESSION_TIMEOUT_MS).then(() => true);
      const done = cleared.then(() => false);
      if (await Promise.race([done, timedOut])) {
        logger.warn("[LiveStream] Timed out clearing session state", { sessionId, reason });
        this.clearTimer(sessionId);
        this.sessionTasks.delete(sessionId);
        this.retryFlushAttempts.delete(sessionId);
        this.unbudgetedRetryStreaks.delete(sessionId);
        this.states.delete(sessionId);
      }
    }
  }

  private getOrCreateState(sessionId: string): SessionState {
    const existing = this.states.get(sessionId);
    if (existing) {
      return existing;
    }

    const state: SessionState = {
      messageId: null,
      lastSentText: "",
      entries: [],
      assistant: {
        messageId: null,
        fullText: "",
        committedLength: 0,
        replaySuppressionPrefix: null,
        archivedMessageIds: [],
      },
      service: {
        thinkingText: null,
        updates: [],
      },
    };
    this.states.set(sessionId, state);
    return state;
  }

  private syncAssistantEntry(
    state: SessionState,
    assistantMessageId: string,
    fullText: string,
  ): void {
    if (state.assistant.messageId !== assistantMessageId) {
      state.assistant = {
        messageId: assistantMessageId,
        fullText,
        committedLength: 0,
        replaySuppressionPrefix: state.assistant.replaySuppressionPrefix,
        archivedMessageIds: state.assistant.archivedMessageIds,
      };
    } else {
      state.assistant.fullText = fullText;
    }

    if (state.assistant.committedLength > fullText.length) {
      state.assistant.committedLength = 0;
    }

    const rawSuffix = fullText.slice(state.assistant.committedLength);
    const visibleRange = getTrimmedRange(rawSuffix, state.assistant.committedLength);
    const existingIndex = state.entries.findIndex(
      (entry) => entry.kind === "assistant" && entry.messageId === assistantMessageId,
    );

    if (!visibleRange.text) {
      if (existingIndex >= 0) {
        state.entries.splice(existingIndex, 1);
      }
      return;
    }

    const nextEntry: AssistantEntry = {
      kind: "assistant",
      messageId: assistantMessageId,
      text: visibleRange.text,
      startOffset: visibleRange.start,
      endOffset: visibleRange.end,
    };

    const suppressionPrefix = state.assistant.replaySuppressionPrefix;
    if (suppressionPrefix && nextEntry.text.startsWith(suppressionPrefix)) {
      const trimmedText = nextEntry.text.slice(suppressionPrefix.length).trimStart();
      const consumedChars = nextEntry.text.length - trimmedText.length;
      state.assistant.replaySuppressionPrefix = null;

      if (!trimmedText) {
        if (existingIndex >= 0) {
          state.entries.splice(existingIndex, 1);
        }
        return;
      }

      nextEntry.text = trimmedText;
      nextEntry.startOffset += consumedChars;
    }

    if (existingIndex >= 0) {
      state.entries[existingIndex] = nextEntry;
      return;
    }

    state.entries.push(nextEntry);
  }

  private syncThinkingEntry(state: SessionState): void {
    const thinkingText = buildThinkingMessage(state.service.thinkingText, []);
    const existingIndex = state.entries.findIndex(
      (entry) => entry.kind === "service" && entry.replaceKey === THINKING_PREFIX,
    );

    if (!thinkingText) {
      if (existingIndex >= 0) {
        state.entries.splice(existingIndex, 1);
      }
      return;
    }

    const nextEntry: ServiceEntry = {
      kind: "service",
      text: thinkingText,
      replaceKey: THINKING_PREFIX,
    };

    if (existingIndex >= 0) {
      state.entries[existingIndex] = nextEntry;
      return;
    }

    state.entries.push(nextEntry);
  }

  private applyMutation(sessionId: string, mutate: (state: SessionState) => void): void {
    const state = this.getOrCreateState(sessionId);
    mutate(state);
    this.scheduleFlush(sessionId);
  }

  private clearTimer(sessionId: string): void {
    const timer = this.timers.get(sessionId);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.timers.delete(sessionId);
  }

  private resetRetryFlushAttempts(sessionId: string): void {
    this.retryFlushAttempts.delete(sessionId);
    this.unbudgetedRetryStreaks.delete(sessionId);
  }

  /**
   * Removes a stream message after its content went out another way. A 429
   * here is retried like any other delivery: giving up leaves the stale
   * message next to the finals and the turn reads twice. Never fails the
   * caller: after the give-up budget the storm owns the outcome.
   */
  private async deleteStreamMessage(sessionId: string, messageId: number): Promise<void> {
    const deleteText = this.deleteText;
    if (!deleteText) {
      return;
    }

    try {
      await runWithRateLimitRetries(`delete-live:${sessionId}`, () =>
        deleteText(sessionId, messageId),
      );
    } catch (error) {
      if (error instanceof RateLimitExceededError) {
        logger.warn("[LiveStream] Storm outlasted stream message delete retries; leaving it", {
          sessionId,
          messageId,
        });
      } else {
        logger.warn("[LiveStream] Failed to delete stream message", {
          sessionId,
          messageId,
          error,
        });
      }
    }
  }

  private scheduleFlush(sessionId: string): void {
    if (this.timers.has(sessionId)) {
      return;
    }

    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.enqueueTask(sessionId, () => this.flushSessionState(sessionId));
    }, this.throttleMs);

    this.timers.set(sessionId, timer);
  }

  private scheduleRetryFlush(sessionId: string, retryAfterMs: number): void {
    const attempts = (this.retryFlushAttempts.get(sessionId) ?? 0) + 1;
    this.retryFlushAttempts.set(sessionId, attempts);
    if (attempts > MAX_RETRY_FLUSH_ATTEMPTS) {
      logger.warn("[LiveStream] Retry budget exhausted; keeping entries until next mutation", {
        sessionId,
      });
      return;
    }

    this.clearTimer(sessionId);
    this.armRetryTimer(sessionId, retryAfterMs);
  }

  /**
   * The queue already spent its own 429 budget before surfacing
   * RateLimitExceededError, so retrying here must not consume the local
   * budget too. Still bounded: an endless ban must not retain the timer
   * and the entries forever, so unbudgeted rounds stop after their own cap
   * and the next mutation revives the stream like any other stall.
   */
  private static readonly MAX_UNBUDGETED_RETRIES = 40;
  private readonly unbudgetedRetryStreaks = new Map<string, number>();

  private scheduleUnbudgetedRetry(sessionId: string, delayMs: number): void {
    const streak = (this.unbudgetedRetryStreaks.get(sessionId) ?? 0) + 1;
    this.unbudgetedRetryStreaks.set(sessionId, streak);
    if (streak > LiveStream.MAX_UNBUDGETED_RETRIES) {
      logger.warn("[LiveStream] Storm retries exhausted; keeping entries until next mutation", {
        sessionId,
      });
      return;
    }
    this.clearTimer(sessionId);
    this.armRetryTimer(sessionId, delayMs);
  }

  private resetUnbudgetedRetries(sessionId: string): void {
    this.unbudgetedRetryStreaks.delete(sessionId);
  }

  private armRetryTimer(sessionId: string, delayMs: number): void {
    const timer = setTimeout(() => {
      this.timers.delete(sessionId);
      void this.enqueueTask(sessionId, () => this.flushSessionState(sessionId));
    }, delayMs);

    this.timers.set(sessionId, timer);
  }

  private enqueueTask<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
    const previousTask = this.sessionTasks.get(sessionId) ?? Promise.resolve();
    // The tracked wrapper (not the task promise itself) is what the map
    // holds: comparing against nextTask here could never match, so entries
    // lingered forever and the stored `nextTask.then(...)` rejection went
    // unobserved. Mirror SessionOutputCoordinator: the wrapper always
    // settles, and cleanup compares against the exact stored reference.
    const nextTask: Promise<T> = previousTask
      .catch(() => undefined)
      .then(async () => {
        this.stallWatch.markStart(sessionId);
        try {
          return await task();
        } finally {
          this.stallWatch.markDone(sessionId);
        }
      })
      .finally(() => {
        if (this.sessionTasks.get(sessionId) === trackedTask) {
          this.sessionTasks.delete(sessionId);
        }
      });

    const trackedTask: Promise<void> = nextTask.then(
      () => undefined,
      () => undefined,
    );
    this.sessionTasks.set(sessionId, trackedTask);
    return nextTask;
  }

  private commitAssistantProgress(state: SessionState, sentEntries: StreamEntry[]): void {
    for (const entry of sentEntries) {
      if (entry.kind !== "assistant") {
        continue;
      }

      if (state.assistant.messageId !== entry.messageId) {
        continue;
      }

      state.assistant.committedLength = Math.min(state.assistant.fullText.length, entry.endOffset);
    }
  }

  private canUseAssistantFormat(state: SessionState): boolean {
    return (
      state.entries.length === 1 &&
      state.entries[0]?.kind === "assistant" &&
      state.entries[0].messageId === state.assistant.messageId
    );
  }

  private async flushSessionState(sessionId: string): Promise<void> {
    const state = this.states.get(sessionId);
    if (!state) {
      return;
    }

    if (this.provisionalMode === "off") {
      // Pilot: no provisional traffic. Entries stay buffered for the
      // seal/finalize bookkeeping; the turn goes out only as the final
      // formatted delivery.
      this.resetRetryFlushAttempts(sessionId);
      return;
    }

    while (true) {
      const text = this.renderProvisional(state.entries);
      if (!text) {
        this.resetRetryFlushAttempts(sessionId);
        return;
      }

      if (text.length <= TELEGRAM_MESSAGE_LIMIT) {
        if (state.messageId === null) {
          try {
            const messageId = await this.sendText(sessionId, text, "raw", false);
            if (messageId === null) {
              return;
            }

            state.messageId = messageId;
            state.lastSentText = text;
            this.resetRetryFlushAttempts(sessionId);
            return;
          } catch (error) {
            if (error instanceof RateLimitExceededError) {
              logger.info("[LiveStream] Queue gave up on stream send; waiting out the storm", {
                sessionId,
              });
              this.scheduleUnbudgetedRetry(sessionId, EXHAUSTED_QUEUE_RETRY_DELAY_MS);
              return;
            }
            const retryAfterMs = getTelegramRetryAfterMs(error);
            if (retryAfterMs) {
              logger.info(
                `[LiveStream] Telegram rate limit; retrying stream send in ${retryAfterMs}ms`,
                {
                  sessionId,
                },
              );
              this.scheduleRetryFlush(sessionId, retryAfterMs + 100);
              return;
            }

            logger.warn("[LiveStream] Failed to send stream message", { sessionId, error });
            this.scheduleRetryFlush(sessionId, this.throttleMs);
            return;
          }
        }

        if (state.lastSentText === text) {
          this.resetRetryFlushAttempts(sessionId);
          return;
        }

        try {
          await this.editText(sessionId, state.messageId, text, "raw", false);
          state.lastSentText = text;
          this.resetRetryFlushAttempts(sessionId);
        } catch (error) {
          if (error instanceof RateLimitExceededError) {
            logger.info("[LiveStream] Queue gave up on stream edit; waiting out the storm", {
              sessionId,
            });
            this.scheduleUnbudgetedRetry(sessionId, EXHAUSTED_QUEUE_RETRY_DELAY_MS);
            return;
          }
          const retryAfterMs = getTelegramRetryAfterMs(error);
          if (retryAfterMs) {
            logger.info(
              `[LiveStream] Telegram rate limit; retrying stream edit in ${retryAfterMs}ms`,
              {
                sessionId,
              },
            );
            this.scheduleRetryFlush(sessionId, retryAfterMs + 100);
            return;
          }

          // Fatal edit error (e.g. message can't be edited anymore): abandon
          // the dead message so the next flush sends a fresh one instead of
          // failing on the same message forever.
          logger.warn("[LiveStream] Abandoning uneditable stream message", {
            sessionId,
            messageId: state.messageId,
            error,
          });
          state.messageId = null;
          state.lastSentText = "";
          this.scheduleRetryFlush(sessionId, this.throttleMs);
        }
        return;
      }

      const { sentEntries, remainingEntries } = splitEntriesForLimit(state.entries);
      const prefixText = this.renderProvisional(sentEntries);
      if (!prefixText) {
        return;
      }

      try {
        if (state.messageId === null) {
          const messageId = await this.sendText(sessionId, prefixText, "raw", false);
          if (messageId === null) {
            return;
          }

          state.messageId = messageId;
        } else if (state.lastSentText !== prefixText) {
          await this.editText(sessionId, state.messageId, prefixText, "raw", false);
        }
      } catch (error) {
        if (error instanceof RateLimitExceededError) {
          logger.info("[LiveStream] Queue gave up on rolled sync; waiting out the storm", {
            sessionId,
          });
          this.scheduleUnbudgetedRetry(sessionId, EXHAUSTED_QUEUE_RETRY_DELAY_MS);
          return;
        }
        const retryAfterMs = getTelegramRetryAfterMs(error);
        if (retryAfterMs) {
          logger.info(
            `[LiveStream] Telegram rate limit; retrying rolled stream sync in ${retryAfterMs}ms`,
            {
              sessionId,
            },
          );
          this.scheduleRetryFlush(sessionId, retryAfterMs + 100);
          return;
        }

        // Same recovery as above: a dead rolled message must not block
        // the rest of the stream.
        logger.warn("[LiveStream] Abandoning uneditable rolled stream message", {
          sessionId,
          messageId: state.messageId,
          error,
        });
        state.messageId = null;
        state.lastSentText = "";
        this.scheduleRetryFlush(sessionId, this.throttleMs);
        return;
      }

      state.lastSentText = prefixText;
      this.commitAssistantProgress(state, sentEntries);
      if (
        state.messageId !== null &&
        sentEntries.some((entry) => entry.kind === "assistant") &&
        !state.assistant.archivedMessageIds.includes(state.messageId)
      ) {
        state.assistant.archivedMessageIds.push(state.messageId);
      }
      state.messageId = null;
      state.lastSentText = "";
      state.entries = remainingEntries;
    }
  }
}
