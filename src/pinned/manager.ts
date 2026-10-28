import type { Api } from "grammy";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { logger } from "../utils/logger.js";
import { opencodeClient } from "../opencode/client.js";
import {
  getScopedPinnedMessageId,
  setScopedPinnedMessageId,
  clearScopedPinnedMessageId,
  getCurrentProject,
} from "../settings/manager.js";
import { getStoredModel } from "../model/manager.js";
import type { FileChange, PinnedMessageState, TokensInfo } from "./types.js";
import { t } from "../i18n/index.js";
import { getThreadIdFromScopeKey, getThreadSendOptions } from "../bot/scope.js";
import { getScopeFromKey, SCOPE_CONTEXT } from "../bot/scope.js";
import { runWithRateLimitRetries } from "../bot/telegram-rate-limiter.js";
import { contextStateManager } from "../context/manager.js";

interface ScopeContext {
  api: Api | null;
  chatId: number | null;
  state: PinnedMessageState;
  contextLimit: number | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  lastRenderedText: string | null;
  lastEditAt: number;
}

/**
 * General control topic ("Session Control") is a command lane: no dashboard pin.
 */
function isControlScope(scopeKey: string): boolean {
  return getScopeFromKey(scopeKey)?.context === SCOPE_CONTEXT.GROUP_GENERAL;
}

class PinnedMessageManager {
  private contexts = new Map<string, ScopeContext>();
  /** In-flight dashboard creations per scope (dedupes concurrent recreations). */
  private createInFlight = new Map<string, { run: Promise<void>; generation: number }>();
  /** Bumped on clear()/session rotation so stale creates delete their orphan. */
  private generations = new Map<string, number>();
  private createDefaultState(scopeKey: string): PinnedMessageState {
    return {
      scopeKey,
      messageId: null,
      chatId: null,
      threadId: null,
      sessionId: null,
      sessionTitle: t("pinned.default_session_title"),
      projectName: "",
      projectBranch: null,
      tokensUsed: 0,
      tokensLimit: 0,
      assistantCost: 0,
      lastUpdated: 0,
      changedFiles: [],
    };
  }

  private async retryTelegramCall<T>(label: string, run: () => Promise<T>): Promise<T> {
    // Dashboard repaints are supersedeable: the next throttled update carries
    // fresher state. Cap retries low so a 429 storm fails fast instead of
    // multiplying edits (each retry is another edit attempt).
    return runWithRateLimitRetries(`pinned:${label}`, run, 3);
  }

  private getContext(scopeKey: string): ScopeContext {
    const existing = this.contexts.get(scopeKey);
    if (existing) {
      return existing;
    }

    const savedId = getScopedPinnedMessageId(scopeKey);
    const context: ScopeContext = {
      api: null,
      chatId: null,
      state: {
        ...this.createDefaultState(scopeKey),
        messageId: savedId ?? null,
      },
      contextLimit: null,
      debounceTimer: null,
      lastRenderedText: null,
      lastEditAt: 0,
    };
    this.contexts.set(scopeKey, context);
    return context;
  }

  initialize(
    api: Api,
    chatId: number,
    scopeKey: string = "global",
    threadId: number | null = null,
  ): void {
    const context = this.getContext(scopeKey);
    const scopeThreadId = getThreadIdFromScopeKey(scopeKey);
    const resolvedThreadId = threadId ?? scopeThreadId ?? context.state.threadId;
    context.api = api;
    context.chatId = chatId;
    context.state.chatId = chatId;
    context.state.threadId = resolvedThreadId;

    // The General control topic never gets a dashboard pin.
    if (isControlScope(scopeKey)) {
      void this.retireControlDashboard(chatId, scopeKey);
    }
  }

  private persistPinnedId(scopeKey: string, messageId: number): void {
    setScopedPinnedMessageId(scopeKey, messageId);
  }

  private clearPersistedPinnedId(scopeKey: string): void {
    clearScopedPinnedMessageId(scopeKey);
  }

