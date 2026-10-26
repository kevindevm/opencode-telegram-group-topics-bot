import { Event, ToolState } from "@opencode-ai/sdk/v2";
import type { CodeFileData } from "./formatter.js";
import {
  formatPatchFileLine,
  getPatchFileChanges,
  normalizePathForDisplay,
  prepareCodeFile,
} from "./formatter.js";
import type { Question } from "../question/types.js";
import type { PermissionRequest } from "../permission/types.js";
import type { FileChange } from "../pinned/types.js";
import { logger } from "../utils/logger.js";
import { getSessionById } from "../session/manager.js";
import { isRecord } from "../utils/type-guards.js";

export interface SummaryInfo {
  sessionId: string;
  text: string;
  messageCount: number;
  lastUpdated: number;
}

type MessageCompleteCallback = (sessionId: string, messageId: string, messageText: string) => void;
type MessageUpdatedCallback = (sessionId: string, messageId: string, messageText: string) => void;

export interface ToolInfo {
  sessionId: string;
  messageId: string;
  callId: string;
  tool: string;
  state: ToolState;
  input?: { [key: string]: unknown };
  title?: string;
  metadata?: { [key: string]: unknown };
  hasFileAttachment?: boolean;
}

export interface ToolFileEntry {
  fileData: CodeFileData | null;
  line?: string;
  fileChange?: FileChange | null;
}

export interface ToolFileInfo extends ToolInfo {
  hasFileAttachment: true;
  files: ToolFileEntry[];
}

type ToolCallback = (toolInfo: ToolInfo) => void;

type ToolFileCallback = (fileInfo: ToolFileInfo) => void;

type QuestionCallback = (sessionId: string, questions: Question[], requestID: string) => void;

type QuestionErrorCallback = () => void;

type ThinkingCallback = (sessionId: string) => void;

type TypingIndicatorCallback = (sessionId: string) => void;

export interface TokensInfo {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
}

type TokensCallback = (sessionId: string, tokens: TokensInfo) => void;

type SessionCompactedCallback = (sessionId: string, directory: string) => void;
type SessionIdleCallback = (sessionId: string) => void;

type SessionErrorCallback = (sessionId: string, message: string) => void;

export interface SessionRetryInfo {
  sessionId: string;
  attempt?: number;
  message: string;
  next?: number;
}

type SessionRetryCallback = (retryInfo: SessionRetryInfo) => void;

export type SubagentStatus = "pending" | "running" | "completed" | "error";

export interface SubagentInfo {
  cardId: string;
  sessionId: string | null;
  parentSessionId: string;
  agent: string;
  description: string;
  prompt: string;
  command?: string;
  status: SubagentStatus;
  providerID?: string;
  modelID?: string;
  currentTool?: string;
  currentToolInput?: { [key: string]: unknown };
  currentToolTitle?: string;
  terminalMessage?: string;
  updatedAt: number;
}

type SubagentCallback = (sessionId: string, subagents: SubagentInfo[]) => void;

type PermissionCallback = (request: PermissionRequest) => void;

type PermissionRepliedCallback = (sessionId: string | null, requestID: string | null) => void;

export type QuestionSettledOutcome = "answered" | "cancelled";

type QuestionSettledCallback = (
  sessionId: string | null,
  requestID: string | null,
  outcome: QuestionSettledOutcome,
) => void;

type SessionDiffCallback = (sessionId: string, diffs: FileChange[]) => void;

type FileChangeCallback = (change: FileChange, sessionId: string) => void;

type ClearedCallback = () => void;

interface PreparedToolFiles {
  files: ToolFileEntry[];
}

interface ApplyPatchSection {
  filePath: string;
  patchText: string;
}

interface SubagentState extends SubagentInfo {
  hasSubtaskMetadata: boolean;
  hasTaskToolMetadata: boolean;
  hasSessionTitleMetadata: boolean;
  createdAt: number;
}

function invokeCallback(
  callback: (() => void) | (() => Promise<void>),
  errorMessage: string,
): void {
  try {
    const result = callback();
    if (result && typeof result.then === "function") {
      void result.catch((err) => {
        logger.error(errorMessage, err);
      });
    }
  } catch (err) {
    logger.error(errorMessage, err);
  }
}

function extractFirstUpdatedFileFromTitle(title: string): string {
  for (const rawLine of title.split("\n")) {
    const line = rawLine.trim();
    if (line.length >= 3 && line[1] === " " && /[AMDURC]/.test(line[0])) {
      return line.slice(2).trim();
    }
  }
  return "";
}

function countDiffChangesFromText(text: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;

  for (const line of text.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) {
      additions++;
      continue;
    }

    if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++;
    }
  }

  return { additions, deletions };
}

function parseApplyPatchSections(patchText: string): ApplyPatchSection[] {
  const lines = patchText.split("\n");
  const sections: ApplyPatchSection[] = [];
  let currentSection: { filePath: string; lines: string[] } | null = null;

  const flushCurrentSection = (): void => {
    if (!currentSection) {
      return;
    }

    sections.push({
      filePath: currentSection.filePath,
      patchText: currentSection.lines.join("\n").trim(),
    });
    currentSection = null;
  };

  for (const line of lines) {
    const match = line.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/);
    if (match) {
      flushCurrentSection();
      currentSection = {
        filePath: normalizePathForDisplay(match[1]!.trim()),
        lines: [line],
      };
      continue;
    }

    if (line.startsWith("*** End Patch")) {
      flushCurrentSection();
      break;
    }

    if (currentSection) {
      currentSection.lines.push(line);
    }
  }

  flushCurrentSection();
  return sections.filter((section) => section.filePath.length > 0 && section.patchText.length > 0);
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Merge a streamed text delta into the buffered part text.
 * Deltas are normally incremental chunks, but some servers re-emit the
 * cumulative part text on every event; appending those would repeat the
 * same words over and over in the live message. When the incoming chunk
 * already contains what we buffered, treat it as a cumulative resend and
 * keep the longest version instead of concatenating. Overlapping resends
 * (the delta restates the buffered tail, e.g. a repeated `**` suffix) are
 * merged at the overlap so the tail is not duplicated.
 */
function nextDeltaText(buffered: string, delta: string): string {
  if (!buffered) {
    return delta;
  }

  if (!delta) {
    return buffered;
  }

  if (delta.startsWith(buffered)) {
    return delta;
  }

  if (buffered.startsWith(delta)) {
    return buffered;
  }

  if (delta.includes(buffered)) {
    return delta;
  }

  if (buffered.includes(delta)) {
    return buffered;
  }

  const maxOverlap = Math.min(buffered.length, delta.length, 2000);
  let overlap = 0;
  for (let length = maxOverlap; length > 0; length--) {
    if (buffered.endsWith(delta.slice(0, length))) {
      overlap = length;
      break;
    }
  }

  return `${buffered}${delta.slice(overlap)}`;
}

/** Ordinal of a translator text-part key (`...:text:<ordinal>`), if parseable. */
function parseTextOrdinalFromPartKey(partKey: string): number | null {
  const match = partKey.match(/:text:(\d+)$/);
  if (!match) {
    return null;
  }

  const ordinal = Number(match[1]);
  return Number.isSafeInteger(ordinal) ? ordinal : null;
}

/** One assistant text chunk; `key` identifies its part for replay-safe upserts. */
interface MessagePartEntry {
  key: string | null;
  text: string;
}

function extractEventSessionId(event: Event): string | null {
  const eventWithProperties = event as Event & {
    properties?: {
      info?: { sessionID?: unknown };
      part?: { sessionID?: unknown };
      request?: { sessionID?: unknown };
      session?: { id?: unknown };
    };
  };

  if (typeof eventWithProperties.properties?.info?.sessionID === "string") {
    return eventWithProperties.properties.info.sessionID;
  }

  if (typeof eventWithProperties.properties?.part?.sessionID === "string") {
    return eventWithProperties.properties.part.sessionID;
  }

  if (typeof eventWithProperties.properties?.request?.sessionID === "string") {
    return eventWithProperties.properties.request.sessionID;
  }

  if (typeof eventWithProperties.properties?.session?.id === "string") {
    return eventWithProperties.properties.session.id;
  }

  const flatSessionId = (eventWithProperties.properties as { sessionID?: unknown } | undefined)
    ?.sessionID;
  if (typeof flatSessionId === "string") {
    return flatSessionId;
  }

  return null;
}

class SummaryAggregator {
  private static readonly COMPLETION_DEBOUNCE_MS = 100;

