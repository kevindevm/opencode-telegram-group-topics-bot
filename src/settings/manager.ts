import type { ModelInfo } from "../model/types.js";
import type {
  ScheduledTask,
  ScheduledTaskDeliveryTarget,
  ScheduledTaskModel,
  ScheduledTaskTopicBinding,
} from "../scheduled-task/types.js";
import path from "node:path";
import {
  GLOBAL_SCOPE_KEY,
  SCOPE_CONTEXT,
  createScopeKeyFromParams,
  parseScopeKey,
} from "../bot/scope.js";
import { getRuntimePaths } from "../runtime/paths.js";
import { logger } from "../utils/logger.js";

export interface ProjectInfo {
  id: string;
  worktree: string;
  name?: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  directory: string;
}

export interface ServerProcessInfo {
  pid: number;
  startTime: string;
}

export interface SessionDirectoryCacheInfo {
  version: 1;
  lastSyncedUpdatedAt: number;
  directories: Array<{
    worktree: string;
    lastUpdated: number;
  }>;
}

export const TOPIC_SESSION_STATUS = {
  ACTIVE: "active",
  CLOSED: "closed",
  STALE: "stale",
  ABANDONED: "abandoned",
  ERROR: "error",
} as const;

export type TopicSessionStatus = (typeof TOPIC_SESSION_STATUS)[keyof typeof TOPIC_SESSION_STATUS];

export interface TopicSessionBinding {
  scopeKey: string;
  chatId: number;
  threadId: number;
  sessionId: string;
  projectId: string;
  projectWorktree?: string;
  topicName?: string;
  status: TopicSessionStatus;
  createdAt: number;
  updatedAt: number;
  closedAt?: number;
  /**
   * Marks transcript-only topics owned by a subagent run. Ephemeral bindings
   * are excluded from session re-tracking, user session lists and auto
   * pin/keyboard setup; they only route the child session's output.
   */
  ephemeral?: boolean;
}

export interface ScopeState {
  project?: ProjectInfo;
  session?: SessionInfo;
  agent?: string;
  model?: ModelInfo;
  pinnedMessageId?: number;
  ttsEnabled?: boolean;
  /** Per-scope display overrides (visible semantics per flag). Wins over global. */
  display?: Record<string, boolean>;
}

export interface TopicScopeState extends ScopeState {
  binding?: TopicSessionBinding;
}

export interface GroupSettings {
  general?: ScopeState;
  topics?: Record<string, TopicScopeState>;
}

export interface Settings {
  settingsVersion: 2;
  global?: ScopeState;
  dmScopes?: Record<string, ScopeState>;
  groups?: Record<string, GroupSettings>;
  scheduledTasks?: ScheduledTask[];
  scheduledTaskTopics?: ScheduledTaskTopicBinding[];
  serverProcess?: ServerProcessInfo;
  sessionDirectoryCache?: SessionDirectoryCacheInfo;
  /** Runtime display overrides set from /display (visible semantics per flag). */
  display?: Record<string, boolean>;
  /** User-saved prompt shortcuts (name -> text). */
  savedPrompts?: Array<{ name: string; text: string }>;
  /** Persisted daily OpenCode spend in USD, keyed by local YYYY-MM-DD. */
  costDaily?: Record<string, number>;
  /** Bot-side queued prompts, keyed by sessionId. Survives bot restarts. */
  queuedPrompts?: Record<string, PersistedQueuedPrompt[]>;
}

export interface PersistedQueuedPromptPart {
  type: string;
  text?: string;
  mime?: string;
  filename?: string;
  url?: string;
}

export interface PersistedQueuedPrompt {
  queueId: string;
  sessionId: string;
  chatId: number;
  threadId: number | null;
  responseMode: string;
  promptOptions: {
    sessionID: string;
    directory: string;
    parts: PersistedQueuedPromptPart[];
    model?: { providerID: string; modelID: string };
    agent?: string;
    variant?: string;
  };
  promptErrorLogContext: {
    sessionId: string;
    directory: string;
    agent: string;
    modelProvider: string;
    modelId: string;
    variant: string;
    promptLength: number;
    fileCount: number;
  };
}

interface LegacySettings {
  toolMessagesIntervalSec?: unknown;
  currentProject?: unknown;
  currentSession?: unknown;
  currentAgent?: unknown;
  currentModel?: unknown;
  pinnedMessageId?: unknown;
  scopedProjects?: Record<string, unknown>;
  scopedSessions?: Record<string, unknown>;
  scopedAgents?: Record<string, unknown>;
  scopedModels?: Record<string, unknown>;
  scopedPinnedMessageIds?: Record<string, unknown>;
  topicSessionBindings?: unknown;
  serverProcess?: unknown;
  sessionDirectoryCache?: unknown;
}

interface SettingsIndexes {
  scopedProjects: Record<string, ProjectInfo>;
  scopedSessions: Record<string, SessionInfo>;
  scopedAgents: Record<string, string>;
  scopedModels: Record<string, ModelInfo>;
  scopedPinnedMessageIds: Record<string, number>;
  scopedTtsEnabled: Record<string, boolean>;
  topicSessionBindings: Record<string, TopicSessionBinding>;
}

function createEmptySettings(): Settings {
  return { settingsVersion: 2 };
}

function createEmptyIndexes(): SettingsIndexes {
  return {
    scopedProjects: {},
    scopedSessions: {},
    scopedAgents: {},
    scopedModels: {},
    scopedPinnedMessageIds: {},
    scopedTtsEnabled: {},
    topicSessionBindings: {},
  };
}

function getSettingsFilePath(): string {
  return getRuntimePaths().settingsFilePath;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function cloneProjectInfo(project: ProjectInfo): ProjectInfo {
  return { ...project };
}

function cloneSessionInfo(session: SessionInfo): SessionInfo {
  return { ...session };
}

function cloneModelInfo(model: ModelInfo): ModelInfo {
  return { ...model };
}

function cloneScheduledTaskModel(model: ScheduledTaskModel): ScheduledTaskModel {
  return { ...model };
}

function cloneScheduledTask(task: ScheduledTask): ScheduledTask {
  return {
    ...task,
    model: cloneScheduledTaskModel(task.model),
    delivery: cloneScheduledTaskDeliveryTarget(task.delivery),
  };
}

function cloneScheduledTaskDeliveryTarget(
  delivery: ScheduledTaskDeliveryTarget,
): ScheduledTaskDeliveryTarget {
  return { ...delivery };
}

function cloneScheduledTaskTopicBinding(
  binding: ScheduledTaskTopicBinding,
): ScheduledTaskTopicBinding {
  return { ...binding };
}

function cloneTopicSessionBinding(binding: TopicSessionBinding): TopicSessionBinding {
  return { ...binding };
}

function normalizeScopeKey(scopeKey: string): string {
  if (scopeKey === GLOBAL_SCOPE_KEY) {
    return scopeKey;
  }

  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    return scopeKey;
  }

  if (parsed.context === SCOPE_CONTEXT.GROUP_GENERAL) {
    return createScopeKeyFromParams({
      chatId: parsed.chatId,
      context: SCOPE_CONTEXT.GROUP_GENERAL,
    });
  }

  return createScopeKeyFromParams(parsed);
}