  /**
   * Deletes a legacy dashboard left in General before the no-pin rule.
   * Only deletes the tracked message (which also removes its pin).
   */
  private async retireControlDashboard(chatId: number, scopeKey: string): Promise<void> {
    const context = this.getContext(scopeKey);
    const messageId = context.state.messageId ?? getScopedPinnedMessageId(scopeKey) ?? null;
    context.state.messageId = null;
    context.state.sessionId = null;
    this.clearPersistedPinnedId(scopeKey);
    if (!messageId || !context.api) {
      return;
    }
    try {
      await context.api.deleteMessage(chatId, messageId).catch(() => {});
      logger.info("[PinnedManager] Retired legacy General dashboard pin", { scopeKey });
    } catch (error) {
      logger.warn("[PinnedManager] Failed to retire legacy General dashboard:", error);
    }
  }

  async onSessionChange(
    sessionId: string,
    sessionTitle: string,
    scopeKey: string = "global",
  ): Promise<void> {
    const context = this.getContext(scopeKey);
    const state = context.state;
    state.tokensUsed = 0;
    state.assistantCost = 0;
    state.sessionId = sessionId;
    state.sessionTitle = sessionTitle || t("pinned.default_session_title");

    // Invalidate any dashboard creation racing with this rotation.
    this.bumpGeneration(scopeKey);

    const project = getCurrentProject(scopeKey);
    await this.refreshProjectMetadata(scopeKey);

    await this.fetchContextLimit(scopeKey);
    this.syncSharedContext(scopeKey);

    // No dashboard pin in the General control topic. Shared context
    // above still feeds the reply keyboard.
    if (isControlScope(scopeKey)) {
      return;
    }

    state.changedFiles = [];
    await this.unpinOldMessage(scopeKey);
    await this.createPinnedMessageOnce(scopeKey);
    if (project?.worktree) {
      await this.loadContextFromHistory(sessionId, project.worktree, scopeKey);
    }
    await this.loadDiffsFromApi(sessionId, scopeKey);
  }

  async onSessionTitleUpdate(newTitle: string, scopeKey: string = "global"): Promise<void> {
    const state = this.getContext(scopeKey).state;
    if (state.sessionTitle !== newTitle && newTitle) {
      state.sessionTitle = newTitle;
      this.scheduleThrottledUpdate(scopeKey);
    }
  }

  /**
   * Attaches a live session to the scope without user interaction (bot
   * restart, PC-only activity, background resume). Restores cost/context from
   * history and ensures the dashboard exists, so the pin never goes stale.
   * No-op when the scope already tracks this session.
   */
  async attachSession(sessionId: string, scopeKey: string = "global"): Promise<void> {
    const context = this.getContext(scopeKey);
    if (context.state.sessionId === sessionId) {
      return;
    }

    this.bumpGeneration(scopeKey);
    context.state.sessionId = sessionId;
    context.state.tokensUsed = 0;
    context.state.assistantCost = 0;
    context.state.changedFiles = [];

    try {
      await this.refreshProjectMetadata(scopeKey);
      await this.fetchContextLimit(scopeKey);
      this.syncSharedContext(scopeKey);
      if (isControlScope(scopeKey)) {
        return;
      }
      await this.refreshSessionTitle(scopeKey);

      const project = getCurrentProject(scopeKey);
      if (project?.worktree) {
        await this.loadContextFromHistory(sessionId, project.worktree, scopeKey);
      }
      await this.loadDiffsFromApi(sessionId, scopeKey);
      await this.updatePinnedMessage(scopeKey);
    } catch (err) {
      logger.error("[PinnedManager] Error attaching live session:", err);
    }
  }

  async loadContextFromHistory(
    sessionId: string,
    directory: string,
    scopeKey: string = "global",
    options: { includeSummaries?: boolean } = {},
  ): Promise<void> {
    const context = this.getContext(scopeKey);
    try {
      const { data: messagesData, error } = await opencodeClient.session.messages({
        sessionID: sessionId,
        directory,
      });
      if (error || !messagesData) {
        return;
      }

      let maxContextSize = 0;
      let totalAssistantCost = 0;
      messagesData.forEach(({ info }) => {
        if (info.role !== "assistant") {
          return;
        }

        const assistantInfo = info as {
          summary?: boolean;
          cost?: number;
          tokens?: { input: number; cache?: { read: number } };
        };
        if (assistantInfo.summary && !options.includeSummaries) {
          return;
        }

        const contextSize =
          (assistantInfo.tokens?.input || 0) + (assistantInfo.tokens?.cache?.read || 0);
        if (contextSize > maxContextSize) {
          maxContextSize = contextSize;
        }

        totalAssistantCost += assistantInfo.cost || 0;
      });

      context.state.tokensUsed = maxContextSize;
      context.state.assistantCost = totalAssistantCost;
      context.state.sessionId = sessionId;
      this.syncSharedContext(scopeKey);
      this.scheduleThrottledUpdate(scopeKey);
    } catch (err) {
      logger.error("[PinnedManager] Error loading context from history:", err);
    }
  }