  private trackedSessionIds: Set<string> = new Set();
  private currentMessageParts: Map<string, MessagePartEntry[]> = new Map();
  private pendingParts: Map<string, MessagePartEntry[]> = new Map();
  private messages: Map<string, { role: string; sessionId: string }> = new Map();
  private messageCount = 0;
  private lastUpdated = 0;
  private onCompleteCallback: MessageCompleteCallback | null = null;
  private onMessageUpdatedCallback: MessageUpdatedCallback | null = null;
  private onToolCallback: ToolCallback | null = null;
  private onToolFileCallback: ToolFileCallback | null = null;
  private onQuestionCallback: QuestionCallback | null = null;
  private onQuestionSettledCallback: QuestionSettledCallback | null = null;
  private onQuestionErrorCallback: QuestionErrorCallback | null = null;
  private onThinkingCallback: ThinkingCallback | null = null;
  private onTypingIndicatorCallback: TypingIndicatorCallback | null = null;
  private onTokensCallback: TokensCallback | null = null;
  private onSessionCompactedCallback: SessionCompactedCallback | null = null;
  private onSessionIdleCallback: SessionIdleCallback | null = null;
  private onSessionErrorCallback: SessionErrorCallback | null = null;
  private onSessionRetryCallback: SessionRetryCallback | null = null;
  private onSubagentCallback: SubagentCallback | null = null;
  private onPermissionCallback: PermissionCallback | null = null;
  private onPermissionRepliedCallback: PermissionRepliedCallback | null = null;
  private onSessionDiffCallback: SessionDiffCallback | null = null;
  private onFileChangeCallback: FileChangeCallback | null = null;
  private onClearedCallback: ClearedCallback | null = null;
  private processedToolStates = new Map<string, string>();
  private static readonly PROCESSED_TOOL_STATES_LIMIT = 10_000;

  /**
   * Records a processed tool state, returning false when it was already seen.
   * Entries are tagged with the session so clearSession() can purge them;
   * the map is also hard-capped with FIFO eviction so a 24/7 process cannot
   * grow it without bound.
   */
  private markProcessedToolState(key: string, sessionId: string): boolean {
    if (this.processedToolStates.has(key)) {
      return false;
    }
    while (this.processedToolStates.size >= SummaryAggregator.PROCESSED_TOOL_STATES_LIMIT) {
      const oldest = this.processedToolStates.keys().next();
      if (oldest.done) {
        break;
      }
      this.processedToolStates.delete(oldest.value);
    }
    this.processedToolStates.set(key, sessionId);
    return true;
  }

  private clearProcessedToolStatesForSession(sessionId: string): void {
    for (const [key, owner] of this.processedToolStates) {
      if (owner === sessionId) {
        this.processedToolStates.delete(key);
      }
    }
  }
  private thinkingFiredForMessages: Set<string> = new Set();
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private activeTypingSessions: Set<string> = new Set();
  private completionTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private stepFinishCosts: Map<string, number> = new Map();
  private lastStreamedMessageText: Map<string, string> = new Map();
  /** Latest cumulative session totals reported by `session.usage.updated`. */
  private latestCumulativeUsageBySession = new Map<string, { input: number; cacheRead: number }>();
  /**
   * Cumulative snapshot taken at the current step start; live growth during
   * the step is measured against it.
   */
  private usageBaselineBySession = new Map<string, { input: number; cacheRead: number }>();
  /** Exact context of the last completed step; anchor for live estimates. */
  private lastStepTokensBySession = new Map<string, { input: number; cacheRead: number }>();
  private deltaTextByPart: Map<string, string> = new Map();
  private deltaCompletedParts: Set<string> = new Set();
  /** Latest full snapshot per text part, to replace replays instead of duplicating. */
  private partSnapshotByKey: Map<string, string> = new Map();
  /**
   * Events for not-yet-tracked sessions (child text/tools racing ahead of
   * `session.created`). Replayed when the session gets tracked; capped with
   * TTL so stray sessions cannot grow memory.
   */
  private pendingEarlyEventsBySession = new Map<string, { event: Event; at: number }[]>();
  private static readonly EARLY_EVENT_TTL_MS = 120_000;
  private static readonly EARLY_EVENTS_PER_SESSION = 50;
  private static readonly EARLY_EVENT_SESSIONS = 50;
  private trackedSessionParents: Map<string, string | null> = new Map();
  private subagentStates: Map<string, SubagentState> = new Map();
  private subagentOrderByParent: Map<string, string[]> = new Map();
  private subagentCardIdBySessionId: Map<string, string> = new Map();
  private pendingSubagentCardIdsByParent: Map<string, string[]> = new Map();
  private pendingChildSessionIdsByParent: Map<string, string[]> = new Map();
  private fallbackSubagentCardIdsByParent: Map<string, string[]> = new Map();

  private getMessageKey(sessionId: string, messageId: string): string {
    return `${sessionId}:${messageId}`;
  }

  private isTrackedSession(sessionId: string): boolean {
    return this.trackedSessionIds.has(sessionId);
  }

  /** Whether the aggregator currently processes events for the session. */
  isTracked(sessionId: string): boolean {
    return this.trackedSessionIds.has(sessionId);
  }

  private getParentSessionId(sessionId: string): string | null {
    if (this.trackedSessionIds.has(sessionId)) {
      return sessionId;
    }

    return this.trackedSessionParents.get(sessionId) ?? null;
  }

  /** Stashes an event for an unknown session; returns true when buffered. */
  private bufferEarlyEvent(sessionId: string, event: Event): boolean {
    const tracked =
      this.trackedSessionIds.has(sessionId) || this.trackedSessionParents.has(sessionId);
    if (tracked) {
      return false;
    }

    // The global stream carries foreign sessions too: cap the whole buffer so
    // sessions that are never tracked cannot accumulate memory.
    if (!this.pendingEarlyEventsBySession.has(sessionId)) {
      while (
        this.pendingEarlyEventsBySession.size >= SummaryAggregator.EARLY_EVENT_SESSIONS
      ) {
        const oldest = this.pendingEarlyEventsBySession.keys().next();
        if (oldest.done || oldest.value === undefined) {
          break;
        }
        this.pendingEarlyEventsBySession.delete(oldest.value);
      }
    }

    const now = Date.now();
    const buffered = this.pendingEarlyEventsBySession.get(sessionId) ?? [];
    const fresh = buffered.filter(
      (entry) => now - entry.at < SummaryAggregator.EARLY_EVENT_TTL_MS,
    );
    fresh.push({ event, at: now });
    while (fresh.length > SummaryAggregator.EARLY_EVENTS_PER_SESSION) {
      fresh.shift();
    }
    this.pendingEarlyEventsBySession.set(sessionId, fresh);
    return true;
  }

  /** Replays buffered early events now that the session is tracked. */
  private replayEarlyEvents(sessionId: string): void {
    const buffered = this.pendingEarlyEventsBySession.get(sessionId);
    if (!buffered || buffered.length === 0) {
      return;
    }

    this.pendingEarlyEventsBySession.delete(sessionId);
    const now = Date.now();
    for (const entry of buffered) {
      if (now - entry.at >= SummaryAggregator.EARLY_EVENT_TTL_MS) {
        continue;
      }
      this.processEvent(entry.event);
    }
  }

  private isTrackedChildSession(sessionId: string): boolean {
    const parentSessionId = this.trackedSessionParents.get(sessionId);
    return typeof parentSessionId === "string" && parentSessionId.length > 0;
  }

  private getQueue(map: Map<string, string[]>, parentSessionId: string): string[] {
    const existing = map.get(parentSessionId);
    if (existing) {
      return existing;
    }

    const queue: string[] = [];
    map.set(parentSessionId, queue);
    return queue;
  }

  private dequeue(map: Map<string, string[]>, parentSessionId: string): string | undefined {
    const queue = map.get(parentSessionId);
    if (!queue || queue.length === 0) {
      return undefined;
    }

    const value = queue.shift();
    if (queue.length === 0) {
      map.delete(parentSessionId);
    }

    return value;
  }

  private removeFromQueue(
    map: Map<string, string[]>,
    parentSessionId: string,
    value: string,
  ): void {
    const queue = map.get(parentSessionId);
    if (!queue) {
      return;
    }

    const index = queue.indexOf(value);
    if (index >= 0) {
      queue.splice(index, 1);
    }

    if (queue.length === 0) {
      map.delete(parentSessionId);
    }
  }

  setOnComplete(callback: MessageCompleteCallback): void {
    this.onCompleteCallback = callback;
  }

  setOnMessageUpdated(callback: MessageUpdatedCallback): void {
    this.onMessageUpdatedCallback = callback;
  }

  setOnTool(callback: ToolCallback): void {
    this.onToolCallback = callback;
  }

  setOnToolFile(callback: ToolFileCallback): void {
    this.onToolFileCallback = callback;
  }

  setOnQuestion(callback: QuestionCallback): void {
    this.onQuestionCallback = callback;
  }

  setOnQuestionSettled(callback: QuestionSettledCallback): void {
    this.onQuestionSettledCallback = callback;
  }

  setOnQuestionError(callback: QuestionErrorCallback): void {
    this.onQuestionErrorCallback = callback;
  }

  setOnThinking(callback: ThinkingCallback): void {
    this.onThinkingCallback = callback;
  }