function isLegacySettingsShape(value: unknown): value is LegacySettings {
  if (!isObject(value)) {
    return false;
  }

  return (
    "scopedProjects" in value ||
    "scopedSessions" in value ||
    "scopedAgents" in value ||
    "scopedModels" in value ||
    "scopedPinnedMessageIds" in value ||
    "topicSessionBindings" in value ||
    "currentProject" in value ||
    "currentSession" in value ||
    "currentAgent" in value ||
    "currentModel" in value ||
    "pinnedMessageId" in value ||
    "toolMessagesIntervalSec" in value
  );
}

function looksLikeNestedSettingsShape(value: unknown): boolean {
  if (!isObject(value)) {
    return false;
  }

  return (
    "global" in value ||
    "dmScopes" in value ||
    "groups" in value ||
    "serverProcess" in value ||
    "sessionDirectoryCache" in value
  );
}

function createTopicBindingRecordKey(chatId: number, threadId: number): string {
  return `${chatId}:${threadId}`;
}

function createTopicBindingScopeKey(chatId: number, threadId: number): string {
  return createScopeKeyFromParams({
    chatId,
    threadId,
    context: SCOPE_CONTEXT.GROUP_TOPIC,
  });
}

function assertTopicBindingKeyMatchesBinding(
  bindingKey: string,
  binding: TopicSessionBinding,
): void {
  const expectedKey = createTopicBindingRecordKey(binding.chatId, binding.threadId);
  if (bindingKey !== expectedKey) {
    throw new Error(
      `[SettingsManager] Topic binding key mismatch: key=${bindingKey}, expected=${expectedKey}`,
    );
  }

  const normalizedScopeKey = normalizeScopeKey(binding.scopeKey);
  const expectedScopeKey = createTopicBindingScopeKey(binding.chatId, binding.threadId);
  if (normalizedScopeKey !== expectedScopeKey) {
    throw new Error(
      `[SettingsManager] Topic binding scope mismatch: scope=${binding.scopeKey}, expected=${expectedScopeKey}`,
    );
  }
}

function sanitizeProjectInfo(value: unknown): ProjectInfo | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const worktree = typeof value.worktree === "string" ? value.worktree : "";
  if (!id || !worktree) {
    return undefined;
  }

  return {
    id,
    worktree,
    name: typeof value.name === "string" ? value.name : undefined,
  };
}

function sanitizeSessionInfo(value: unknown): SessionInfo | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const title = typeof value.title === "string" ? value.title : "";
  const directory = typeof value.directory === "string" ? value.directory : "";
  if (!id || !title || !directory) {
    return undefined;
  }

  return { id, title, directory };
}

function sanitizeModelInfo(value: unknown): ModelInfo | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const providerID = typeof value.providerID === "string" ? value.providerID : "";
  const modelID = typeof value.modelID === "string" ? value.modelID : "";
  if (!providerID || !modelID) {
    return undefined;
  }

  return {
    providerID,
    modelID,
    variant: typeof value.variant === "string" ? value.variant : undefined,
  };
}

function sanitizeServerProcessInfo(value: unknown): ServerProcessInfo | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const pid = typeof value.pid === "number" ? value.pid : null;
  const startTime = typeof value.startTime === "string" ? value.startTime : "";
  if (pid === null || !startTime) {
    return undefined;
  }

  return { pid, startTime };
}

function isValidIsoDatetime(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function sanitizeScheduledTaskModel(value: unknown): ScheduledTaskModel | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const providerID = typeof value.providerID === "string" ? value.providerID : "";
  const modelID = typeof value.modelID === "string" ? value.modelID : "";
  if (!providerID || !modelID) {
    return undefined;
  }

  return {
    providerID,
    modelID,
    variant: typeof value.variant === "string" ? value.variant : null,
  };
}

function sanitizeScheduledTaskDeliveryTarget(
  value: unknown,
): ScheduledTaskDeliveryTarget | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const chatId = typeof value.chatId === "number" ? value.chatId : null;
  const threadId =
    value.threadId === null
      ? null
      : typeof value.threadId === "number"
        ? value.threadId
        : undefined;

  if (chatId === null || threadId === undefined) {
    return undefined;
  }

  return { chatId, threadId };
}

function sanitizeScheduledTaskTopicBinding(value: unknown): ScheduledTaskTopicBinding | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const chatId = typeof value.chatId === "number" ? value.chatId : null;
  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  const projectWorktree = typeof value.projectWorktree === "string" ? value.projectWorktree : "";
  const threadId = typeof value.threadId === "number" ? value.threadId : null;
  const topicName = typeof value.topicName === "string" ? value.topicName.trim() : "";
  const createdAt = isValidIsoDatetime(value.createdAt) ? value.createdAt : "";
  const updatedAt = isValidIsoDatetime(value.updatedAt) ? value.updatedAt : "";

  if (
    chatId === null ||
    !projectId ||
    !projectWorktree ||
    threadId === null ||
    threadId <= 0 ||
    !topicName ||
    !createdAt ||
    !updatedAt
  ) {
    return undefined;
  }

  return {
    chatId,
    projectId,
    projectWorktree,
    threadId,
    topicName,
    createdAt,
    updatedAt,
  };
}

function sanitizeScheduledTaskTopics(value: unknown): ScheduledTaskTopicBinding[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const bindings = value
    .map((binding) => sanitizeScheduledTaskTopicBinding(binding))
    .filter((binding): binding is ScheduledTaskTopicBinding => binding !== undefined);

  return bindings.length > 0 ? bindings : undefined;
}

function sanitizeScheduledTask(value: unknown): ScheduledTask | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const id = typeof value.id === "string" ? value.id : "";
  const kind = value.kind;
  const projectId = typeof value.projectId === "string" ? value.projectId : "";
  const projectWorktree = typeof value.projectWorktree === "string" ? value.projectWorktree : "";
  const createdFromScopeKey =
    typeof value.createdFromScopeKey === "string" ? value.createdFromScopeKey : "";
  const agent = value.agent === null || typeof value.agent === "string" ? value.agent : undefined;
  const model = sanitizeScheduledTaskModel(value.model);
  const delivery = sanitizeScheduledTaskDeliveryTarget(value.delivery);
  const scheduleText = typeof value.scheduleText === "string" ? value.scheduleText : "";
  const scheduleSummary = typeof value.scheduleSummary === "string" ? value.scheduleSummary : "";
  const timezone = typeof value.timezone === "string" ? value.timezone : "";
  const prompt = typeof value.prompt === "string" ? value.prompt : "";
  const createdAt = isValidIsoDatetime(value.createdAt) ? value.createdAt : "";
  const nextRunAt =
    value.nextRunAt === null || isValidIsoDatetime(value.nextRunAt) ? value.nextRunAt : undefined;
  const lastRunAt =
    value.lastRunAt === null || isValidIsoDatetime(value.lastRunAt) ? value.lastRunAt : undefined;
  const runCount =
    typeof value.runCount === "number" && value.runCount >= 0 ? value.runCount : null;
  const lastStatus = value.lastStatus;
  const lastError =
    value.lastError === null || typeof value.lastError === "string" ? value.lastError : undefined;

  if (
    !id ||
    !projectId ||
    !projectWorktree ||
    !createdFromScopeKey ||
    agent === undefined ||
    !model ||
    !delivery ||
    !scheduleText ||
    !scheduleSummary ||
    !timezone ||
    !prompt ||
    !createdAt ||
    nextRunAt === undefined ||
    lastRunAt === undefined ||
    runCount === null ||
    (lastStatus !== "idle" &&
      lastStatus !== "running" &&
      lastStatus !== "success" &&
      lastStatus !== "error") ||
    lastError === undefined
  ) {
    return undefined;
  }

  if (kind === "cron") {
    const cron = typeof value.cron === "string" ? value.cron : "";
    if (!cron || "runAt" in value) {
      return undefined;
    }

    return {
      id,
      kind,
      projectId,
      projectWorktree,
      createdFromScopeKey,
      agent,
      model,
      delivery,
      scheduleText,
      scheduleSummary,
      timezone,
      prompt,
      createdAt,
      nextRunAt,
      lastRunAt,
      runCount,
      lastStatus,
      lastError,
      cron,
    };
  }

  if (kind === "once") {
    const runAt = isValidIsoDatetime(value.runAt) ? value.runAt : "";
    if (!runAt || "cron" in value) {
      return undefined;
    }

    return {
      id,
      kind,
      projectId,
      projectWorktree,
      createdFromScopeKey,
      agent,
      model,
      delivery,
      scheduleText,
      scheduleSummary,
      timezone,
      prompt,
      createdAt,
      nextRunAt,
      lastRunAt,
      runCount,
      lastStatus,
      lastError,
      runAt,
    };
  }

  return undefined;
}