  async onSessionCompacted(
    sessionId: string,
    directory: string,
    scopeKey: string = "global",
  ): Promise<void> {
    await this.loadContextFromHistory(sessionId, directory, scopeKey, {
      includeSummaries: true,
    });
  }

  async onMessageComplete(tokens: TokensInfo, scopeKey: string = "global"): Promise<void> {
    if (this.getContextLimit(scopeKey) === 0) {
      await this.fetchContextLimit(scopeKey);
    }

    const context = this.getContext(scopeKey);
    // Preserve the history baseline: the live window must never move the
    // dashboard backwards (history load races message events on reopen).
    // Compaction re-baselines explicitly via loadContextFromHistory.
    const rawUsed = tokens.input + tokens.cacheRead;
    const limit = context.state.tokensLimit > 0 ? context.state.tokensLimit : 0;
    const highWater = Math.max(context.state.tokensUsed, rawUsed);
    context.state.tokensUsed = limit > 0 ? Math.min(highWater, limit) : highWater;
    context.state.assistantCost += tokens.cost;
    await this.refreshSessionTitle(scopeKey);
    this.syncSharedContext(scopeKey);
    // Keep the dashboard price/context live during long runs; the exact
    // repaint still happens on flush at turn end.
    this.scheduleThrottledUpdate(scopeKey);
  }

  getContextInfo(scopeKey: string = "global"): { tokensUsed: number; tokensLimit: number } | null {
    const context = this.getContext(scopeKey);
    const limit =
      context.state.tokensLimit > 0 ? context.state.tokensLimit : context.contextLimit || 0;
    if (limit === 0) {
      return null;
    }

    return { tokensUsed: context.state.tokensUsed, tokensLimit: limit };
  }

  getContextLimit(scopeKey: string = "global"): number {
    const context = this.getContext(scopeKey);
    return context.contextLimit || context.state.tokensLimit || 0;
  }

  async refreshContextLimit(scopeKey: string = "global"): Promise<void> {
    await this.fetchContextLimit(scopeKey);
    this.syncSharedContext(scopeKey);
  }

  async onSessionDiff(diffs: FileChange[], scopeKey: string = "global"): Promise<void> {
    const context = this.getContext(scopeKey);
    if (diffs.length === 0) {
      // An empty diff means the working tree is clean: clear the file list
      // instead of freezing the previous entries on the dashboard.
      if (context.state.changedFiles.length === 0) {
        return;
      }
      context.state.changedFiles = [];
      this.scheduleThrottledUpdate(scopeKey);
      return;
    }

    context.state.changedFiles = diffs;
    this.scheduleThrottledUpdate(scopeKey);
  }

  addFileChange(change: FileChange, scopeKey: string = "global"): void {
    const context = this.getContext(scopeKey);
    const existing = context.state.changedFiles.find((f) => f.file === change.file);
    if (existing) {
      existing.additions += change.additions;
      existing.deletions += change.deletions;
    } else {
      context.state.changedFiles.push(change);
    }

    this.scheduleThrottledUpdate(scopeKey);
  }