  setOnTypingIndicator(callback: TypingIndicatorCallback): void {
    this.onTypingIndicatorCallback = callback;
  }

  setOnTokens(callback: TokensCallback): void {
    this.onTokensCallback = callback;
  }

  setOnSessionCompacted(callback: SessionCompactedCallback): void {
    this.onSessionCompactedCallback = callback;
  }

  setOnSessionIdle(callback: SessionIdleCallback): void {
    this.onSessionIdleCallback = callback;
  }

  setOnSessionError(callback: SessionErrorCallback): void {
    this.onSessionErrorCallback = callback;
  }

  setOnSessionRetry(callback: SessionRetryCallback): void {
    this.onSessionRetryCallback = callback;
  }

  setOnSubagent(callback: SubagentCallback): void {
    this.onSubagentCallback = callback;
  }

  setOnPermission(callback: PermissionCallback): void {
    this.onPermissionCallback = callback;
  }

  setOnPermissionReplied(callback: PermissionRepliedCallback): void {
    this.onPermissionRepliedCallback = callback;
  }

  setOnSessionDiff(callback: SessionDiffCallback): void {
    this.onSessionDiffCallback = callback;
  }

  setOnFileChange(callback: FileChangeCallback): void {
    this.onFileChangeCallback = callback;
  }

  setOnCleared(callback: ClearedCallback): void {
    this.onClearedCallback = callback;
  }

  private hasActiveMessageForSession(sessionId: string): boolean {
    for (const value of this.messages.values()) {
      if (value.sessionId === sessionId && value.role === "assistant") {
        return true;
      }
    }

    return false;
  }

  private emitTypingIndicators(): void {
    const callback = this.onTypingIndicatorCallback;
    if (!callback) {
      return;
    }

    for (const sessionId of this.activeTypingSessions) {
      try {
        callback(sessionId);
      } catch (error) {
        logger.error("[Aggregator] Typing callback failed", { sessionId }, error);
      }
    }
  }

  private startTypingIndicator(sessionId: string): void {
    this.activeTypingSessions.add(sessionId);

    if (this.typingTimer) {
      return;
    }

    this.emitTypingIndicators();
    this.typingTimer = setInterval(() => {
      this.emitTypingIndicators();
    }, 4000);
  }

  stopTypingIndicator(sessionId?: string): void {
    if (sessionId) {
      this.activeTypingSessions.delete(sessionId);
    } else {
      this.activeTypingSessions.clear();
    }

    if (!this.typingTimer || this.activeTypingSessions.size > 0) {
      return;
    }

    clearInterval(this.typingTimer);
    this.typingTimer = null;
  }

  processEvent(event: Event): void {
    try {
      // Log all question-related events for debugging
      if (event.type.startsWith("question.")) {
        logger.info(
          `[Aggregator] Question event: ${event.type}`,
          JSON.stringify(event.properties, null, 2),
        );
      }

      // Live usage totals from the server (not a V1 event): refresh context
      // numbers mid-run without waiting for the next assistant completion.
      if ((event as { type?: unknown }).type === "session.usage.updated") {
        this.handleUsageUpdated(event);
        return;
      }

      // Log all session-related events for debugging
      if (event.type.startsWith("session.")) {
        logger.debug(
          `[Aggregator] Session event: ${event.type}`,
          JSON.stringify(event.properties, null, 2),
        );
      }

      switch (event.type) {
        case "session.created":
        case "session.updated":
          this.handleSessionCreatedOrUpdated(
            event as Event & {
              type: "session.created" | "session.updated";
            },
          );
          break;
        case "message.updated":
          this.handleMessageUpdated(event);
          break;
        case "message.part.updated":
          this.handleMessagePartUpdated(event);
          break;
        case "message.part.delta":
          this.handleMessagePartDelta(event);
          break;
        case "session.status":
          this.handleSessionStatus(event);
          break;
        case "session.idle":
          this.handleSessionIdle(event);
          break;
        case "session.compacted":
          this.handleSessionCompacted(event);
          break;
        case "session.error":
          this.handleSessionError(event);
          break;
        case "question.asked":
          this.handleQuestionAsked(event);
          break;
        case "question.replied":
          this.handleQuestionSettled(event, "answered");
          break;
        case "question.rejected":
          this.handleQuestionSettled(event, "cancelled");
          break;
        case "session.diff":
          this.handleSessionDiff(event);
          break;
        case "permission.asked":
          this.handlePermissionAsked(event);
          break;
        case "permission.replied":
          this.handlePermissionReplied(event);
          break;
        default:
          logger.debug(`[Aggregator] Unhandled event type: ${event.type}`);
          break;
      }
    } catch (error) {
      logger.error(
        "[Aggregator] Failed to process event",
        {
          eventType: event.type,
          sessionId: extractEventSessionId(event),
        },
        error,
      );
    }
  }

  setSession(sessionId: string): void {
    this.trackedSessionIds.add(sessionId);
    this.trackedSessionParents.set(sessionId, null);
    this.replayEarlyEvents(sessionId);
  }

  clearSession(sessionId: string): void {
    this.trackedSessionIds.delete(sessionId);
    this.trackedSessionParents.delete(sessionId);
    this.stopTypingIndicator(sessionId);

    for (const [messageKey, message] of this.messages.entries()) {
      if (message.sessionId !== sessionId) {
        continue;
      }

      this.messages.delete(messageKey);
      this.currentMessageParts.delete(messageKey);
      this.pendingParts.delete(messageKey);
      this.stepFinishCosts.delete(messageKey);
      this.lastStreamedMessageText.delete(messageKey);
      this.thinkingFiredForMessages.delete(messageKey);
      this.clearDeltaStateForMessage(messageKey);
      this.clearSnapshotStateForMessage(messageKey);
      this.clearCompletionTimer(messageKey);
    }

    this.latestCumulativeUsageBySession.delete(sessionId);
    this.usageBaselineBySession.delete(sessionId);
    this.lastStepTokensBySession.delete(sessionId);
    this.pendingEarlyEventsBySession.delete(sessionId);
    this.clearProcessedToolStatesForSession(sessionId);

    for (const [trackedSessionId, parentSessionId] of Array.from(
      this.trackedSessionParents.entries(),
    )) {
      if (parentSessionId === sessionId) {
        this.trackedSessionParents.delete(trackedSessionId);
        this.subagentCardIdBySessionId.delete(trackedSessionId);
      }
    }

    this.clearSubagentsForParent(sessionId);
  }

  clear(): void {
    this.stopTypingIndicator();
    this.trackedSessionIds.clear();
    this.trackedSessionParents.clear();
    this.currentMessageParts.clear();
    this.pendingParts.clear();
    this.messages.clear();
    this.stepFinishCosts.clear();
    this.lastStreamedMessageText.clear();
    this.deltaTextByPart.clear();
    this.deltaCompletedParts.clear();
    this.partSnapshotByKey.clear();
    this.latestCumulativeUsageBySession.clear();
    this.usageBaselineBySession.clear();
    this.lastStepTokensBySession.clear();
    this.pendingEarlyEventsBySession.clear();
    for (const timer of this.completionTimers.values()) {
      clearTimeout(timer);
    }
    this.completionTimers.clear();
    this.processedToolStates.clear();
    this.thinkingFiredForMessages.clear();
    this.subagentStates.clear();
    this.subagentOrderByParent.clear();
    this.subagentCardIdBySessionId.clear();
    this.pendingSubagentCardIdsByParent.clear();
    this.pendingChildSessionIdsByParent.clear();
    this.fallbackSubagentCardIdsByParent.clear();
    this.messageCount = 0;
    this.lastUpdated = 0;

    if (this.onClearedCallback) {
      try {
        this.onClearedCallback();
      } catch (err) {
        logger.error("[Aggregator] Error in clear callback:", err);
      }
    }
  }

  private clearSubagentsForParent(parentSessionId: string): void {
    const cardIds = this.subagentOrderByParent.get(parentSessionId) ?? [];

    for (const cardId of cardIds) {
      const subagent = this.subagentStates.get(cardId);
      if (subagent?.sessionId) {
        this.subagentCardIdBySessionId.delete(subagent.sessionId);
      }
      this.subagentStates.delete(cardId);
    }

    this.subagentOrderByParent.delete(parentSessionId);
    this.pendingSubagentCardIdsByParent.delete(parentSessionId);
    this.pendingChildSessionIdsByParent.delete(parentSessionId);
    this.fallbackSubagentCardIdsByParent.delete(parentSessionId);
  }