function sanitizeScheduledTasks(value: unknown): ScheduledTask[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tasks = value
    .map((task) => sanitizeScheduledTask(task))
    .filter((task): task is ScheduledTask => task !== undefined);

  return tasks.length > 0 ? tasks : undefined;
}

function sanitizeSessionDirectoryCacheInfo(value: unknown): SessionDirectoryCacheInfo | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const version = value.version === 1 ? 1 : null;
  const lastSyncedUpdatedAt =
    typeof value.lastSyncedUpdatedAt === "number" ? value.lastSyncedUpdatedAt : null;
  const directories = Array.isArray(value.directories)
    ? value.directories
        .map((entry) => {
          if (!isObject(entry)) {
            return null;
          }

          const worktree = typeof entry.worktree === "string" ? entry.worktree : "";
          const lastUpdated = typeof entry.lastUpdated === "number" ? entry.lastUpdated : null;
          if (!worktree || lastUpdated === null) {
            return null;
          }

          return { worktree, lastUpdated };
        })
        .filter((entry): entry is { worktree: string; lastUpdated: number } => entry !== null)
    : [];

  if (version === null || lastSyncedUpdatedAt === null) {
    return undefined;
  }

  return {
    version,
    lastSyncedUpdatedAt,
    directories,
  };
}

function isTopicSessionStatus(value: unknown): value is TopicSessionStatus {
  return Object.values(TOPIC_SESSION_STATUS).includes(value as TopicSessionStatus);
}

function sanitizeTopicSessionBinding(
  value: unknown,
  expectedScopeKey?: string,
  expectedChatId?: number,
  expectedThreadId?: number,
): TopicSessionBinding | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const now = Date.now();
  const scopeKey = typeof value.scopeKey === "string" ? value.scopeKey : "";
  const chatId = typeof value.chatId === "number" ? value.chatId : null;
  const threadId = typeof value.threadId === "number" ? value.threadId : null;
  const sessionId = typeof value.sessionId === "string" ? value.sessionId : "";
  const projectId = typeof value.projectId === "string" ? value.projectId : "";

  if (!scopeKey || chatId === null || threadId === null || !sessionId || !projectId) {
    return undefined;
  }

  if (expectedScopeKey && scopeKey !== expectedScopeKey) {
    return undefined;
  }

  if (expectedChatId !== undefined && chatId !== expectedChatId) {
    return undefined;
  }

  if (expectedThreadId !== undefined && threadId !== expectedThreadId) {
    return undefined;
  }

  const createdAt = typeof value.createdAt === "number" ? value.createdAt : now;
  const updatedAt = typeof value.updatedAt === "number" ? value.updatedAt : createdAt;
  const normalizedScopeKey = normalizeScopeKey(scopeKey);
  const canonicalScopeKey = createTopicBindingScopeKey(chatId, threadId);

  if (normalizedScopeKey !== canonicalScopeKey) {
    return undefined;
  }

  return {
    scopeKey: canonicalScopeKey,
    chatId,
    threadId,
    sessionId,
    projectId,
    projectWorktree: typeof value.projectWorktree === "string" ? value.projectWorktree : undefined,
    topicName: typeof value.topicName === "string" ? value.topicName : undefined,
    status: isTopicSessionStatus(value.status) ? value.status : TOPIC_SESSION_STATUS.ACTIVE,
    createdAt,
    updatedAt,
    closedAt: typeof value.closedAt === "number" ? value.closedAt : undefined,
    ephemeral: value.ephemeral === true ? true : undefined,
  };
}

function sanitizeLegacyTopicSessionBindings(
  value: unknown,
): Record<string, TopicSessionBinding> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const entries = Object.entries(value)
    .map(([bindingKey, rawBinding]) => {
      const binding = sanitizeTopicSessionBinding(rawBinding);
      return binding ? ([bindingKey, binding] as const) : null;
    })
    .filter((entry): entry is readonly [string, TopicSessionBinding] => entry !== null);

  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function sanitizeScopeState(value: unknown): ScopeState | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const project = sanitizeProjectInfo(value.project);
  const session = sanitizeSessionInfo(value.session);
  const agent = typeof value.agent === "string" ? value.agent : undefined;
  const model = sanitizeModelInfo(value.model);
  const pinnedMessageId =
    typeof value.pinnedMessageId === "number" ? value.pinnedMessageId : undefined;
  const ttsEnabled = typeof value.ttsEnabled === "boolean" ? value.ttsEnabled : undefined;
  const display = sanitizeDisplayOverrides(value.display);

  if (
    !project &&
    !session &&
    !agent &&
    !model &&
    pinnedMessageId === undefined &&
    ttsEnabled === undefined &&
    display === undefined
  ) {
    return undefined;
  }

  return {
    project,
    session,
    agent,
    model,
    pinnedMessageId,
    ttsEnabled,
    display,
  };
}

function sanitizeDisplayOverrides(value: unknown): Record<string, boolean> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const next: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof key === "string" && key.length > 0 && typeof entry === "boolean") {
      next[key] = entry;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeCostDaily(value: unknown): Record<string, number> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const next: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(key) && typeof entry === "number" && entry >= 0) {
      next[key] = entry;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeSavedPrompts(value: unknown): Array<{ name: string; text: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next = value
    .filter(
      (entry): entry is { name: string; text: string } =>
        isObject(entry) &&
        typeof entry.name === "string" &&
        entry.name.trim().length > 0 &&
        typeof entry.text === "string" &&
        entry.text.length > 0,
    )
    .map((entry) => ({ name: entry.name.trim(), text: entry.text }));

  return next.length > 0 ? next : undefined;
}

function sanitizeTopicScopeState(
  value: unknown,
  chatId: number,
  threadId: number,
): TopicScopeState | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const scopeKey = createScopeKeyFromParams({
    chatId,
    threadId,
    context: SCOPE_CONTEXT.GROUP_TOPIC,
  });

  const baseState = sanitizeScopeState(value);
  const binding = sanitizeTopicSessionBinding(value.binding, scopeKey, chatId, threadId);

  if (!baseState && !binding) {
    return undefined;
  }

  return {
    ...(baseState ?? {}),
    binding,
  };
}