  async flush(scopeKey: string = "global"): Promise<void> {
    // Pin failures must never break message delivery. Repaints go through
    // the throttle like every other trigger: flush runs on every
    // final-delivery attempt (including coordinator retries), and a direct
    // edit here would turn each retry into fresh flood-control ammunition.
    // The trailing edit still carries the latest state. Only a missing
    // dashboard is created immediately — a topic must never be left without
    // one while its session is active.
    try {
      await this.refreshProjectMetadata(scopeKey);

      const context = this.getContext(scopeKey);
      if (
        !context.state.messageId &&
        context.state.sessionId &&
        !isControlScope(scopeKey)
      ) {
        await this.updatePinnedMessage(scopeKey);
        return;
      }

      this.scheduleThrottledUpdate(scopeKey);
    } catch (err) {
      logger.error("[PinnedManager] Error flushing pinned message:", err);
    }
  }

  private syncSharedContext(scopeKey: string): void {
    const contextInfo = this.getContextInfo(scopeKey);
    if (!contextInfo) {
      contextStateManager.clear(scopeKey);
      return;
    }

    // Never publish used > limit to the keyboard: at saturation the button
    // must read 100%, not 104% or a frozen older value.
    const tokensUsed =
      contextInfo.tokensLimit > 0
        ? Math.min(contextInfo.tokensUsed, contextInfo.tokensLimit)
        : contextInfo.tokensUsed;
    contextStateManager.update(tokensUsed, contextInfo.tokensLimit, scopeKey);
  }

  private scheduleThrottledUpdate(scopeKey: string, delayMs: number = 1500): void {
    const context = this.getContext(scopeKey);
    if (context.debounceTimer) {
      clearTimeout(context.debounceTimer);
      context.debounceTimer = null;
    }

    // Flood control: at most one edit per interval; bursts collapse into a
    // single trailing edit with the latest state.
    const waitMs = Math.max(
      0,
      PinnedMessageManager.PIN_EDIT_MIN_INTERVAL_MS - (Date.now() - context.lastEditAt),
    );
    const effectiveDelayMs = Math.max(delayMs, waitMs);

    context.debounceTimer = setTimeout(() => {
      context.debounceTimer = null;
      void this.updatePinnedMessage(scopeKey);
    }, effectiveDelayMs);
  }

  private async loadDiffsFromApi(sessionId: string, scopeKey: string): Promise<void> {
    try {
      const project = getCurrentProject(scopeKey);
      if (!project) {
        return;
      }

      const { data, error } = await opencodeClient.session.diff({
        sessionID: sessionId,
        directory: project.worktree,
      });
      const context = this.getContext(scopeKey);

      if (!error && data && data.length > 0) {
        context.state.changedFiles = data.map((d) => ({
          file: d.file ?? "",
          additions: d.additions,
          deletions: d.deletions,
        }));
        this.scheduleThrottledUpdate(scopeKey);
      }
    } catch (err) {
      logger.debug("[PinnedManager] Could not load diffs from API:", err);
    }
  }

  private async refreshSessionTitle(scopeKey: string): Promise<void> {
    const context = this.getContext(scopeKey);
    const sessionId = context.state.sessionId;
    const project = getCurrentProject(scopeKey);
    if (!sessionId || !project) {
      return;
    }

    try {
      const { data: sessionData } = await opencodeClient.session.get({
        sessionID: sessionId,
        directory: project.worktree,
      });

      if (sessionData && sessionData.title !== context.state.sessionTitle) {
        context.state.sessionTitle = sessionData.title;
      }
    } catch {
      // Ignore refresh failures.
    }
  }

  private async refreshProjectMetadata(scopeKey: string): Promise<void> {
    const context = this.getContext(scopeKey);
    const project = getCurrentProject(scopeKey);
    const projectName =
      project?.name || this.extractProjectName(project?.worktree) || t("pinned.unknown");
    context.state.projectName = project?.id.includes(":")
      ? `${projectName} [worktree]`
      : projectName;
    context.state.projectBranch = await this.getGitBranchName(project?.worktree);
  }

  private async getGitBranchName(worktree: string | undefined): Promise<string | null> {
    if (!worktree) {
      return null;
    }

    try {
      const gitDir = await this.resolveGitDir(worktree);
      if (!gitDir) {
        return null;
      }

      const headPath = path.join(gitDir, "HEAD");
      const headContent = (await readFile(headPath, "utf-8")).trim();
      const match = headContent.match(/^ref:\s+refs\/heads\/(.+)$/);
      return match?.[1] ?? null;
    } catch (err) {
      logger.debug("[PinnedManager] Could not resolve git branch:", err);
      return null;
    }
  }