  private emitSubagentState(parentSessionId: string): void {
    if (
      !this.onSubagentCallback ||
      (!this.trackedSessionIds.has(parentSessionId) &&
        !this.isTrackedChildSession(parentSessionId))
    ) {
      return;
    }

    const cardIds = this.subagentOrderByParent.get(parentSessionId) ?? [];
    const subagents = cardIds
      .map((cardId) => this.subagentStates.get(cardId))
      .filter((state): state is SubagentState => Boolean(state))
      .sort((left, right) => left.createdAt - right.createdAt)
      .map((state) => ({
        cardId: state.cardId,
        sessionId: state.sessionId,
        parentSessionId: state.parentSessionId,
        agent: state.agent,
        description: state.description,
        prompt: state.prompt,
        command: state.command,
        status: state.status,
        providerID: state.providerID,
        modelID: state.modelID,
        currentTool: state.currentTool,
        currentToolInput: state.currentToolInput ? { ...state.currentToolInput } : undefined,
        currentToolTitle: state.currentToolTitle,
        terminalMessage: state.terminalMessage,
        updatedAt: state.updatedAt,
      }));

    this.onSubagentCallback(parentSessionId, subagents);
  }

  private createSubagentState(parentSessionId: string, sessionId: string | null): SubagentState {
    const cardId = `subagent-${parentSessionId}-${Date.now()}-${this.subagentStates.size}`;
    const state: SubagentState = {
      cardId,
      sessionId,
      parentSessionId,
      agent: "",
      description: "",
      prompt: "",
      status: "pending",
      providerID: undefined,
      modelID: undefined,
      currentTool: undefined,
      currentToolInput: undefined,
      currentToolTitle: undefined,
      terminalMessage: undefined,
      updatedAt: Date.now(),
      hasSubtaskMetadata: false,
      hasTaskToolMetadata: false,
      hasSessionTitleMetadata: false,
      createdAt: Date.now(),
    };

    this.subagentStates.set(cardId, state);
    this.getQueue(this.subagentOrderByParent, parentSessionId).push(cardId);
    if (sessionId) {
      this.subagentCardIdBySessionId.set(sessionId, cardId);
    }
    return state;
  }

  private enrichSubagentFromSubtask(
    state: SubagentState,
    details: { agent: string; description: string; prompt: string; command?: string },
  ): void {
    state.agent = details.agent || state.agent;
    state.description = details.description || details.prompt || state.description;
    state.prompt = details.prompt;
    state.command = details.command;
    state.hasSubtaskMetadata = true;
    state.updatedAt = Date.now();
  }

  private enrichSubagentFromTaskTool(
    state: SubagentState,
    details: { agent?: string; description?: string; prompt?: string; command?: string },
  ): void {
    const nextDescription = details.description?.trim() || details.prompt?.trim();
    if (details.agent?.trim()) {
      state.agent = details.agent.trim();
    }
    if (nextDescription) {
      state.description = nextDescription;
    }
    if (details.prompt?.trim()) {
      state.prompt = details.prompt.trim();
    }
    if (details.command?.trim()) {
      state.command = details.command.trim();
    }
    state.hasTaskToolMetadata = true;
    state.updatedAt = Date.now();
  }

  private enrichSubagentFromSessionTitle(state: SubagentState, title?: string): void {
    const trimmedTitle = title?.trim();
    if (!trimmedTitle) {
      return;
    }

    const match = trimmedTitle.match(/^(.*?)(?:\s+\(@([^\s)]+)\s+subagent\))?$/i);
    const rawDescription = match?.[1]?.trim() || trimmedTitle;
    const rawAgent = match?.[2]?.trim();

    if (rawDescription) {
      state.description = rawDescription;
    }

    if (rawAgent) {
      state.agent = rawAgent.replace(/^@/, "");
    }