function sanitizeGroupSettings(value: unknown, chatId: number): GroupSettings | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const general = sanitizeScopeState(value.general);
  const topics = isObject(value.topics)
    ? Object.fromEntries(
        Object.entries(value.topics)
          .map(([threadIdKey, topicState]) => {
            const threadId = Number.parseInt(threadIdKey, 10);
            if (!Number.isInteger(threadId) || threadId <= 0) {
              return null;
            }

            const sanitized = sanitizeTopicScopeState(topicState, chatId, threadId);
            return sanitized ? ([threadIdKey, sanitized] as const) : null;
          })
          .filter((entry): entry is readonly [string, TopicScopeState] => entry !== null),
      )
    : undefined;

  if (!general && (!topics || Object.keys(topics).length === 0)) {
    return undefined;
  }

  return {
    general,
    topics: topics && Object.keys(topics).length > 0 ? topics : undefined,
  };
}

function sanitizeSettingsV2(value: unknown): Settings {
  if (!isObject(value)) {
    return createEmptySettings();
  }

  const global = sanitizeScopeState(value.global);
  const dmScopes = isObject(value.dmScopes)
    ? Object.fromEntries(
        Object.entries(value.dmScopes)
          .map(([chatId, scopeState]) => {
            const sanitized = sanitizeScopeState(scopeState);
            return sanitized ? ([chatId, sanitized] as const) : null;
          })
          .filter((entry): entry is readonly [string, ScopeState] => entry !== null),
      )
    : undefined;
  const groups = isObject(value.groups)
    ? Object.fromEntries(
        Object.entries(value.groups)
          .map(([chatIdKey, group]) => {
            const chatId = Number.parseInt(chatIdKey, 10);
            if (Number.isNaN(chatId)) {
              return null;
            }

            const sanitized = sanitizeGroupSettings(group, chatId);
            return sanitized ? ([chatIdKey, sanitized] as const) : null;
          })
          .filter((entry): entry is readonly [string, GroupSettings] => entry !== null),
      )
    : undefined;

  return {
    settingsVersion: 2,
    global,
    dmScopes: dmScopes && Object.keys(dmScopes).length > 0 ? dmScopes : undefined,
    groups: groups && Object.keys(groups).length > 0 ? groups : undefined,
    scheduledTasks: sanitizeScheduledTasks(value.scheduledTasks),
    scheduledTaskTopics: sanitizeScheduledTaskTopics(value.scheduledTaskTopics),
    serverProcess: sanitizeServerProcessInfo(value.serverProcess),
    sessionDirectoryCache: sanitizeSessionDirectoryCacheInfo(value.sessionDirectoryCache),
    display: sanitizeDisplayOverrides(value.display),
    costDaily: sanitizeCostDaily(value.costDaily),
    savedPrompts: sanitizeSavedPrompts(value.savedPrompts),
    queuedPrompts: sanitizeQueuedPrompts(value.queuedPrompts),
  };
}

function getOrCreateGroup(settings: Settings, chatId: number): GroupSettings {
  settings.groups ??= {};
  settings.groups[String(chatId)] ??= {};
  return settings.groups[String(chatId)]!;
}

function getOrCreateScopeState(
  settings: Settings,
  scopeKey: string,
): ScopeState | TopicScopeState | null {
  const normalizedScopeKey = normalizeScopeKey(scopeKey);

  if (normalizedScopeKey === GLOBAL_SCOPE_KEY) {
    settings.global ??= {};
    return settings.global;
  }

  const parsed = parseScopeKey(normalizedScopeKey);
  if (!parsed) {
    return null;
  }

  if (parsed.context === SCOPE_CONTEXT.DM) {
    settings.dmScopes ??= {};
    settings.dmScopes[String(parsed.chatId)] ??= {};
    return settings.dmScopes[String(parsed.chatId)]!;
  }

  const group = getOrCreateGroup(settings, parsed.chatId);
  if (parsed.context === SCOPE_CONTEXT.GROUP_GENERAL || parsed.threadId === undefined) {
    group.general ??= {};
    return group.general;
  }

  group.topics ??= {};
  group.topics[String(parsed.threadId)] ??= {};
  return group.topics[String(parsed.threadId)]!;
}

function isEmptyScopeState(state: ScopeState | TopicScopeState | undefined): boolean {
  if (!state) {
    return true;
  }

  return (
    state.project === undefined &&
    state.session === undefined &&
    state.agent === undefined &&
    state.model === undefined &&
    state.pinnedMessageId === undefined &&
    state.ttsEnabled === undefined &&
    state.display === undefined &&
    (!("binding" in state) || state.binding === undefined)
  );
}

function pruneEmptySettings(settings: Settings, scopeKey?: string): void {
  if (!scopeKey) {
    if (isEmptyScopeState(settings.global)) {
      settings.global = undefined;
    }

    if (settings.dmScopes) {
      for (const [chatId, state] of Object.entries(settings.dmScopes)) {
        if (isEmptyScopeState(state)) {
          delete settings.dmScopes[chatId];
        }
      }
      if (Object.keys(settings.dmScopes).length === 0) {
        settings.dmScopes = undefined;
      }
    }

    if (settings.groups) {
      for (const [chatId, group] of Object.entries(settings.groups)) {
        if (group.topics) {
          for (const [threadId, topicState] of Object.entries(group.topics)) {
            if (isEmptyScopeState(topicState)) {
              delete group.topics[threadId];
            }
          }
          if (Object.keys(group.topics).length === 0) {
            group.topics = undefined;
          }
        }

        if (isEmptyScopeState(group.general)) {
          group.general = undefined;
        }

        if (!group.general && !group.topics) {
          delete settings.groups[chatId];
        }
      }
      if (Object.keys(settings.groups).length === 0) {
        settings.groups = undefined;
      }
    }
    return;
  }

  if (scopeKey === GLOBAL_SCOPE_KEY) {
    if (isEmptyScopeState(settings.global)) {
      settings.global = undefined;
    }
    return;
  }

  const parsed = parseScopeKey(scopeKey);
  if (!parsed) {
    return;
  }

  if (parsed.context === SCOPE_CONTEXT.DM) {
    if (isEmptyScopeState(settings.dmScopes?.[String(parsed.chatId)])) {
      if (settings.dmScopes) {
        delete settings.dmScopes[String(parsed.chatId)];
        if (Object.keys(settings.dmScopes).length === 0) {
          settings.dmScopes = undefined;
        }
      }
    }
    return;
  }

  const chatIdKey = String(parsed.chatId);
  const group = settings.groups?.[chatIdKey];
  if (!group) {
    return;
  }

  if (parsed.context === SCOPE_CONTEXT.GROUP_GENERAL || parsed.threadId === undefined) {
    if (isEmptyScopeState(group.general)) {
      group.general = undefined;
    }
  } else if (group.topics) {
    const threadIdKey = String(parsed.threadId);
    if (isEmptyScopeState(group.topics[threadIdKey])) {
      delete group.topics[threadIdKey];
    }
    if (Object.keys(group.topics).length === 0) {
      group.topics = undefined;
    }
  }

  if (!group.general && !group.topics) {
    delete settings.groups?.[chatIdKey];
    if (settings.groups && Object.keys(settings.groups).length === 0) {
      settings.groups = undefined;
    }
  }
}