  private async resolveGitDir(worktree: string): Promise<string | null> {
    const gitPath = path.join(worktree, ".git");

    try {
      const gitStat = await stat(gitPath);
      if (gitStat.isDirectory()) {
        return gitPath;
      }

      if (!gitStat.isFile()) {
        return null;
      }

      const gitPointer = (await readFile(gitPath, "utf-8")).trim();
      const match = gitPointer.match(/^gitdir:\s*(.+)$/i);
      if (!match) {
        return null;
      }

      return path.resolve(worktree, match[1].trim());
    } catch {
      return null;
    }
  }

  private extractProjectName(worktree: string | undefined): string {
    if (!worktree) {
      return "";
    }

    const parts = worktree.replace(/\\/g, "/").split("/");
    return parts[parts.length - 1] || "";
  }

  private makeRelativePath(filePath: string, scopeKey: string): string {
    const normalized = filePath.replace(/\\/g, "/");
    const project = getCurrentProject(scopeKey);
    if (!project?.worktree) {
      return normalized;
    }

    const worktree = project.worktree.replace(/\\/g, "/");
    if (normalized.startsWith(worktree)) {
      let relative = normalized.slice(worktree.length);
      if (relative.startsWith("/")) {
        relative = relative.slice(1);
      }
      return relative || normalized;
    }

    const segments = normalized.split("/");
    if (segments.length <= 3) {
      return normalized;
    }

    return ".../" + segments.slice(-3).join("/");
  }

  private async fetchContextLimit(scopeKey: string): Promise<void> {
    const context = this.getContext(scopeKey);
    try {
      const model = getStoredModel(scopeKey);
      if (!model.providerID || !model.modelID) {
        context.contextLimit = 200000;
        context.state.tokensLimit = context.contextLimit;
        this.syncSharedContext(scopeKey);
        return;
      }

      const { data: providersData, error } = await opencodeClient.config.providers();
      if (error || !providersData) {
        context.contextLimit = 200000;
        context.state.tokensLimit = context.contextLimit;
        this.syncSharedContext(scopeKey);
        return;
      }

      for (const provider of providersData.providers) {
        if (provider.id !== model.providerID) {
          continue;
        }

        const modelInfo = provider.models[model.modelID];
        if (modelInfo?.limit?.context) {
          context.contextLimit = modelInfo.limit.context;
          context.state.tokensLimit = context.contextLimit;
          this.syncSharedContext(scopeKey);
          return;
        }
      }

      context.contextLimit = 200000;
      context.state.tokensLimit = context.contextLimit;
      this.syncSharedContext(scopeKey);
    } catch {
      context.contextLimit = 200000;
      context.state.tokensLimit = context.contextLimit;
      this.syncSharedContext(scopeKey);
    }
  }

