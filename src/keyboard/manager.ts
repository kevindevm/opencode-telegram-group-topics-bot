import type { Api } from "grammy";
import { createMainKeyboard } from "../bot/utils/keyboard.js";
import type { ModelInfo } from "../model/types.js";
import { getStoredAgent } from "../agent/manager.js";
import { getStoredModel } from "../model/manager.js";
import { formatVariantForButton } from "../variant/manager.js";
import { logger } from "../utils/logger.js";
import type { ContextInfo, KeyboardState } from "./types.js";
import { t } from "../i18n/index.js";
import { SCOPE_CONTEXT, getScopeFromKey, getThreadIdFromScopeKey } from "../bot/scope.js";
import { contextStateManager } from "../context/manager.js";

class KeyboardManager {
  private stateByScope: Map<string, KeyboardState> = new Map();

  private api: Api | null = null;
  private chatId: number | null = null;
  private lastUpdateTimeByScope = new Map<string, number>();
  private readonly UPDATE_DEBOUNCE_MS = 2000;
  private lastSentMarkupByScope = new Map<string, string>();

  private getOrCreateState(scopeKey: string): KeyboardState {
    const existing = this.stateByScope.get(scopeKey);
    if (existing) {
      return existing;
    }

    const currentModel = getStoredModel(scopeKey);
    const state: KeyboardState = {
      currentAgent: getStoredAgent(scopeKey),
      currentModel,
      contextInfo: null,
      variantName: formatVariantForButton(currentModel.variant || "default"),
    };

    this.stateByScope.set(scopeKey, state);
    return state;
  }

  public initialize(api: Api, chatId: number, scopeKey: string = "global"): void {
    this.api = api;
    this.chatId = chatId;

    const hadState = this.stateByScope.has(scopeKey);
    const state = this.getOrCreateState(scopeKey);

    if (!hadState) {
      logger.debug(
        `[KeyboardManager] Initialized scope=${scopeKey} agent="${state.currentAgent}", model="${state.currentModel.providerID}/${state.currentModel.modelID}", variant="${state.currentModel.variant || "default"}", chatId=${chatId}`,
      );
    }
  }

  public updateAgent(agent: string, scopeKey: string = "global"): void {
    const state = this.getOrCreateState(scopeKey);
    state.currentAgent = agent;
  }

  public updateModel(model: ModelInfo, scopeKey: string = "global"): void {
    const state = this.getOrCreateState(scopeKey);
    state.currentModel = model;
    state.variantName = formatVariantForButton(model.variant || "default");
  }

  public updateVariant(variantId: string, scopeKey: string = "global"): void {
    const state = this.getOrCreateState(scopeKey);
    // Keep the local model copy in sync too: buildKeyboard re-syncs the
    // variant name from the settings store, so a variant-only local update
    // would otherwise be overwritten on the next build.
    state.currentModel = { ...state.currentModel, variant: variantId };
    state.variantName = formatVariantForButton(variantId);
  }

  public updateContext(tokensUsed: number, tokensLimit: number, scopeKey: string = "global"): void {
    contextStateManager.update(tokensUsed, tokensLimit, scopeKey);
    const state = this.stateByScope.get(scopeKey);
    if (state) {
      state.contextInfo = contextStateManager.get(scopeKey);
    }
  }

  public clearContext(scopeKey: string = "global"): void {
    contextStateManager.clear(scopeKey);
    const state = this.stateByScope.get(scopeKey);
    if (state) {
      state.contextInfo = null;
    }
  }

  /** Drops all per-scope keyboard state (topic closed or rebound). */
  public clearScope(scopeKey: string): void {
    this.stateByScope.delete(scopeKey);
    this.lastUpdateTimeByScope.delete(scopeKey);
    this.lastSentMarkupByScope.delete(scopeKey);
    contextStateManager.clear(scopeKey);
  }

  public getContextInfo(scopeKey: string = "global"): ContextInfo | null {
    return contextStateManager.get(scopeKey);
  }

  private buildKeyboard(scopeKey: string) {
    const state = this.getOrCreateState(scopeKey);
    // The settings store is the source of truth: several flows (live-model
    // sync before a prompt, session/fork/new topic binding) update it without
    // touching keyboard state, leaving stale agent/model buttons behind.
    // Re-sync on every build so the fingerprint catches those changes.
    state.currentAgent = getStoredAgent(scopeKey);
    const storedModel = getStoredModel(scopeKey);
    state.currentModel = storedModel;
    state.variantName = formatVariantForButton(storedModel.variant || "default");
    const scope = getScopeFromKey(scopeKey);
    const effectiveContextInfo =
      scope?.context === SCOPE_CONTEXT.GROUP_GENERAL
        ? undefined
        : (contextStateManager.get(scopeKey) ?? undefined);
    // The local copy is a mirror of the shared store: keep it aligned so
    // getState() never serves a stale context button.
    state.contextInfo = effectiveContextInfo ?? null;
    const keyboardOptions =
      scope?.context === SCOPE_CONTEXT.GROUP_GENERAL
        ? {
            contextFirst: true,
            contextLabel: t("keyboard.general_defaults"),
          }
        : undefined;

    return createMainKeyboard(
      state.currentAgent,
      state.currentModel,
      effectiveContextInfo,
      state.variantName,
      keyboardOptions,
    );
  }