function rebuildIndexes(settings: Settings): SettingsIndexes {
  const indexes = createEmptyIndexes();

  const addScopeState = (scopeKey: string, state: ScopeState | TopicScopeState | undefined) => {
    if (!state) {
      return;
    }

    if (state.project) {
      indexes.scopedProjects[scopeKey] = cloneProjectInfo(state.project);
    }

    if (state.session) {
      indexes.scopedSessions[scopeKey] = cloneSessionInfo(state.session);
    }

    if (state.agent) {
      indexes.scopedAgents[scopeKey] = state.agent;
    }

    if (state.model) {
      indexes.scopedModels[scopeKey] = cloneModelInfo(state.model);
    }

    if (state.pinnedMessageId !== undefined) {
      indexes.scopedPinnedMessageIds[scopeKey] = state.pinnedMessageId;
    }

    if (state.ttsEnabled !== undefined) {
      indexes.scopedTtsEnabled[scopeKey] = state.ttsEnabled;
    }

    if ("binding" in state && state.binding) {
      indexes.topicSessionBindings[`${state.binding.chatId}:${state.binding.threadId}`] =
        cloneTopicSessionBinding(state.binding);
    }
  };

  addScopeState(GLOBAL_SCOPE_KEY, settings.global);

  for (const [chatId, state] of Object.entries(settings.dmScopes ?? {})) {
    addScopeState(
      createScopeKeyFromParams({
        chatId: Number.parseInt(chatId, 10),
        context: SCOPE_CONTEXT.DM,
      }),
      state,
    );
  }

  for (const [chatId, group] of Object.entries(settings.groups ?? {})) {
    const numericChatId = Number.parseInt(chatId, 10);

    addScopeState(
      createScopeKeyFromParams({
        chatId: numericChatId,
        context: SCOPE_CONTEXT.GROUP_GENERAL,
      }),
      group.general,
    );

    for (const [threadId, topicState] of Object.entries(group.topics ?? {})) {
      addScopeState(
        createScopeKeyFromParams({
          chatId: numericChatId,
          threadId: Number.parseInt(threadId, 10),
          context: SCOPE_CONTEXT.GROUP_TOPIC,
        }),
        topicState,
      );
    }
  }

  return indexes;
}

function migrateLegacySettings(legacy: LegacySettings): Settings {
  const migrated = createEmptySettings();

  migrated.serverProcess = sanitizeServerProcessInfo(legacy.serverProcess);
  migrated.sessionDirectoryCache = sanitizeSessionDirectoryCacheInfo(legacy.sessionDirectoryCache);

  const setScopeValue = <K extends keyof ScopeState>(
    scopeKey: string,
    key: K,
    value: ScopeState[K] | undefined,
  ) => {
    if (value === undefined) {
      return;
    }

    const scopeState = getOrCreateScopeState(migrated, scopeKey);
    if (!scopeState) {
      return;
    }

    scopeState[key] = value;
  };

  const globalProject = sanitizeProjectInfo(legacy.currentProject);
  const globalSession = sanitizeSessionInfo(legacy.currentSession);
  const globalAgent = typeof legacy.currentAgent === "string" ? legacy.currentAgent : undefined;
  const globalModel = sanitizeModelInfo(legacy.currentModel);
  const globalPinned =
    typeof legacy.pinnedMessageId === "number" ? legacy.pinnedMessageId : undefined;

  setScopeValue(GLOBAL_SCOPE_KEY, "project", globalProject);
  setScopeValue(GLOBAL_SCOPE_KEY, "session", globalSession);
  setScopeValue(GLOBAL_SCOPE_KEY, "agent", globalAgent);
  setScopeValue(GLOBAL_SCOPE_KEY, "model", globalModel);
  setScopeValue(GLOBAL_SCOPE_KEY, "pinnedMessageId", globalPinned);

  for (const [scopeKey, project] of Object.entries(legacy.scopedProjects ?? {})) {
    setScopeValue(scopeKey, "project", sanitizeProjectInfo(project));
  }

  for (const [scopeKey, session] of Object.entries(legacy.scopedSessions ?? {})) {
    setScopeValue(scopeKey, "session", sanitizeSessionInfo(session));
  }

  for (const [scopeKey, agent] of Object.entries(legacy.scopedAgents ?? {})) {
    setScopeValue(scopeKey, "agent", typeof agent === "string" ? agent : undefined);
  }

  for (const [scopeKey, model] of Object.entries(legacy.scopedModels ?? {})) {
    setScopeValue(scopeKey, "model", sanitizeModelInfo(model));
  }

  for (const [scopeKey, pinnedMessageId] of Object.entries(legacy.scopedPinnedMessageIds ?? {})) {
    setScopeValue(
      scopeKey,
      "pinnedMessageId",
      typeof pinnedMessageId === "number" ? pinnedMessageId : undefined,
    );
  }

  const topicSessionBindings =
    sanitizeLegacyTopicSessionBindings(legacy.topicSessionBindings) ?? {};
  for (const binding of Object.values(topicSessionBindings)) {
    const scopeState = getOrCreateScopeState(migrated, binding.scopeKey) as TopicScopeState | null;
    if (!scopeState) {
      continue;
    }

    scopeState.binding = binding;
  }

  pruneEmptySettings(migrated);
  return migrated;
}

async function readSettingsFile(): Promise<unknown> {
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(getSettingsFilePath(), "utf-8");
    return JSON.parse(content) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      logger.error("[SettingsManager] Error reading settings file:", error);
    }
    return createEmptySettings();
  }
}

let settingsWriteQueue: Promise<void> = Promise.resolve();
let settingsWriteBlockedReason: string | null = null;
let consecutiveWriteFailures = 0;
const MAX_LOGGED_WRITE_FAILURES_BEFORE_ERROR = 3;
// Depth gauge for the fire-and-forget write chain: bursts (many topics
// settling at once) are fine, but a monotonically growing depth means
// writes never catch up and memory diverges from disk.
let pendingSettingsWrites = 0;
const SETTINGS_WRITE_DEPTH_WARN_AT = 50;