  private formatTokenCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(1)}M`;
    }

    if (count >= 1000) {
      return `${Math.round(count / 1000)}K`;
    }

    return count.toString();
  }

  private formatCost(cost: number): string {
    if (cost <= 0) {
      return "$0.00";
    }

    const decimals = cost >= 1 ? 2 : cost >= 0.01 ? 3 : cost >= 0.001 ? 4 : 5;
    const normalized = cost.toFixed(decimals).replace(/(\.\d*?[1-9])0+$/u, "$1");

    return `$${normalized.replace(/\.0+$/u, "")}`;
  }

  private formatMessage(scopeKey: string): string {
    const context = this.getContext(scopeKey);
    const state = context.state;
    const percentage =
      state.tokensLimit > 0 ? Math.round((state.tokensUsed / state.tokensLimit) * 100) : 0;
    const currentModel = getStoredModel(scopeKey);
    const modelName =
      currentModel.providerID && currentModel.modelID
        ? currentModel.variant
          ? `${currentModel.providerID}/${currentModel.modelID} (${currentModel.variant})`
          : `${currentModel.providerID}/${currentModel.modelID}`
        : t("pinned.unknown");
    const projectDisplayName = state.projectBranch
      ? `${state.projectName}: ${state.projectBranch}`
      : state.projectName;

    const lines = [
      t("pinned.line.context", {
        used: this.formatTokenCount(state.tokensUsed),
        limit: this.formatTokenCount(state.tokensLimit),
        percent: percentage,
      }),
      t("pinned.line.cost", { cost: this.formatCost(state.assistantCost) }),
      t("pinned.line.model", { model: modelName }),
      t("pinned.line.project", { project: projectDisplayName }),
    ];

    if (state.changedFiles.length > 0) {
      const maxFiles = 10;
      const filesToShow = state.changedFiles.slice(0, maxFiles);
      lines.push("");
      lines.push(t("pinned.files.title", { count: state.changedFiles.length }));

      for (const fileChange of filesToShow) {
        const parts: string[] = [];
        if (fileChange.additions > 0) parts.push(`+${fileChange.additions}`);
        if (fileChange.deletions > 0) parts.push(`-${fileChange.deletions}`);
        const diff = parts.length > 0 ? ` (${parts.join(" ")})` : "";
        lines.push(
          t("pinned.files.item", { path: this.makeRelativePath(fileChange.file, scopeKey), diff }),
        );
      }

      if (state.changedFiles.length > maxFiles) {
        lines.push(t("pinned.files.more", { count: state.changedFiles.length - maxFiles }));
      }

      lines.push("");
    }

    lines.push(`${state.sessionTitle}`);

    return lines.join("\n");
  }

  /** Minimum gap between two Telegram edits of the same dashboard (flood control). */
  private static readonly PIN_EDIT_MIN_INTERVAL_MS = 15_000;

  private bumpGeneration(scopeKey: string): void {
    this.generations.set(scopeKey, (this.generations.get(scopeKey) ?? 0) + 1);
  }

  private async createPinnedMessage(scopeKey: string): Promise<void> {
    const context = this.getContext(scopeKey);
    if (!context.api || !context.chatId) {
      return;
    }

    const generation = this.generations.get(scopeKey) ?? 0;
    const threadId = context.state.threadId ?? getThreadIdFromScopeKey(scopeKey);

    let sent: Awaited<ReturnType<NonNullable<ScopeContext["api"]>["sendMessage"]>>;
    try {
      sent = await this.retryTelegramCall(
        "pinned message send",
        async () =>
          await context.api!.sendMessage(context.chatId!, this.formatMessage(scopeKey), {
            ...getThreadSendOptions(threadId),
          }),
      );
    } catch (err) {
      logger.error("[PinnedManager] Error creating pinned message:", err);
      throw err;
    }

    if ((this.generations.get(scopeKey) ?? 0) !== generation) {
      // The scope rotated (clear/session change) mid-create: remove the orphan
      // instead of tracking a message that no longer belongs to this scope.
      await context
        .api!.deleteMessage(context.chatId!, sent.message_id)
        .catch(() => {});
      return;
    }

    context.state.messageId = sent.message_id;
    context.state.lastUpdated = Date.now();
    context.lastRenderedText = this.formatMessage(scopeKey);
    context.lastEditAt = Date.now();
    this.persistPinnedId(scopeKey, sent.message_id);

    try {
      await this.retryTelegramCall(
        "pin chat message",
        async () =>
          await context.api!.pinChatMessage(context.chatId!, sent.message_id, {
            disable_notification: true,
          }),
      );
    } catch (err) {
      // The dashboard message exists and stays tracked for edits; only the
      // pin itself failed.
      logger.error("[PinnedManager] Error pinning dashboard message:", err);
    }
  }

  /**
   * Creates the dashboard message, joining an in-flight creation instead of
   * sending a duplicate. Guarantees a single tracked message per scope.
   */
  private async createPinnedMessageOnce(scopeKey: string): Promise<void> {
    // The General control topic never gets a dashboard pin.
    if (isControlScope(scopeKey)) {
      return;
    }

    const currentGeneration = this.generations.get(scopeKey) ?? 0;
    const pending = this.createInFlight.get(scopeKey);
    if (pending) {
      if (pending.generation === currentGeneration) {
        await pending.run;
        return;
      }
      // Stale generation (rotation happened mid-create): the pending run
      // deletes its orphan. Wait for it to settle, then fall through and
      // build the current generation below.
      await pending.run.catch(() => {});
    }

    const generation = this.generations.get(scopeKey) ?? 0;
    const entry: { run: Promise<void>; generation: number } = {
      run: this.createPinnedMessage(scopeKey),
      generation,
    };
    entry.run = entry.run.finally(() => {
      if (this.createInFlight.get(scopeKey) === entry) {
        this.createInFlight.delete(scopeKey);
      }
    });
    this.createInFlight.set(scopeKey, entry);
    await entry.run;
  }

  private async updatePinnedMessage(scopeKey: string): Promise<void> {
    // The General control topic never gets a dashboard pin.
    if (isControlScope(scopeKey)) {
      return;
    }

    const context = this.getContext(scopeKey);
    if (!context.api || !context.chatId) {
      return;
    }

    if (!context.state.messageId) {
      // Never skip an update: recreate the dashboard so the topic always has
      // a live one. Scopes without a session (e.g. after /close) stay quiet.
      if (!context.state.sessionId) {
        return;
      }

      await this.createPinnedMessageOnce(scopeKey);
      return;
    }

    const text = this.formatMessage(scopeKey);
    if (text === context.lastRenderedText) {
      context.state.lastUpdated = Date.now();
      return;
    }

    try {
      await this.retryTelegramCall(
        "pinned message edit",
        async () =>
          await context.api!.editMessageText(
            context.chatId!,
            context.state.messageId!,
            text,
          ),
      );
      context.state.lastUpdated = Date.now();
      context.lastRenderedText = text;
      context.lastEditAt = Date.now();
    } catch (err) {
      if (err instanceof Error && err.message.includes("message is not modified")) {
        context.lastRenderedText = text;
        return;
      }

      if (err instanceof Error && err.message.includes("message to edit not found")) {
        context.state.messageId = null;
        this.clearPersistedPinnedId(scopeKey);
        await this.createPinnedMessageOnce(scopeKey);
        return;
      }

      if (err instanceof Error && err.message.includes("message can't be edited")) {
        // Editing is no longer possible (e.g. Telegram's 48h edit window
        // expired): post a fresh dashboard instead of freezing on the dead id.
        context.state.messageId = null;
        this.clearPersistedPinnedId(scopeKey);
        await this.createPinnedMessageOnce(scopeKey);
        return;
      }

      logger.error("[PinnedManager] Error updating pinned message:", err);
    }
  }

  private async unpinOldMessage(scopeKey: string): Promise<void> {
    const context = this.getContext(scopeKey);
    if (!context.api || !context.chatId) {
      return;
    }

    try {
      if (context.state.messageId) {
        await this.retryTelegramCall(
          "unpin chat message",
          async () =>
            await context.api!.unpinChatMessage(context.chatId!, context.state.messageId!),
        ).catch(() => {});
      }
    } finally {
      context.state.messageId = null;
      this.clearPersistedPinnedId(scopeKey);
    }
  }

  getState(scopeKey: string = "global"): PinnedMessageState {
    return { ...this.getContext(scopeKey).state };
  }

  isInitialized(scopeKey: string = "global"): boolean {
    const context = this.contexts.get(scopeKey);
    return Boolean(context?.api && context?.chatId);
  }

  async clear(scopeKey: string = "global"): Promise<void> {
    const context = this.getContext(scopeKey);
    if (context.api && context.chatId && context.state.messageId) {
      await this.retryTelegramCall(
        "clear pinned unpin",
        async () => await context.api!.unpinChatMessage(context.chatId!, context.state.messageId!),
      ).catch(() => {});
      await this.retryTelegramCall(
        "clear pinned delete",
        async () => await context.api!.deleteMessage(context.chatId!, context.state.messageId!),
      ).catch(() => {});
    }

    if (context.debounceTimer) {
      clearTimeout(context.debounceTimer);
      context.debounceTimer = null;
    }

    this.bumpGeneration(scopeKey);
    context.state = this.createDefaultState(scopeKey);
    context.lastRenderedText = null;
    context.lastEditAt = 0;
    this.clearPersistedPinnedId(scopeKey);
  }
}

export const pinnedMessageManager = new PinnedMessageManager();