  /**
   * Returns the current keyboard markup when it differs from the last one
   * delivered to the client, recording it as delivered. Lets messages the
   * bot already sends (final answers, notices) carry the refresh for free
   * instead of firing a standalone carrier. Returns undefined when the
   * client is already up to date. Optimistic: a failed send may skip one
   * refresh, but the next context change (or the turn-end fallback) retries.
   */
  public consumeStaleKeyboardMarkup(scopeKey: string = "global") {
    if (!this.stateByScope.has(scopeKey)) {
      return undefined;
    }

    const keyboard = this.buildKeyboard(scopeKey);
    const fingerprint = JSON.stringify(keyboard);
    if (this.lastSentMarkupByScope.get(scopeKey) === fingerprint) {
      return undefined;
    }

    this.lastSentMarkupByScope.set(scopeKey, fingerprint);
    this.lastUpdateTimeByScope.set(scopeKey, Date.now());
    return keyboard;
  }

  public async sendKeyboardUpdate(
    chatId?: number,
    scopeKey: string = "global",
    options: { force?: boolean } = {},
  ): Promise<void> {
    if (!this.api) {
      logger.warn("[KeyboardManager] API not initialized");
      return;
    }

    const targetChatId = chatId ?? this.chatId;
    if (!targetChatId) {
      logger.warn("[KeyboardManager] No chatId available");
      return;
    }

    const now = Date.now();
    // The turn-end repost must not be swallowed by the mid-run debounce: it
    // is the one update that guarantees the topic ends with current numbers.
    // The markup fingerprint below still skips it when nothing changed.
    if (!options?.force) {
      const lastUpdateTime = this.lastUpdateTimeByScope.get(scopeKey) ?? 0;
      if (now - lastUpdateTime < this.UPDATE_DEBOUNCE_MS) {
        return;
      }
    }

    // Piggybacked messages (final answers carrying the markup via
    // consumeStaleKeyboardMarkup) already recorded this fingerprint, so the
    // carrier below stays silent when the client is up to date.
    // Note: no timestamp update here on the no-change path. Recording one
    // would restart the debounce window without delivering anything and
    // could freeze a real update that lands right after a forced no-op.
    const previousFingerprint = this.lastSentMarkupByScope.get(scopeKey);
    const previousUpdateTime = this.lastUpdateTimeByScope.get(scopeKey);
    const keyboard = this.consumeStaleKeyboardMarkup(scopeKey);
    if (!keyboard) {
      return;
    }

    try {
      const threadId = getThreadIdFromScopeKey(scopeKey);
      const sent = await this.api.sendMessage(targetChatId, t("keyboard.updated"), {
        reply_markup: keyboard,
        disable_notification: true,
        ...(typeof threadId === "number" ? { message_thread_id: threadId } : {}),
      });
      // Silent refresh: the reply keyboard persists in the chat after its
      // carrier message is deleted, so remove it right away instead of
      // leaving a "keyboard updated" notice behind.
      await this.api.deleteMessage(targetChatId, sent.message_id).catch(() => {});
    } catch (err) {
      // The fingerprint was recorded optimistically by
      // consumeStaleKeyboardMarkup: roll it back so the next update retries
      // instead of freezing the client on the failed markup forever.
      if (previousFingerprint === undefined) {
        this.lastSentMarkupByScope.delete(scopeKey);
      } else {
        this.lastSentMarkupByScope.set(scopeKey, previousFingerprint);
      }
      if (previousUpdateTime === undefined) {
        this.lastUpdateTimeByScope.delete(scopeKey);
      } else {
        this.lastUpdateTimeByScope.set(scopeKey, previousUpdateTime);
      }
      logger.error("[KeyboardManager] Failed to send keyboard update:", err);
    }
  }

  public getKeyboard(scopeKey: string = "global") {
    if (!this.stateByScope.has(scopeKey)) {
      return undefined;
    }

    return this.buildKeyboard(scopeKey);
  }

  public getState(scopeKey: string = "global"): KeyboardState | undefined {
    return this.stateByScope.get(scopeKey);
  }

  public isInitialized(scopeKey: string = "global"): boolean {
    return this.stateByScope.has(scopeKey);
  }
}

export const keyboardManager = new KeyboardManager();