function writeSettingsFile(settings: Settings): Promise<void> {
  pendingSettingsWrites += 1;
  if (pendingSettingsWrites === SETTINGS_WRITE_DEPTH_WARN_AT + 1) {
    logger.warn(
      `[SettingsManager] Settings write queue backing up (depth=${pendingSettingsWrites}); writers are outpacing disk`,
    );
  }
  settingsWriteQueue = settingsWriteQueue
    .catch(() => {
      // Keep write queue alive after failed writes.
    })
    .then(async () => {
      try {
        if (settingsWriteBlockedReason) {
          logger.warn(`[SettingsManager] Skipping settings write: ${settingsWriteBlockedReason}`);
          return;
        }

        try {
          const fs = await import("fs/promises");
          const settingsFilePath = getSettingsFilePath();
          await fs.mkdir(path.dirname(settingsFilePath), { recursive: true });
          // Atomic write: a crash mid-write must never leave a truncated
          // settings.json behind (the next read would reset to empty state).
          const tmpPath = `${settingsFilePath}.${process.pid}.tmp`;
          await fs.writeFile(tmpPath, JSON.stringify(settings, null, 2));
          await fs.rename(tmpPath, settingsFilePath);
          if (consecutiveWriteFailures > 0) {
            logger.info("[SettingsManager] Settings writes recovered after failures");
            consecutiveWriteFailures = 0;
          }
        } catch (err) {
          consecutiveWriteFailures += 1;
          if (consecutiveWriteFailures >= MAX_LOGGED_WRITE_FAILURES_BEFORE_ERROR) {
            logger.error(
              `[SettingsManager] Settings writes failing repeatedly (${consecutiveWriteFailures}x in a row); in-memory state is diverging from disk. Check disk space and permissions for ${getSettingsFilePath()}:`,
              err,
            );
          } else {
            logger.error("[SettingsManager] Error writing settings file:", err);
          }
        }
      } finally {
        pendingSettingsWrites = Math.max(0, pendingSettingsWrites - 1);
      }
    });

  return settingsWriteQueue;
}

let currentSettings: Settings = createEmptySettings();
let currentIndexes: SettingsIndexes = createEmptyIndexes();

function syncIndexes(): void {
  currentIndexes = rebuildIndexes(currentSettings);
}

function guardWritableSettings(operation: string): boolean {
  if (!settingsWriteBlockedReason) {
    return true;
  }

  logger.warn(`[SettingsManager] Skipping ${operation}: ${settingsWriteBlockedReason}`);
  return false;
}

function getScopedMap<T>(map: Record<string, T>, scopeKey: string): T | undefined {
  return map[scopeKey];
}

function updateScopeState<K extends keyof ScopeState>(
  scopeKey: string,
  key: K,
  value: ScopeState[K] | undefined,
): void {
  if (!guardWritableSettings(`scope update for ${normalizeScopeKey(scopeKey)}`)) {
    return;
  }

  const normalizedScopeKey = normalizeScopeKey(scopeKey);
  const scopeState = getOrCreateScopeState(currentSettings, normalizedScopeKey);
  if (!scopeState) {
    return;
  }

  if (value === undefined) {
    delete scopeState[key];
  } else {
    scopeState[key] = value;
  }

  pruneEmptySettings(currentSettings, normalizedScopeKey);
  syncIndexes();
  void writeSettingsFile(currentSettings);
}

function updateTopicBindingState(
  bindingKey: string,
  binding: TopicSessionBinding | undefined,
): void {
  if (!guardWritableSettings(`topic binding update for ${bindingKey}`)) {
    return;
  }

  const existingBinding = currentIndexes.topicSessionBindings[bindingKey];
  const targetScopeKey = normalizeScopeKey(binding?.scopeKey ?? existingBinding?.scopeKey ?? "");
  if (!targetScopeKey) {
    return;
  }

  const scopeState = getOrCreateScopeState(
    currentSettings,
    targetScopeKey,
  ) as TopicScopeState | null;
  if (!scopeState) {
    return;
  }

  if (binding === undefined) {
    delete scopeState.binding;
  } else {
    scopeState.binding = cloneTopicSessionBinding(binding);
  }

  pruneEmptySettings(currentSettings, targetScopeKey);
  syncIndexes();
  void writeSettingsFile(currentSettings);
}

export function getCurrentProject(scopeKey: string = GLOBAL_SCOPE_KEY): ProjectInfo | undefined {
  const project = getScopedMap(currentIndexes.scopedProjects, normalizeScopeKey(scopeKey));
  return project ? cloneProjectInfo(project) : undefined;
}

export function setCurrentProject(
  projectInfo: ProjectInfo,
  scopeKey: string = GLOBAL_SCOPE_KEY,
): void {
  updateScopeState(scopeKey, "project", cloneProjectInfo(projectInfo));
}

export function clearProject(scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "project", undefined);
}

export function getCurrentSession(scopeKey: string = GLOBAL_SCOPE_KEY): SessionInfo | undefined {
  const session = getScopedMap(currentIndexes.scopedSessions, normalizeScopeKey(scopeKey));
  return session ? cloneSessionInfo(session) : undefined;
}

export function setCurrentSession(
  sessionInfo: SessionInfo,
  scopeKey: string = GLOBAL_SCOPE_KEY,
): void {
  updateScopeState(scopeKey, "session", cloneSessionInfo(sessionInfo));
}

export function clearSession(scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "session", undefined);
}

export function getScopedSessions(): Record<string, SessionInfo> {
  return Object.fromEntries(
    Object.entries(currentIndexes.scopedSessions).map(([scopeKey, session]) => [
      scopeKey,
      cloneSessionInfo(session),
    ]),
  );
}

export function setScopedSession(scopeKey: string, sessionInfo: SessionInfo): void {
  setCurrentSession(sessionInfo, scopeKey);
}

export function clearScopedSession(scopeKey: string): void {
  clearSession(scopeKey);
}

export function getCurrentAgent(scopeKey: string = GLOBAL_SCOPE_KEY): string | undefined {
  return getScopedMap(currentIndexes.scopedAgents, normalizeScopeKey(scopeKey));
}

export function setCurrentAgent(agentName: string, scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "agent", agentName);
}

export function clearCurrentAgent(scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "agent", undefined);
}

export function getCurrentModel(scopeKey: string = GLOBAL_SCOPE_KEY): ModelInfo | undefined {
  const model = getScopedMap(currentIndexes.scopedModels, normalizeScopeKey(scopeKey));
  return model ? cloneModelInfo(model) : undefined;
}

export function getScopedModels(): Record<string, ModelInfo> {
  return Object.fromEntries(
    Object.entries(currentIndexes.scopedModels).map(([scopeKey, model]) => [
      scopeKey,
      cloneModelInfo(model),
    ]),
  );
}

export function setCurrentModel(modelInfo: ModelInfo, scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "model", cloneModelInfo(modelInfo));
}

export function clearCurrentModel(scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "model", undefined);
}

export function getScopedPinnedMessageId(scopeKey: string): number | undefined {
  return getScopedMap(currentIndexes.scopedPinnedMessageIds, normalizeScopeKey(scopeKey));
}

export function setScopedPinnedMessageId(scopeKey: string, messageId: number): void {
  updateScopeState(scopeKey, "pinnedMessageId", messageId);
}

export function clearScopedPinnedMessageId(scopeKey: string): void {
  updateScopeState(scopeKey, "pinnedMessageId", undefined);
}

export function isTtsEnabled(scopeKey: string = GLOBAL_SCOPE_KEY): boolean {
  return getScopedMap(currentIndexes.scopedTtsEnabled, normalizeScopeKey(scopeKey)) === true;
}