    state.hasSessionTitleMetadata = true;
    state.updatedAt = Date.now();
  }

  private attachSessionToSubagent(cardId: string, sessionId: string): void {
    const state = this.subagentStates.get(cardId);
    if (!state) {
      return;
    }

    state.sessionId = sessionId;
    state.updatedAt = Date.now();
    this.subagentCardIdBySessionId.set(sessionId, cardId);
    this.removeFromQueue(this.pendingSubagentCardIdsByParent, state.parentSessionId, cardId);
  }

  private findNextSubagentForTaskTool(parentSessionId: string): SubagentState | null {
    const cardIds = this.subagentOrderByParent.get(parentSessionId) ?? [];
    for (const cardId of cardIds) {
      const state = this.subagentStates.get(cardId);
      if (state && !state.hasTaskToolMetadata) {
        return state;
      }
    }

    return null;
  }

  private updateSubagentFromTaskTool(
    parentSessionId: string,
    input?: { [key: string]: unknown },
  ): void {
    const subagent = this.findNextSubagentForTaskTool(parentSessionId);
    if (!subagent || !input) {
      return;
    }

    const description = typeof input.description === "string" ? input.description : undefined;
    const prompt = typeof input.prompt === "string" ? input.prompt : undefined;
    const agent = typeof input.subagent_type === "string" ? input.subagent_type : undefined;
    const command = typeof input.command === "string" ? input.command : undefined;

    if (!description && !prompt && !agent && !command) {
      return;
    }

    this.enrichSubagentFromTaskTool(subagent, { agent, description, prompt, command });
    this.emitSubagentState(parentSessionId);
  }

  private getOrCreateSubagentForSession(sessionId: string): SubagentState {
    const existingCardId = this.subagentCardIdBySessionId.get(sessionId);
    if (existingCardId) {
      return this.subagentStates.get(existingCardId)!;
    }

    const parentSessionId = this.getParentSessionId(sessionId) ?? sessionId;
    this.removeFromQueue(this.pendingChildSessionIdsByParent, parentSessionId, sessionId);
    const state = this.createSubagentState(parentSessionId, sessionId);
    this.getQueue(this.fallbackSubagentCardIdsByParent, parentSessionId).push(state.cardId);
    return state;
  }

  private registerSubtaskPart(
    parentSessionId: string,
    partId: string,
    agent: string,
    description: string,
    prompt: string,
    command?: string,
  ): void {
    const fallbackCardId = this.dequeue(this.fallbackSubagentCardIdsByParent, parentSessionId);
    if (fallbackCardId) {
      const fallbackState = this.subagentStates.get(fallbackCardId);
      if (fallbackState) {
        this.enrichSubagentFromSubtask(fallbackState, { agent, description, prompt, command });
        this.emitSubagentState(parentSessionId);
        return;
      }
    }

    const state = this.createSubagentState(parentSessionId, null);
    this.enrichSubagentFromSubtask(state, { agent, description, prompt, command });

    const pendingChildSessionId = this.dequeue(
      this.pendingChildSessionIdsByParent,
      parentSessionId,
    );
    if (pendingChildSessionId) {
      this.attachSessionToSubagent(state.cardId, pendingChildSessionId);
    } else {
      this.getQueue(this.pendingSubagentCardIdsByParent, parentSessionId).push(state.cardId);
    }

    this.emitSubagentState(parentSessionId);
  }

  private trackChildSession(sessionId: string, parentSessionId: string): void {
    this.trackedSessionParents.set(sessionId, parentSessionId);

    const pendingCardId = this.dequeue(this.pendingSubagentCardIdsByParent, parentSessionId);
    if (pendingCardId) {
      this.attachSessionToSubagent(pendingCardId, sessionId);
      this.emitSubagentState(parentSessionId);
    } else {
      this.getQueue(this.pendingChildSessionIdsByParent, parentSessionId).push(sessionId);
    }

    this.replayEarlyEvents(sessionId);
  }

  private handleSessionCreatedOrUpdated(
    event: Event & {
      type: "session.created" | "session.updated";
    },
  ): void {
    const info = (event.properties as { info?: { id?: string; parentID?: string; title?: string } })
      .info;
    if (!info?.id || !info.parentID) {
      return;
    }

    // Depth-1 subagents hang off tracked roots; deeper nesting hangs off
    // tracked children so grandchild transcripts land in the child topic.
    const isRootParent = this.trackedSessionIds.has(info.parentID);
    if (!isRootParent && !this.isTrackedChildSession(info.parentID)) {
      return;
    }

    if (!this.trackedSessionParents.has(info.id)) {
      this.trackChildSession(info.id, info.parentID);
    }

    const subagent = this.getOrCreateSubagentForSession(info.id);
    this.enrichSubagentFromSessionTitle(subagent, info.title);
    this.emitSubagentState(info.parentID);
  }

  private updateSubagentFromAssistantMessage(info: {
    sessionID: string;
    providerID?: string;
    modelID?: string;
    agent?: string;
  }): void {
    const subagent = this.getOrCreateSubagentForSession(info.sessionID);
    if (info.agent) {
      subagent.agent = info.agent;
    }
    if (info.providerID) {
      subagent.providerID = info.providerID;
    }
    if (info.modelID) {
      subagent.modelID = info.modelID;
    }
    subagent.status = "running";
    subagent.terminalMessage = undefined;
    subagent.updatedAt = Date.now();
    this.emitSubagentState(subagent.parentSessionId);
  }

  private updateSubagentToolState(
    sessionId: string,
    state: ToolState,
    tool: string,
    input?: { [key: string]: unknown },
    title?: string,
  ): void {
    const subagent = this.getOrCreateSubagentForSession(sessionId);
    const status = "status" in state ? state.status : undefined;

    if (status === "running" || status === "pending") {
      subagent.status = "running";
      subagent.terminalMessage = undefined;
    }

    subagent.currentTool = tool;
    subagent.currentToolInput = input ? { ...input } : undefined;
    subagent.currentToolTitle = title;
    subagent.updatedAt = Date.now();
    this.emitSubagentState(subagent.parentSessionId);
  }

  private updateSubagentStepStart(sessionId: string, snapshot?: string): void {
    const subagent = this.getOrCreateSubagentForSession(sessionId);
    subagent.status = "running";
    subagent.terminalMessage = undefined;
    subagent.currentTool = undefined;
    subagent.currentToolInput = undefined;
    subagent.currentToolTitle = snapshot?.trim() || subagent.currentToolTitle;
    subagent.updatedAt = Date.now();
    this.emitSubagentState(subagent.parentSessionId);
  }

  private updateSubagentStepFinish(sessionId: string, snapshot?: string): void {
    const subagent = this.getOrCreateSubagentForSession(sessionId);
    subagent.status = "running";
    subagent.terminalMessage = undefined;
    if (snapshot?.trim()) {
      subagent.currentToolTitle = snapshot.trim();
    }
    subagent.updatedAt = Date.now();
    this.emitSubagentState(subagent.parentSessionId);
  }

  private setSubagentTerminalStatus(
    sessionId: string,
    status: Extract<SubagentStatus, "completed" | "error">,
    terminalMessage?: string,
  ): void {
    const cardId = this.subagentCardIdBySessionId.get(sessionId);
    if (!cardId) {
      return;
    }

    const subagent = this.subagentStates.get(cardId);
    if (!subagent) {
      return;
    }

    subagent.status = status;
    subagent.currentTool = undefined;
    subagent.currentToolInput = undefined;
    subagent.currentToolTitle = undefined;
    subagent.terminalMessage = terminalMessage?.trim() || undefined;
    subagent.updatedAt = Date.now();
    this.emitSubagentState(subagent.parentSessionId);
  }

  /**
   * Inserts or replaces a text chunk keyed by its part id. Replays of the
   * same part replace in place (matched by key, never by text content, so
   * duplicate texts across different parts cannot confuse the lookup), and
   * brand-new translator parts are ordered by their `:text:<ordinal>`
   * suffix so out-of-order arrivals still read correctly.
   */
  private upsertPartEntry(
    entries: MessagePartEntry[],
    key: string | null,
    text: string,
  ): void {
    if (key !== null) {
      const existingIndex = entries.findIndex((entry) => entry.key === key);
      if (existingIndex >= 0) {
        entries[existingIndex] = { key, text };
        return;
      }

      const ordinal = parseTextOrdinalFromPartKey(key);
      if (ordinal !== null) {
        for (let index = 0; index < entries.length; index++) {
          const entryKey = entries[index]?.key;
          if (!entryKey) {
            continue;
          }

          const entryOrdinal = parseTextOrdinalFromPartKey(entryKey);
          if (entryOrdinal !== null && entryOrdinal > ordinal) {
            entries.splice(index, 0, { key, text });
            return;
          }
        }
      }
    }

    entries.push({ key, text });
  }

  private handleMessageUpdated(
    event: Event & {
      type: "message.updated";
    },
  ): void {
    const { info } = event.properties;

    const isChildSession = this.isTrackedChildSession(info.sessionID);
    if (isChildSession && info.role === "assistant") {
      this.updateSubagentFromAssistantMessage(
        info as {
          sessionID: string;
          providerID?: string;
          modelID?: string;
          agent?: string;
        },
      );
    }

    if (!this.isTrackedSession(info.sessionID) && !isChildSession) {
      this.bufferEarlyEvent(info.sessionID, event);
      return;
    }

    const messageID = info.id;
    const messageKey = this.getMessageKey(info.sessionID, messageID);

    if (info.role !== "assistant") {
      return;
    }

    this.messages.set(messageKey, { role: info.role, sessionId: info.sessionID });

    if (!this.currentMessageParts.has(messageKey)) {
      this.currentMessageParts.set(messageKey, []);
      this.messageCount++;
      this.startTypingIndicator(info.sessionID);
    }

    const pending = this.pendingParts.get(messageKey) || [];
    if (pending.length > 0) {
      const current = this.currentMessageParts.get(messageKey) || [];
      for (const entry of pending) {
        this.upsertPartEntry(current, entry.key, entry.text);
      }
      this.currentMessageParts.set(messageKey, current);
      this.pendingParts.delete(messageKey);
    }
    this.emitMessageUpdated(messageKey, info.sessionID);

    const assistantMessage = info as { time?: { created: number; completed?: number } };
    const time = assistantMessage.time;

    if (time?.completed) {
      // Extract and report tokens BEFORE onComplete so keyboard context is updated
      const assistantInfo = info as {
        cost?: number;
        tokens?: {
          input: number;
          output: number;
          reasoning: number;
          cache: { read: number; write: number };
        };
      };

      const messageCost =
        typeof assistantInfo.cost === "number"
          ? assistantInfo.cost
          : this.stepFinishCosts.get(messageKey) || 0;

      if (this.onTokensCallback && (assistantInfo.tokens || messageCost > 0)) {
        const tokens: TokensInfo = {
          input: assistantInfo.tokens?.input || 0,
          output: assistantInfo.tokens?.output || 0,
          reasoning: assistantInfo.tokens?.reasoning || 0,
          cacheRead: assistantInfo.tokens?.cache?.read || 0,
          cacheWrite: assistantInfo.tokens?.cache?.write || 0,
          cost: messageCost,
        };
        logger.debug(
          `[Aggregator] Tokens: input=${tokens.input}, output=${tokens.output}, reasoning=${tokens.reasoning}, cost=${tokens.cost}`,
        );
        // Call synchronously so keyboardManager is updated before onComplete sends the reply
        this.onTokensCallback(info.sessionID, tokens);

        // Anchor for live estimates: the exact context of this completed step.
        this.lastStepTokensBySession.set(info.sessionID, {
          input: tokens.input,
          cacheRead: tokens.cacheRead,
        });
        this.anchorUsageBaseline(info.sessionID);
      }

      this.scheduleMessageCompletion(messageKey, info.sessionID);
    }

    if (!time?.completed) {
      // Step start: anchor live usage growth to the latest cumulative totals.
      this.anchorUsageBaseline(info.sessionID);
    }

    this.lastUpdated = Date.now();
  }

  private handleMessagePartUpdated(
    event: Event & {
      type: "message.part.updated";
    },
  ): void {
    const { part } = event.properties;

    const isCurrentRootSession = this.isTrackedSession(part.sessionID);
    const isTrackedChildSession = this.isTrackedChildSession(part.sessionID);

    if (!isCurrentRootSession && !isTrackedChildSession) {
      this.bufferEarlyEvent(part.sessionID, event);
      return;
    }

    if (part.type === "subtask") {
      this.registerSubtaskPart(
        part.sessionID,
        part.id,
        (part as { agent?: string }).agent || "",
        (part as { description?: string }).description || "",
        (part as { prompt?: string }).prompt || "",
        (part as { command?: string }).command,
      );
      this.lastUpdated = Date.now();
      return;
    }

    if (isTrackedChildSession) {
      if (part.type === "tool") {
        const state = part.state;
        const input = "input" in state ? (state.input as { [key: string]: unknown }) : undefined;
        const title = "title" in state ? state.title : undefined;
        this.updateSubagentToolState(part.sessionID, state, part.tool, input, title);
        // Falls through to the shared tool dispatch below so the transcript
        // topic shows the same tool activity as the parent card's current tool.
      } else if (part.type === "step-start") {
        this.updateSubagentStepStart(part.sessionID, (part as { snapshot?: string }).snapshot);
        this.lastUpdated = Date.now();
        return;
      } else if (part.type === "step-finish") {
        this.updateSubagentStepFinish(part.sessionID, (part as { snapshot?: string }).snapshot);
        this.lastUpdated = Date.now();
        return;
      } else if (part.type !== "text" || !("text" in part) || !part.text) {
        this.lastUpdated = Date.now();
        return;
      }
      // Child text parts use the shared snapshot handling below so the
      // transcript topic streams the same text as the final message.
    }

    const messageID = part.messageID;
    const messageKey = this.getMessageKey(part.sessionID, messageID);
    const messageInfo = this.messages.get(messageKey);

    if (part.type === "reasoning") {
      // Fire the thinking callback once per message on the first reasoning part.
      // This is the signal that the model is actually doing extended thinking.
      if (!this.thinkingFiredForMessages.has(messageKey) && this.onThinkingCallback) {
        this.thinkingFiredForMessages.add(messageKey);
        const callback = this.onThinkingCallback;
        const sessionID = part.sessionID;
        callback(sessionID);
      }
    } else if (part.type === "text" && "text" in part && part.text) {
      // Deltas already streamed live for this part are an overlay only; the
      // full snapshot arriving here is authoritative. Drop the overlay so the
      // suffix is not counted twice, then upsert the snapshot as usual.
      const deltaPartKey = `${messageKey}:${part.id}`;
      this.deltaTextByPart.delete(deltaPartKey);
      this.deltaCompletedParts.add(deltaPartKey);

      const snapshotKey = `${messageKey}:${part.id}`;
      this.partSnapshotByKey.set(snapshotKey, part.text);

      if (messageInfo && messageInfo.role === "assistant") {
        if (!this.currentMessageParts.has(messageKey)) {
          this.currentMessageParts.set(messageKey, []);
          this.startTypingIndicator(part.sessionID);
        }

        const parts = this.currentMessageParts.get(messageKey)!;
        // The same part can be re-emitted (replay, regeneration, reconnect):
        // upsert by part key instead of appending, or the live and final
        // messages repeat the same text over and over.
        this.upsertPartEntry(parts, snapshotKey, part.text);
        this.emitMessageUpdated(messageKey, part.sessionID);

        if (this.completionTimers.has(messageKey)) {
          this.scheduleMessageCompletion(messageKey, part.sessionID);
        }
      } else {
        if (!this.pendingParts.has(messageKey)) {
          this.pendingParts.set(messageKey, []);
        }

        const pending = this.pendingParts.get(messageKey)!;
        // Same key replaces; an identical replay is ignored so the later
        // merge cannot duplicate it.
        this.upsertPartEntry(pending, snapshotKey, part.text);
      }
    } else if (part.type === "tool") {
      const state = part.state;
      const toolMetadata = (state as { metadata?: { [key: string]: unknown } }).metadata;
      const input = "input" in state ? (state.input as { [key: string]: unknown }) : undefined;
      const title = "title" in state ? state.title : undefined;

      logger.debug(
        `[Aggregator] Tool event: callID=${part.callID}, tool=${part.tool}, status=${"status" in state ? state.status : "unknown"}`,
      );

      if (part.tool === "task") {
        this.updateSubagentFromTaskTool(part.sessionID, input);
      }

      if (part.tool === "question") {
        logger.debug(`[Aggregator] Question tool part update:`, JSON.stringify(part, null, 2));

        // If the question tool fails, clear the active poll
        // so the agent can recreate it with corrected data
        if ("status" in state && state.status === "error") {
          logger.info(
            `[Aggregator] Question tool failed with error, clearing active poll. callID=${part.callID}`,
          );
          if (this.onQuestionErrorCallback) {
            this.onQuestionErrorCallback();
          }
          return;
        }

        // NOTE: Questions are now handled via "question.asked" event, not via tool part updates.
        // This ensures we have access to the requestID needed for question.reply().
      }

      const status = "status" in state ? state.status : undefined;
      const shouldEmitToolUpdate =
        status === "running" || status === "completed" || status === "error";

      if (shouldEmitToolUpdate) {
        const processedStateKey = `${part.callID}:${status}`;

        if (this.markProcessedToolState(processedStateKey, part.sessionID)) {

          const toolData: ToolInfo = {
            sessionId: part.sessionID,
            messageId: messageID,
            callId: part.callID,
            tool: part.tool,
            state: part.state,
            input,
            title,
            metadata: toolMetadata,
            hasFileAttachment: false,
          };

          if (this.onToolCallback) {
            this.onToolCallback(toolData);
          }
        }
      }

      if (status === "completed") {
        logger.debug(
          `[Aggregator] Tool completed: callID=${part.callID}, tool=${part.tool}`,
          JSON.stringify(state, null, 2),
        );

        const completedKey = `completed-file-${part.callID}`;

        if (this.markProcessedToolState(completedKey, part.sessionID)) {

          const preparedFiles = this.prepareToolFiles(
            part.tool,
            input,
            title,
            toolMetadata,
          );

          const toolData: ToolInfo = {
            sessionId: part.sessionID,
            messageId: messageID,
            callId: part.callID,
            tool: part.tool,
            state: part.state,
            input,
            title,
            metadata: toolMetadata,
            hasFileAttachment: preparedFiles.files.some((entry) => entry.fileData),
          };

          const filesWithData = preparedFiles.files.filter((entry) => entry.fileData);
          if (filesWithData.length > 0 && this.onToolFileCallback) {
            logger.debug(
              `[Aggregator] Sending ${part.tool} files: ${filesWithData
                .map((entry) => entry.fileData?.filename ?? "?")
                .join(", ")}`,
            );
            this.onToolFileCallback({
              ...toolData,
              hasFileAttachment: true,
              files: preparedFiles.files,
            });
          }

          for (const entry of preparedFiles.files) {
            if (entry.fileChange && this.onFileChangeCallback) {
              this.onFileChangeCallback(entry.fileChange, toolData.sessionId);
            }
          }
        }
      }
    } else if (part.type === "step-finish" && typeof part.cost === "number") {
      const currentCost = this.stepFinishCosts.get(messageKey) || 0;
      this.stepFinishCosts.set(messageKey, currentCost + part.cost);
    }

    this.lastUpdated = Date.now();
  }

  private getDeltaSuffix(messageKey: string): string {
    const prefix = `${messageKey}:`;
    const overlays: Array<{ ordinal: number | null; index: number; text: string }> = [];
    let index = 0;

    for (const [key, text] of this.deltaTextByPart) {
      if (key.startsWith(prefix)) {
        overlays.push({ ordinal: parseTextOrdinalFromPartKey(key), index, text });
      }
      index++;
    }

    overlays.sort((left, right) => {
      if (left.ordinal !== null && right.ordinal !== null && left.ordinal !== right.ordinal) {
        return left.ordinal - right.ordinal;
      }
      return left.index - right.index;
    });

    return overlays.map((overlay) => overlay.text).join("");
  }

  private clearDeltaStateForMessage(messageKey: string): void {
    const prefix = `${messageKey}:`;

    for (const key of Array.from(this.deltaTextByPart.keys())) {
      if (key.startsWith(prefix)) {
        this.deltaTextByPart.delete(key);
      }
    }

    for (const key of Array.from(this.deltaCompletedParts)) {
      if (key.startsWith(prefix)) {
        this.deltaCompletedParts.delete(key);
      }
    }
  }

  private clearSnapshotStateForMessage(messageKey: string): void {
    const prefix = `${messageKey}:`;

    for (const key of Array.from(this.partSnapshotByKey.keys())) {
      if (key.startsWith(prefix)) {
        this.partSnapshotByKey.delete(key);
      }
    }
  }

  private handleMessagePartDelta(
    event: Event & {
      type: "message.part.delta";
    },
  ): void {
    const props = event.properties as unknown as {
      sessionID?: unknown;
      sessionId?: unknown;
      messageID?: unknown;
      messageId?: unknown;
      partID?: unknown;
      partId?: unknown;
      field?: unknown;
      delta?: unknown;
      type?: unknown;
      part?: {
        sessionID?: unknown;
        sessionId?: unknown;
        messageID?: unknown;
        messageId?: unknown;
        id?: unknown;
        type?: unknown;
      };
    };

    const part = props.part;
    const sessionId =
      asOptionalString(props.sessionID) ??
      asOptionalString(props.sessionId) ??
      asOptionalString(part?.sessionID) ??
      asOptionalString(part?.sessionId);
    const messageId =
      asOptionalString(props.messageID) ??
      asOptionalString(props.messageId) ??
      asOptionalString(part?.messageID) ??
      asOptionalString(part?.messageId);
    const partId =
      asOptionalString(props.partID) ??
      asOptionalString(props.partId) ??
      asOptionalString(part?.id) ??
      "text";
    const field = asOptionalString(props.field);
    const partType =
      asOptionalString(part?.type) ?? asOptionalString(props.type) ?? undefined;
    const delta = asOptionalString(props.delta);

    if (!sessionId || !messageId || !delta) {
      return;
    }

    // Only live-stream text. Reasoning and tool-input deltas are not rendered
    // as assistant text in this fork.
    if (field !== undefined && field !== "text") {
      return;
    }

    if (partType !== undefined && partType !== "text") {
      return;
    }

    const isTrackedChild = this.isTrackedChildSession(sessionId);
    if (!this.isTrackedSession(sessionId) && !isTrackedChild) {
      this.bufferEarlyEvent(sessionId, event);
      return;
    }

    const messageKey = this.getMessageKey(sessionId, messageId);
    const partKey = `${messageKey}:${partId}`;

    if (this.deltaCompletedParts.has(partKey)) {
      return;
    }

    this.deltaTextByPart.set(partKey, nextDeltaText(this.deltaTextByPart.get(partKey) ?? "", delta));

    if (!this.messages.has(messageKey)) {
      this.messages.set(messageKey, { role: "assistant", sessionId });
    }

    if (!this.currentMessageParts.has(messageKey)) {
      this.currentMessageParts.set(messageKey, []);
      this.messageCount++;
      this.startTypingIndicator(sessionId);
    }

    this.emitMessageUpdated(messageKey, sessionId);
    this.lastUpdated = Date.now();
  }

  private prepareToolFiles(
    tool: string,
    input: { [key: string]: unknown } | undefined,
    title: string | undefined,
    metadata: { [key: string]: unknown } | undefined,
  ): PreparedToolFiles {
    if (tool === "write" && input) {
      const filePath =
        typeof input.filePath === "string" ? normalizePathForDisplay(input.filePath) : "";
      const hasContent = typeof input.content === "string";
      const content = hasContent ? (input.content as string) : "";

      if (!filePath || !hasContent) {
        return { files: [] };
      }

      return {
        files: [
          {
            fileData: prepareCodeFile(content, filePath, "write"),
            fileChange: {
              file: filePath,
              additions: content.split("\n").length,
              deletions: 0,
            },
          },
        ],
      };
    }

    if (tool === "edit" && metadata) {
      const editMetadata = metadata as {
        diff?: unknown;
        filediff?: { file?: string; additions?: number; deletions?: number };
      };
      const filePath = editMetadata.filediff?.file
        ? normalizePathForDisplay(editMetadata.filediff.file)
        : "";
      const diffText = typeof editMetadata.diff === "string" ? editMetadata.diff : "";

      if (!filePath || !diffText) {
        return { files: [] };
      }

      return {
        files: [
          {
            fileData: prepareCodeFile(diffText, filePath, "edit"),
            fileChange: {
              file: filePath,
              additions: editMetadata.filediff?.additions || 0,
              deletions: editMetadata.filediff?.deletions || 0,
            },
          },
        ],
      };
    }

    if (tool === "apply_patch") {
      // Prefer the per-file list OpenCode reports: one document per changed file.
      const patchChanges = getPatchFileChanges(metadata);
      if (patchChanges.length > 0) {
        return {
          files: patchChanges.map((change) => ({
            fileData: change.diff ? prepareCodeFile(change.diff, change.path, "edit") : null,
            line: formatPatchFileLine(change),
            fileChange: {
              file: change.path,
              additions: change.additions,
              deletions: change.deletions,
            },
          })),
        };
      }

      const patchMetadata = metadata as
        | {
            filediff?: { file?: string; additions?: number; deletions?: number };
            diff?: string;
          }
        | undefined;

      const filePathFromInput =
        input && typeof input.filePath === "string"
          ? normalizePathForDisplay(input.filePath)
          : input && typeof input.path === "string"
            ? normalizePathForDisplay(input.path)
            : "";
      const filePathFromTitle = title ? extractFirstUpdatedFileFromTitle(title) : "";

      const filePath =
        (patchMetadata?.filediff?.file && normalizePathForDisplay(patchMetadata.filediff.file)) ||
        filePathFromInput ||
        normalizePathForDisplay(filePathFromTitle);
      const rawDiffText =
        typeof patchMetadata?.diff === "string"
          ? patchMetadata.diff
          : input && typeof input.patchText === "string"
            ? input.patchText
            : "";

      const applyPatchSections = rawDiffText ? parseApplyPatchSections(rawDiffText) : [];
      const matchedApplyPatchSection = filePath
        ? applyPatchSections.find((section) => section.filePath === filePath)
        : applyPatchSections.length === 1
          ? applyPatchSections[0]
          : undefined;
      const diffText = matchedApplyPatchSection?.patchText || rawDiffText;

      if (!filePath) {
        return { files: [] };
      }

      const fileChange = patchMetadata?.filediff
        ? {
            file: filePath,
            additions: patchMetadata.filediff.additions || 0,
            deletions: patchMetadata.filediff.deletions || 0,
          }
        : diffText
          ? (() => {
              const changes = countDiffChangesFromText(diffText);
              return {
                file: filePath,
                additions: changes.additions,
                deletions: changes.deletions,
              };
            })()
          : null;

      return {
        files: [
          {
            fileData: diffText ? prepareCodeFile(diffText, filePath, "edit") : null,
            fileChange,
          },
        ],
      };
    }

    return { files: [] };
  }

  private handleSessionStatus(
    event: Event & {
      type: "session.status";
    },
  ): void {
    const { sessionID, status } = event.properties as {
      sessionID: string;
      status?: {
        type?: string;
        attempt?: number;
        message?: string;
        next?: number;
      };
    };

    if (!this.isTrackedSession(sessionID)) {
      return;
    }

    if (status?.type !== "retry" || !this.onSessionRetryCallback) {
      return;
    }

    const callback = this.onSessionRetryCallback;
    const message = status.message?.trim() || "Unknown retry error";

    logger.warn(
      `[Aggregator] Session retry: session=${sessionID}, attempt=${status.attempt ?? "n/a"}, message=${message}`,
    );

    callback({
      sessionId: sessionID,
      attempt: status.attempt,
      message,
      next: status.next,
    });
  }

  private handleSessionIdle(
    event: Event & {
      type: "session.idle";
    },
  ): void {    const { sessionID } = event.properties;

    if (this.isTrackedChildSession(sessionID)) {
      logger.info(`[Aggregator] Subagent session became idle: ${sessionID}`);
      this.setSubagentTerminalStatus(sessionID, "completed");
      return;
    }

    if (!this.isTrackedSession(sessionID)) {
      return;
    }

    logger.info(`[Aggregator] Session became idle: ${sessionID}`);

    this.flushPendingCompletionsForSession(sessionID);

    if (this.onSessionIdleCallback) {
      const callback = this.onSessionIdleCallback;
      callback(sessionID);
    }
  }

  /**
   * Live usage totals pushed by the server mid-run. Feeds the same tokens
   * pipeline as completions so context numbers move while the agent works,
   * but carries no cost: cost keeps accruing only per completed assistant
   * message to avoid double counting.
   */
  private handleUsageUpdated(event: Event): void {
    const properties = (event as { properties?: unknown }).properties as
      | {
          sessionID?: unknown;
          sessionId?: unknown;
          tokens?: {
            input?: unknown;
            output?: unknown;
            reasoning?: unknown;
            cache?: { read?: unknown; write?: unknown };
          };
        }
      | undefined;

    const sessionId =
      typeof properties?.sessionID === "string"
        ? properties.sessionID
        : typeof properties?.sessionId === "string"
          ? properties.sessionId
          : null;
    if (!sessionId || !this.isTrackedSession(sessionId)) {
      return;
    }

    const numberOrZero = (value: unknown): number =>
      typeof value === "number" && Number.isFinite(value) ? value : 0;

    const tokens = properties?.tokens;
    const cacheRecord = isRecord(tokens?.cache) ? tokens?.cache : undefined;
    const input = numberOrZero(tokens?.input);
    const output = numberOrZero(tokens?.output);
    const reasoning = numberOrZero(tokens?.reasoning);
    const cacheRead = numberOrZero(cacheRecord?.read);
    const cacheWrite = numberOrZero(cacheRecord?.write);

    if (input === 0 && output === 0 && reasoning === 0 && cacheRead === 0 && cacheWrite === 0) {
      logger.debug("[Aggregator] Ignoring empty session.usage.updated", { sessionId });
      return;
    }

    // Server totals are cumulative for the whole session, not the current
    // window. Report them as live growth over the last completed step so the
    // context display moves mid-step without ever showing session totals.
    this.latestCumulativeUsageBySession.set(sessionId, { input, cacheRead });

    let baseline = this.usageBaselineBySession.get(sessionId);
    const lastStep = this.lastStepTokensBySession.get(sessionId);
    if (!lastStep) {
      logger.debug("[Aggregator] Ignoring session.usage.updated without a completed step", {
        sessionId,
      });
      return;
    }
    if (!baseline) {
      // First sight of cumulative totals for this step: anchor here so the
      // live display starts moving immediately instead of waiting for the
      // next step boundary.
      baseline = { input, cacheRead };
      this.usageBaselineBySession.set(sessionId, baseline);
    }

    let baseInput = baseline.input;
    let baseCacheRead = baseline.cacheRead;
    if (input < baseInput || cacheRead < baseCacheRead) {
      // Server counters reset (restart/reconnect): re-anchor, no fake growth.
      baseInput = input;
      baseCacheRead = cacheRead;
      this.usageBaselineBySession.set(sessionId, { input, cacheRead });
    }

    const liveTokens = {
      input: lastStep.input + Math.max(0, input - baseInput),
      output: 0,
      reasoning: 0,
      cacheRead: lastStep.cacheRead + Math.max(0, cacheRead - baseCacheRead),
      cacheWrite: 0,
      cost: 0,
    };

    const callback = this.onTokensCallback;
    if (!callback) {
      return;
    }

    void Promise.resolve(callback(sessionId, liveTokens)).catch((error) => {
      logger.error("[Aggregator] Tokens callback failed", { sessionId }, error);
    });
  }

  /**
   * Anchors live usage growth to the latest cumulative totals. Called at step
   * start and after each completed step; without a known anchor, cumulative
   * server totals must never reach the context display.
   */
  private anchorUsageBaseline(sessionId: string): void {
    const latest = this.latestCumulativeUsageBySession.get(sessionId);
    if (latest) {
      this.usageBaselineBySession.set(sessionId, { ...latest });
    } else {
      this.usageBaselineBySession.delete(sessionId);
    }
  }

  private handleSessionCompacted(
    event: Event & {
      type: "session.compacted";
    },
  ): void {
    const properties = event.properties as { sessionID: string };
    const { sessionID } = properties;

    if (!this.isTrackedSession(sessionID)) {
      return;
    }

    logger.info(`[Aggregator] Session compacted: ${sessionID}`);

    // Reload context from history after compaction
    if (this.onSessionCompactedCallback) {
      invokeCallback(async () => {
        const session = getSessionById(sessionID);
        if (session?.directory) {
          await this.onSessionCompactedCallback!(sessionID, session.directory);
        }
      }, "[Aggregator] Error in session compacted callback:");
    }
  }

  private handleSessionError(
    event: Event & {
      type: "session.error";
    },
  ): void {
    const { sessionID, error } = event.properties as {
      sessionID: string;
      error?: {
        name?: string;
        message?: string;
        data?: { message?: string };
      };
    };

    const message =
      error?.data?.message || error?.message || error?.name || "Unknown session error";

    if (this.isTrackedChildSession(sessionID)) {
      logger.warn(`[Aggregator] Subagent session error: ${sessionID}: ${message}`);
      this.setSubagentTerminalStatus(sessionID, "error", message);
      return;
    }

    if (!this.isTrackedSession(sessionID)) {
      return;
    }

    logger.warn(`[Aggregator] Session error: ${sessionID}: ${message}`);
    this.flushPendingCompletionsForSession(sessionID);
    this.stopTypingIndicator(sessionID);

    if (this.onSessionErrorCallback) {
      const callback = this.onSessionErrorCallback;
      callback(sessionID, message);
    }
  }

  private handleQuestionAsked(
    event: Event & {
      type: "question.asked";
    },
  ): void {
    const { id, sessionID, questions } = event.properties;

    if (!this.isTrackedSession(sessionID) && !this.isTrackedChildSession(sessionID)) {
      logger.debug(`[Aggregator] Ignoring question.asked for untracked session: ${sessionID}`);
      return;
    }

    logger.info(`[Aggregator] Question asked: requestID=${id}, questions=${questions.length}`);

    if (this.onQuestionCallback) {
      const callback = this.onQuestionCallback;
      invokeCallback(
        async () => await callback(sessionID, questions as Question[], id),
        "[Aggregator] Error in question callback:",
      );
    }
  }

  private handleQuestionSettled(
    event: Event & {
      type: "question.replied" | "question.rejected";
    },
    outcome: QuestionSettledOutcome,
  ): void {
    const properties = event.properties as { sessionID?: unknown; requestID?: unknown };
    const sessionId =
      typeof properties.sessionID === "string" ? properties.sessionID : null;
    const requestID =
      typeof properties.requestID === "string" ? properties.requestID : null;

    if (!sessionId && !requestID) {
      return;
    }

    logger.info(
      `[Aggregator] Question settled outside Telegram: session=${sessionId ?? "unknown"}, requestID=${requestID ?? "unknown"}, outcome=${outcome}`,
    );

    if (!this.onQuestionSettledCallback) {
      return;
    }

    const callback = this.onQuestionSettledCallback;
    invokeCallback(
      () => callback(sessionId, requestID, outcome),
      "[Aggregator] Error in question settled callback:",
    );
  }

  private handleSessionDiff(event: Event): void {
    const properties = event.properties as {
      sessionID: string;
      diff: Array<{ file: string; additions: number; deletions: number }>;
    };

    if (!this.isTrackedSession(properties.sessionID)) {
      return;
    }

    logger.debug(`[Aggregator] Session diff: ${properties.diff.length} files changed`);

    if (this.onSessionDiffCallback) {
      const diffs: FileChange[] = properties.diff.map((d) => ({
        file: d.file,
        additions: d.additions,
        deletions: d.deletions,
      }));

      const callback = this.onSessionDiffCallback;
      callback(properties.sessionID, diffs);
    }
  }

  private handlePermissionAsked(
    event: Event & {
      type: "permission.asked";
    },
  ): void {
    const request = event.properties;

    if (!this.isTrackedSession(request.sessionID) && !this.isTrackedChildSession(request.sessionID)) {
      logger.debug(
        `[Aggregator] Ignoring permission.asked for untracked session: ${request.sessionID}`,
      );
      return;
    }

    logger.info(
      `[Aggregator] Permission asked: requestID=${request.id}, type=${request.permission}, patterns=${request.patterns.length}`,
    );

    if (this.onPermissionCallback) {
      const callback = this.onPermissionCallback;
      invokeCallback(
        async () => await callback(request as PermissionRequest),
        "[Aggregator] Error in permission callback:",
      );
    }
  }

  private handlePermissionReplied(
    event: Event & {
      type: "permission.replied";
    },
  ): void {
    const properties = event.properties as { sessionID?: unknown; requestID?: unknown };
    const sessionId =
      typeof properties.sessionID === "string" ? properties.sessionID : null;
    const requestID =
      typeof properties.requestID === "string" ? properties.requestID : null;

    if (!sessionId && !requestID) {
      return;
    }

    logger.info(
      `[Aggregator] Permission settled outside Telegram: session=${sessionId ?? "unknown"}, requestID=${requestID ?? "unknown"}`,
    );

    if (!this.onPermissionRepliedCallback) {
      return;
    }

    const callback = this.onPermissionRepliedCallback;
    invokeCallback(
      () => callback(sessionId, requestID),
      "[Aggregator] Error in permission replied callback:",
    );
  }

  private clearCompletionTimer(messageKey: string): void {
    const timer = this.completionTimers.get(messageKey);
    if (!timer) {
      return;
    }

    clearTimeout(timer);
    this.completionTimers.delete(messageKey);
  }

  private emitMessageUpdated(messageKey: string, sessionId: string): void {
    if (!this.onMessageUpdatedCallback) {
      return;
    }

    const parts = this.currentMessageParts.get(messageKey) || [];
    const messageText = `${parts.map((entry) => entry.text).join("")}${this.getDeltaSuffix(messageKey)}`;
    if (!messageText) {
      return;
    }

    if (this.lastStreamedMessageText.get(messageKey) === messageText) {
      return;
    }

    this.lastStreamedMessageText.set(messageKey, messageText);
    if (!this.messages.has(messageKey)) {
      return;
    }

    const messageId = messageKey.slice(sessionId.length + 1);
    this.onMessageUpdatedCallback(sessionId, messageId, messageText);
  }

  private scheduleMessageCompletion(messageKey: string, sessionId: string): void {
    this.clearCompletionTimer(messageKey);

    const timer = setTimeout(() => {
      this.completionTimers.delete(messageKey);
      this.finalizeMessageCompletion(messageKey, sessionId);
    }, SummaryAggregator.COMPLETION_DEBOUNCE_MS);

    this.completionTimers.set(messageKey, timer);
  }

  private flushPendingCompletionsForSession(sessionId: string): void {
    for (const [messageKey, message] of this.messages.entries()) {
      if (message.sessionId !== sessionId || !this.completionTimers.has(messageKey)) {
        continue;
      }

      this.clearCompletionTimer(messageKey);
      this.finalizeMessageCompletion(messageKey, sessionId);
    }
  }

  private finalizeMessageCompletion(messageKey: string, sessionId: string): void {
    const parts = this.currentMessageParts.get(messageKey) || [];
    const messageText = `${parts.map((entry) => entry.text).join("")}${this.getDeltaSuffix(messageKey)}`;

    logger.debug(
      `[Aggregator] Message completed: messageKey=${messageKey}, textLength=${messageText.length}, totalParts=${parts.length}, session=${sessionId}`,
    );

    if (this.onCompleteCallback && messageText.length > 0) {
      const messageId = messageKey.slice(sessionId.length + 1);
      this.onCompleteCallback(sessionId, messageId, messageText);
    }

    this.currentMessageParts.delete(messageKey);
    this.messages.delete(messageKey);
    this.pendingParts.delete(messageKey);
    this.stepFinishCosts.delete(messageKey);
    this.lastStreamedMessageText.delete(messageKey);
    this.thinkingFiredForMessages.delete(messageKey);
    this.clearDeltaStateForMessage(messageKey);
    this.clearSnapshotStateForMessage(messageKey);

    logger.debug(
      `[Aggregator] Message completed cleanup: remaining messages=${this.currentMessageParts.size}`,
    );
  }
}

export const summaryAggregator = new SummaryAggregator();