export function setTtsEnabled(enabled: boolean, scopeKey: string = GLOBAL_SCOPE_KEY): void {
  updateScopeState(scopeKey, "ttsEnabled", enabled);
}

export function getTopicSessionBindings(): Record<string, TopicSessionBinding> {
  return Object.fromEntries(
    Object.entries(currentIndexes.topicSessionBindings).map(([bindingKey, binding]) => [
      bindingKey,
      cloneTopicSessionBinding(binding),
    ]),
  );
}

export function getTopicSessionBinding(bindingKey: string): TopicSessionBinding | undefined {
  const binding = getScopedMap(currentIndexes.topicSessionBindings, bindingKey);
  return binding ? cloneTopicSessionBinding(binding) : undefined;
}

export function setTopicSessionBinding(bindingKey: string, binding: TopicSessionBinding): void {
  assertTopicBindingKeyMatchesBinding(bindingKey, binding);
  updateTopicBindingState(bindingKey, binding);
}

export function clearTopicSessionBinding(bindingKey: string): void {
  updateTopicBindingState(bindingKey, undefined);
}

export function findTopicSessionBindingBySessionId(
  sessionId: string,
): TopicSessionBinding | undefined {
  const binding = Object.values(currentIndexes.topicSessionBindings).find(
    (candidate) => candidate.sessionId === sessionId,
  );
  return binding ? cloneTopicSessionBinding(binding) : undefined;
}

export function findTopicSessionBindingByScopeKey(
  scopeKey: string,
): TopicSessionBinding | undefined {
  const normalizedScopeKey = normalizeScopeKey(scopeKey);
  const binding = Object.values(currentIndexes.topicSessionBindings).find(
    (candidate) => candidate.scopeKey === normalizedScopeKey,
  );
  return binding ? cloneTopicSessionBinding(binding) : undefined;
}

export function getTopicSessionBindingsByChat(chatId: number): TopicSessionBinding[] {
  return Object.values(currentIndexes.topicSessionBindings)
    .filter((binding) => binding.chatId === chatId)
    .map((binding) => cloneTopicSessionBinding(binding));
}

export function updateTopicSessionBindingStatus(
  bindingKey: string,
  status: TopicSessionStatus,
): void {
  const binding = currentIndexes.topicSessionBindings[bindingKey];
  if (!binding) {
    return;
  }

  const now = Date.now();
  updateTopicBindingState(bindingKey, {
    ...binding,
    status,
    updatedAt: now,
    closedAt:
      status === TOPIC_SESSION_STATUS.CLOSED || status === TOPIC_SESSION_STATUS.STALE
        ? now
        : binding.closedAt,
  });
}

export function getServerProcess(): ServerProcessInfo | undefined {
  return currentSettings.serverProcess ? { ...currentSettings.serverProcess } : undefined;
}

export function getDisplayOverrides(): Record<string, boolean> {
  return { ...(currentSettings.display ?? {}) };
}

export function setDisplayOverride(flag: string, visible: boolean | undefined): void {
  if (!guardWritableSettings(`display override for ${flag}`)) {
    return;
  }

  const next = { ...(currentSettings.display ?? {}) };
  if (visible === undefined) {
    delete next[flag];
  } else {
    next[flag] = visible;
  }

  if (Object.keys(next).length === 0) {
    delete currentSettings.display;
  } else {
    currentSettings.display = next;
  }

  void writeSettingsFile(currentSettings);
}

/** Scope-level display override (per topic). Falls back to global when unset. */
export function getScopeDisplayOverride(scopeKey: string, flag: string): boolean | undefined {
  const normalized = normalizeScopeKey(scopeKey);
  const scopeState = getOrCreateScopeState(currentSettings, normalized);
  return scopeState?.display?.[flag];
}

export function setScopeDisplayOverride(
  scopeKey: string,
  flag: string,
  visible: boolean | undefined,
): void {
  if (!guardWritableSettings(`scope display override for ${flag}`)) {
    return;
  }

  const normalizedScopeKey = normalizeScopeKey(scopeKey);
  const scopeState = getOrCreateScopeState(currentSettings, normalizedScopeKey);
  if (!scopeState) {
    return;
  }

  const next = { ...(scopeState.display ?? {}) };
  if (visible === undefined) {
    delete next[flag];
  } else {
    next[flag] = visible;
  }

  updateScopeState(
    normalizedScopeKey,
    "display",
    Object.keys(next).length > 0 ? next : undefined,
  );
}

export function getDailyCost(day: string): number {
  return currentSettings.costDaily?.[day] ?? 0;
}

/** Adds spend to a day bucket. Returns the new day total. */
export function addDailyCost(day: string, cost: number): number {
  if (!guardWritableSettings(`daily cost update for ${day}`)) {
    return getDailyCost(day);
  }

  const next = { ...(currentSettings.costDaily ?? {}) };
  next[day] = (next[day] ?? 0) + cost;
  currentSettings.costDaily = next;
  void writeSettingsFile(currentSettings);
  return next[day] ?? 0;
}

export function listSavedPrompts(): Array<{ name: string; text: string }> {
  return (currentSettings.savedPrompts ?? []).map((entry) => ({ ...entry }));
}

export function savePromptShortcut(name: string, text: string): void {
  if (!guardWritableSettings("saved prompt update")) {
    return;
  }

  const key = name.trim().toLowerCase();
  const next = (currentSettings.savedPrompts ?? []).filter(
    (entry) => entry.name.toLowerCase() !== key,
  );
  next.push({ name: name.trim(), text });
  currentSettings.savedPrompts = next;
  void writeSettingsFile(currentSettings);
}

export function deleteSavedPrompt(name: string): boolean {
  if (!guardWritableSettings("saved prompt delete")) {
    return false;
  }

  const key = name.trim().toLowerCase();
  const next = (currentSettings.savedPrompts ?? []).filter(
    (entry) => entry.name.toLowerCase() !== key,
  );
  if (next.length === (currentSettings.savedPrompts ?? []).length) {
    return false;
  }

  currentSettings.savedPrompts = next.length > 0 ? next : undefined;
  void writeSettingsFile(currentSettings);
  return true;
}

export function getPersistedQueuedPrompts(): Record<string, PersistedQueuedPrompt[]> {
  const record = currentSettings.queuedPrompts ?? {};
  const next: Record<string, PersistedQueuedPrompt[]> = {};
  for (const [sessionId, entries] of Object.entries(record)) {
    if (typeof sessionId !== "string" || sessionId.length === 0 || !Array.isArray(entries)) {
      continue;
    }
    const valid = entries.filter(isPersistedQueuedPrompt);
    if (valid.length > 0) {
      next[sessionId] = valid.map((entry) => ({ ...entry }));
    }
  }
  return next;
}

export function setPersistedQueuedPrompts(record: Record<string, PersistedQueuedPrompt[]>): void {
  if (!guardWritableSettings("queued prompts update")) {
    return;
  }

  const keys = Object.keys(record);
  currentSettings.queuedPrompts = keys.length > 0 ? record : undefined;
  void writeSettingsFile(currentSettings);
}

function isPersistedQueuedPromptPart(value: unknown): value is PersistedQueuedPromptPart {
  if (!isObject(value) || typeof value.type !== "string") {
    return false;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["text", "mime", "filename", "url"] as const) {
    if (record[key] !== undefined && typeof record[key] !== "string") {
      return false;
    }
  }

  return true;
}

function isPersistedQueuedPrompt(value: unknown): value is PersistedQueuedPrompt {
  if (!isObject(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.queueId !== "string" ||
    record.queueId.length === 0 ||
    typeof record.sessionId !== "string" ||
    record.sessionId.length === 0 ||
    typeof record.chatId !== "number" ||
    (record.threadId !== null && typeof record.threadId !== "number") ||
    typeof record.responseMode !== "string"
  ) {
    return false;
  }

  const options = record.promptOptions;
  if (
    !isObject(options) ||
    typeof options.sessionID !== "string" ||
    typeof options.directory !== "string" ||
    !Array.isArray(options.parts) ||
    !options.parts.every(isPersistedQueuedPromptPart)
  ) {
    return false;
  }

  if (
    options.model !== undefined &&
    (!isObject(options.model) ||
      typeof (options.model as Record<string, unknown>).providerID !== "string" ||
      typeof (options.model as Record<string, unknown>).modelID !== "string")
  ) {
    return false;
  }

  if (
    (options.agent !== undefined && typeof options.agent !== "string") ||
    (options.variant !== undefined && typeof options.variant !== "string")
  ) {
    return false;
  }

  const logContext = record.promptErrorLogContext;
  if (
    !isObject(logContext) ||
    typeof logContext.sessionId !== "string" ||
    typeof logContext.directory !== "string" ||
    typeof logContext.agent !== "string"
  ) {
    return false;
  }

  return true;
}

function sanitizeQueuedPrompts(value: unknown): Record<string, PersistedQueuedPrompt[]> | undefined {
  if (!isObject(value)) {
    return undefined;
  }

  const next: Record<string, PersistedQueuedPrompt[]> = {};
  for (const [sessionId, entries] of Object.entries(value)) {
    if (typeof sessionId !== "string" || sessionId.length === 0 || !Array.isArray(entries)) {
      continue;
    }

    const valid = entries.filter(isPersistedQueuedPrompt);
    if (valid.length > 0) {
      next[sessionId] = valid;
    }
  }

  return Object.keys(next).length > 0 ? next : undefined;
}

export function getScheduledTasks(): ScheduledTask[] {
  return (currentSettings.scheduledTasks ?? []).map((task) => cloneScheduledTask(task));
}

export function getScheduledTaskTopics(): ScheduledTaskTopicBinding[] {
  return (currentSettings.scheduledTaskTopics ?? []).map((binding) =>
    cloneScheduledTaskTopicBinding(binding),
  );
}

export function setScheduledTasks(tasks: ScheduledTask[]): Promise<void> {
  if (!guardWritableSettings("scheduled tasks update")) {
    return Promise.resolve();
  }

  currentSettings.scheduledTasks =
    tasks.length > 0 ? tasks.map((task) => cloneScheduledTask(task)) : undefined;
  return writeSettingsFile(currentSettings);
}

export function setScheduledTaskTopics(topics: ScheduledTaskTopicBinding[]): Promise<void> {
  if (!guardWritableSettings("scheduled task topics update")) {
    return Promise.resolve();
  }

  currentSettings.scheduledTaskTopics =
    topics.length > 0
      ? topics.map((binding) => cloneScheduledTaskTopicBinding(binding))
      : undefined;
  return writeSettingsFile(currentSettings);
}

export function setServerProcess(processInfo: ServerProcessInfo): void {
  if (!guardWritableSettings("server process update")) {
    return;
  }

  currentSettings.serverProcess = { ...processInfo };
  void writeSettingsFile(currentSettings);
}

export function clearServerProcess(): void {
  if (!guardWritableSettings("server process clear")) {
    return;
  }

  currentSettings.serverProcess = undefined;
  void writeSettingsFile(currentSettings);
}

export function getSessionDirectoryCache(): SessionDirectoryCacheInfo | undefined {
  return currentSettings.sessionDirectoryCache
    ? {
        version: currentSettings.sessionDirectoryCache.version,
        lastSyncedUpdatedAt: currentSettings.sessionDirectoryCache.lastSyncedUpdatedAt,
        directories: currentSettings.sessionDirectoryCache.directories.map((entry) => ({
          ...entry,
        })),
      }
    : undefined;
}

export function setSessionDirectoryCache(cache: SessionDirectoryCacheInfo): Promise<void> {
  if (!guardWritableSettings("session directory cache update")) {
    return Promise.resolve();
  }

  currentSettings.sessionDirectoryCache = {
    version: cache.version,
    lastSyncedUpdatedAt: cache.lastSyncedUpdatedAt,
    directories: cache.directories.map((entry) => ({ ...entry })),
  };
  return writeSettingsFile(currentSettings);
}

export function clearSessionDirectoryCache(): void {
  if (!guardWritableSettings("session directory cache clear")) {
    return;
  }

  currentSettings.sessionDirectoryCache = undefined;
  void writeSettingsFile(currentSettings);
}

export function __resetSettingsForTests(): void {
  currentSettings = createEmptySettings();
  currentIndexes = createEmptyIndexes();
  settingsWriteQueue = Promise.resolve();
  settingsWriteBlockedReason = null;
}

export function __waitForSettingsWritesForTests(): Promise<void> {
  return settingsWriteQueue;
}

/**
 * Resolves once every settings write queued so far has been attempted.
 * Await this during shutdown so a fast exit cannot lose queued prompts,
 * bindings, costs, or display overrides sitting in the write queue.
 */
export function flushSettingsWrites(): Promise<void> {
  return settingsWriteQueue;
}

export async function loadSettings(): Promise<void> {
  const loadedSettings = await readSettingsFile();
  settingsWriteBlockedReason = null;

  if (!isObject(loadedSettings)) {
    currentSettings = createEmptySettings();
    syncIndexes();
    return;
  }

  if (loadedSettings.settingsVersion === undefined) {
    if (isLegacySettingsShape(loadedSettings)) {
      currentSettings = migrateLegacySettings(loadedSettings);
      syncIndexes();
      await writeSettingsFile(currentSettings);
      logger.info("[SettingsManager] Migrated settings.json from v1 to v2");
      return;
    }

    currentSettings = looksLikeNestedSettingsShape(loadedSettings)
      ? sanitizeSettingsV2(loadedSettings)
      : createEmptySettings();
    pruneEmptySettings(currentSettings);
    syncIndexes();
    await writeSettingsFile(currentSettings);
    logger.info("[SettingsManager] Upgraded nested settings.json to v2 metadata");
    return;
  }

  if (loadedSettings.settingsVersion !== 2) {
    logger.warn(
      `[SettingsManager] Unsupported settingsVersion=${String(loadedSettings.settingsVersion)}; loading known fields without rewriting file`,
    );
    currentSettings = sanitizeSettingsV2(loadedSettings);
    pruneEmptySettings(currentSettings);
    syncIndexes();
    settingsWriteBlockedReason = `settingsVersion ${String(loadedSettings.settingsVersion)} is read-only`;
    return;
  }

  currentSettings = sanitizeSettingsV2(loadedSettings);
  pruneEmptySettings(currentSettings);
  syncIndexes();
}
