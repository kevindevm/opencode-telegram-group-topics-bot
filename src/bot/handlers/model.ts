import { Context, InlineKeyboard } from "grammy";
import {
  addFavoriteModel,
  getFavoriteModels,
  removeFavoriteModel,
  searchModels,
  selectModel,
  fetchCurrentModel,
  getModelSelectionLists,
} from "../../model/manager.js";
import { formatModelForDisplay } from "../../model/types.js";
import type { FavoriteModel, ModelInfo, ModelSelectionLists } from "../../model/types.js";
import { formatVariantForButton } from "../../variant/manager.js";
import { logger } from "../../utils/logger.js";
import { createMainKeyboard } from "../utils/keyboard.js";
import { getStoredAgent, resolveProjectAgent } from "../../agent/manager.js";
import { pinnedMessageManager } from "../../pinned/manager.js";
import { keyboardManager } from "../../keyboard/manager.js";
import {
  clearActiveInlineMenu,
  ensureActiveInlineMenu,
  replyWithInlineMenu,
} from "./inline-menu.js";
import { t } from "../../i18n/index.js";
import { interactionManager } from "../../interaction/manager.js";
import { INTERACTION_CLEAR_REASON } from "../../interaction/constants.js";
import type { InteractionState } from "../../interaction/types.js";
import {
  SCOPE_CONTEXT,
  getScopeFromContext,
  getScopeFromKey,
  getScopeKeyFromContext,
  getThreadSendOptions,
} from "../scope.js";

function buildModelSelectionMenuText(modelLists: ModelSelectionLists): string {
  const lines = [t("model.menu.select"), t("model.menu.favorites_title")];

  if (modelLists.favorites.length === 0) {
    lines.push(t("model.menu.favorites_empty"));
  }

  lines.push(t("model.menu.recent_title"));

  if (modelLists.recent.length === 0) {
    lines.push(t("model.menu.recent_empty"));
  }

  return lines.join("\n");
}

export const MODEL_SEARCH_CALLBACK = "model:search";
export const MODEL_SEARCH_AGAIN_CALLBACK = "model:search:again";
export const MODEL_SEARCH_CANCEL_CALLBACK = "model:search:cancel";
const MODEL_SEARCH_RESULT_CALLBACK_PREFIX = "model:result:";
const MODEL_SEARCH_FAVORITE_CALLBACK_PREFIX = "model:fav:";

const MODEL_SEARCH_FLOW = "model-search";

interface ModelSearchMetadata {
  stage: string;
  query: string;
  messageId?: number | undefined;
  models: FavoriteModel[];
}

function parseModelItems(value: unknown): FavoriteModel[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const providerID = (item as { providerID?: unknown }).providerID;
    const modelID = (item as { modelID?: unknown }).modelID;
    if (typeof providerID !== "string" || typeof modelID !== "string") {
      return [];
    }

    return [{ providerID, modelID }];
  });
}

function parseModelSearchMetadata(state: InteractionState | null): ModelSearchMetadata | null {
  if (!state || state.kind !== "custom") {
    return null;
  }

  const metadata = state.metadata;
  if (metadata.flow !== MODEL_SEARCH_FLOW || typeof metadata.stage !== "string") {
    return null;
  }

  return {
    stage: metadata.stage,
    query: typeof metadata.query === "string" ? metadata.query : "",
    messageId: typeof metadata.messageId === "number" ? metadata.messageId : undefined,
    models: parseModelItems(metadata.models),
  };
}

function parseModelSearchResultIndex(data: string): number | null {
  if (!data.startsWith(MODEL_SEARCH_RESULT_CALLBACK_PREFIX)) {
    return null;
  }

  const rawIndex = data.slice(MODEL_SEARCH_RESULT_CALLBACK_PREFIX.length);
  if (!/^\d+$/.test(rawIndex)) {
    return null;
  }

  return Number.parseInt(rawIndex, 10);
}

function parseModelSearchFavoriteIndex(data: string): number | null {
  if (!data.startsWith(MODEL_SEARCH_FAVORITE_CALLBACK_PREFIX)) {
    return null;
  }

  const rawIndex = data.slice(MODEL_SEARCH_FAVORITE_CALLBACK_PREFIX.length);
  if (!/^\d+$/.test(rawIndex)) {
    return null;
  }

  return Number.parseInt(rawIndex, 10);
}

function getCallbackMessageId(ctx: Context): number | null {
  const message = ctx.callbackQuery?.message;
  if (!message || !("message_id" in message)) {
    return null;
  }

  const messageId = (message as { message_id?: unknown }).message_id;
  return typeof messageId === "number" ? messageId : null;
}

/**
 * Handle model selection callback
 * @param ctx grammY context
 * @returns true if handled, false otherwise
 */
export async function handleModelSelect(ctx: Context): Promise<boolean> {
  const callbackQuery = ctx.callbackQuery;

  if (!callbackQuery?.data || !callbackQuery.data.startsWith("model:")) {
    return false;
  }

  const data = callbackQuery.data;
  if (data === MODEL_SEARCH_CALLBACK || data === MODEL_SEARCH_AGAIN_CALLBACK) {
    return handleModelSearchStart(ctx);
  }

  if (data === MODEL_SEARCH_CANCEL_CALLBACK) {
    return handleModelSearchCancel(ctx);
  }

  if (data.startsWith(MODEL_SEARCH_RESULT_CALLBACK_PREFIX)) {
    return handleModelSearchPick(ctx);
  }

  if (data.startsWith(MODEL_SEARCH_FAVORITE_CALLBACK_PREFIX)) {
    return handleModelSearchFavorite(ctx);
  }

  const isActiveMenu = await ensureActiveInlineMenu(ctx, "model");
  if (!isActiveMenu) {
    return true;
  }

  logger.debug(`[ModelHandler] Received callback: ${callbackQuery.data}`);

  try {
    const scopeKey = getScopeKeyFromContext(ctx);

    const decoded = decodeModelCallback(callbackQuery.data);
    if (!decoded) {
      logger.error(`[ModelHandler] Invalid callback data format: ${callbackQuery.data}`);
      clearActiveInlineMenu("model_select_invalid_callback", scopeKey);
      await ctx.answerCallbackQuery({ text: t("model.change_error_callback") }).catch(() => {});
      return true;
    }

    const modelInfo: ModelInfo = {
      providerID: decoded.providerID,
      modelID: decoded.modelID,
      variant: "default", // Reset to default when switching models
    };

    return await applyModelSelection(ctx, scopeKey, modelInfo);
  } catch (err) {
    clearActiveInlineMenu("model_select_error", getScopeKeyFromContext(ctx));
    logger.error("[ModelHandler] Error handling model select:", err);
    await ctx.answerCallbackQuery({ text: t("model.change_error_callback") }).catch(() => {});
    return false;
  }
}

async function applyModelSelection(
  ctx: Context,
  scopeKey: string,
  modelInfo: ModelInfo,
): Promise<boolean> {
  try {
    if (ctx.chat) {
      keyboardManager.initialize(ctx.api, ctx.chat.id, scopeKey);
    }

    // Acknowledge the tap before any network I/O: refreshContextLimit and
    // resolveProjectAgent can take seconds, and a late answer shows as a
    // stuck button ("query is too old").
    await ctx.answerCallbackQuery().catch(() => {});

    // Select model and persist
    selectModel(modelInfo, scopeKey);

    // Update keyboard manager state (may not be initialized if no session selected)
    keyboardManager.updateModel(modelInfo, scopeKey);

    // Refresh context limit for new model
    await pinnedMessageManager.refreshContextLimit(scopeKey);

    // Update Reply Keyboard with new model and context
    const currentAgent = await resolveProjectAgent(getStoredAgent(scopeKey), scopeKey);
    const contextInfo =
      pinnedMessageManager.getContextInfo(scopeKey) ??
      (pinnedMessageManager.getContextLimit(scopeKey) > 0
        ? { tokensUsed: 0, tokensLimit: pinnedMessageManager.getContextLimit(scopeKey) }
        : keyboardManager.getContextInfo(scopeKey));

    if (contextInfo) {
      keyboardManager.updateContext(contextInfo.tokensUsed, contextInfo.tokensLimit, scopeKey);
    }
    keyboardManager.updateAgent(currentAgent, scopeKey);

    const variantName = formatVariantForButton(modelInfo.variant || "default");
    const scope = getScopeFromKey(scopeKey);
    const keyboard = createMainKeyboard(
      currentAgent,
      modelInfo,
      contextInfo ?? undefined,
      variantName,
      scope?.context === SCOPE_CONTEXT.GROUP_GENERAL
        ? {
            contextFirst: true,
            contextLabel: t("keyboard.general_defaults"),
          }
        : undefined,
    );
    const displayName = formatModelForDisplay(modelInfo.providerID, modelInfo.modelID);
    const threadId = getScopeFromContext(ctx)?.threadId ?? null;

    clearActiveInlineMenu("model_selected", scopeKey);

    // Send confirmation message with updated keyboard
    await ctx
      .answerCallbackQuery({ text: t("model.changed_callback", { name: displayName }) })
      .catch(() => {});
    await ctx.reply(t("model.changed_message", { name: displayName }), {
      reply_markup: keyboard,
      ...getThreadSendOptions(threadId),
    });

    // Delete the inline menu message
    await ctx.deleteMessage().catch(() => {});

    return true;
  } catch (err) {
    clearActiveInlineMenu("model_select_error", scopeKey);
    logger.error("[ModelHandler] Error applying model selection:", err);
    await ctx.answerCallbackQuery({ text: t("model.change_error_callback") }).catch(() => {});
    return false;
  }
}

function buildModelSearchResultsKeyboard(
  results: FavoriteModel[],
  currentModel?: ModelInfo,
  favorites: FavoriteModel[] = [],
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  const favoriteKeys = new Set(
    favorites.map((model) => `${model.providerID}/${model.modelID}`),
  );

  results.forEach((model, index) => {
    const isActive =
      currentModel &&
      model.providerID === currentModel.providerID &&
      model.modelID === currentModel.modelID;
    const isFavorite = favoriteKeys.has(`${model.providerID}/${model.modelID}`);
    // Button rows are split 50/50 with the ⭐ toggle, so labels stay short:
    // modelID only, plus provider only when it disambiguates duplicates.
    const duplicates = results.filter((other) => other.modelID === model.modelID);
    const needsProvider =
      duplicates.length > 1 && new Set(duplicates.map((other) => other.providerID)).size > 1;
    const shortLabel = needsProvider
      ? `${model.modelID} • ${model.providerID}`
      : model.modelID;
    const label = `${isActive ? "✅ " : ""}${shortLabel}`;
    keyboard
      .text(label, `${MODEL_SEARCH_RESULT_CALLBACK_PREFIX}${index}`)
      .text(
        isFavorite ? "★" : "⭐",
        `${MODEL_SEARCH_FAVORITE_CALLBACK_PREFIX}${index}`,
      )
      .row();
  });

  keyboard.text(t("model.search.search_again"), MODEL_SEARCH_AGAIN_CALLBACK).row();
  keyboard.text(t("model.search.cancel"), MODEL_SEARCH_CANCEL_CALLBACK);

  return keyboard;
}

async function handleModelSearchStart(ctx: Context): Promise<boolean> {
  const scopeKey = getScopeKeyFromContext(ctx);
  const scope = getScopeFromContext(ctx);

  try {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.deleteMessage().catch(() => {});

    const keyboard = new InlineKeyboard().text(
      t("model.search.cancel"),
      MODEL_SEARCH_CANCEL_CALLBACK,
    );
    const promptMessage = await ctx.reply(t("model.search.prompt"), {
      reply_markup: keyboard,
      ...getThreadSendOptions(scope?.threadId ?? null),
    });

    interactionManager.start(
      {
        kind: "custom",
        expectedInput: "text",
        metadata: {
          flow: MODEL_SEARCH_FLOW,
          stage: "query",
          messageId: promptMessage.message_id,
        },
      },
      scopeKey,
    );

    logger.debug("[ModelHandler] Waiting for model search query");
    return true;
  } catch (err) {
    logger.error("[ModelHandler] Error starting model search:", err);
    interactionManager.clear(INTERACTION_CLEAR_REASON.MODEL_SEARCH_FAILED, scopeKey);
    await ctx.reply(
      t("model.search.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
    return true;
  }
}

async function handleModelSearchCancel(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || data !== MODEL_SEARCH_CANCEL_CALLBACK) {
    return false;
  }

  const scopeKey = getScopeKeyFromContext(ctx);
  const meta = parseModelSearchMetadata(interactionManager.getSnapshot(scopeKey));
  if (!meta) {
    await ctx.answerCallbackQuery().catch(() => {});
    return false;
  }

  interactionManager.clear(INTERACTION_CLEAR_REASON.MODEL_SEARCH_CANCELLED, scopeKey);
  await ctx.answerCallbackQuery().catch(() => {});
  await ctx.editMessageText(t("model.search.cancelled")).catch(() => {});

  return true;
}

async function handleModelSearchPick(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";
  const scopeKey = getScopeKeyFromContext(ctx);
  const meta = parseModelSearchMetadata(interactionManager.getSnapshot(scopeKey));
  const index = parseModelSearchResultIndex(data);

  if (!meta || meta.stage !== "results" || index === null) {
    await ctx.answerCallbackQuery({ text: t("model.change_error_callback") }).catch(() => {});
    return true;
  }

  if (meta.messageId !== undefined && getCallbackMessageId(ctx) !== meta.messageId) {
    await ctx.answerCallbackQuery({ text: t("inline.inactive_callback") }).catch(() => {});
    return true;
  }

  const picked = meta.models[index];
  if (!picked) {
    await ctx.answerCallbackQuery({ text: t("model.change_error_callback") }).catch(() => {});
    return true;
  }

  interactionManager.clear(INTERACTION_CLEAR_REASON.MODEL_SEARCH_COMPLETED, scopeKey);
  return applyModelSelection(ctx, scopeKey, {
    providerID: picked.providerID,
    modelID: picked.modelID,
    variant: "default",
  });
}

async function handleModelSearchFavorite(ctx: Context): Promise<boolean> {
  const data = ctx.callbackQuery?.data ?? "";
  const scopeKey = getScopeKeyFromContext(ctx);
  const meta = parseModelSearchMetadata(interactionManager.getSnapshot(scopeKey));
  const index = parseModelSearchFavoriteIndex(data);

  if (!meta || meta.stage !== "results" || index === null) {
    return false;
  }

  if (meta.messageId !== undefined && getCallbackMessageId(ctx) !== meta.messageId) {
    await ctx.answerCallbackQuery({ text: t("inline.inactive_callback") }).catch(() => {});
    return true;
  }

  const picked = meta.models[index];
  if (!picked) {
    await ctx.answerCallbackQuery({ text: t("model.change_error_callback") }).catch(() => {});
    return true;
  }

  const favorites = await getFavoriteModels().catch(() => [] as FavoriteModel[]);
  const alreadyFavorite = favorites.some(
    (favorite) =>
      favorite.providerID === picked.providerID && favorite.modelID === picked.modelID,
  );

  if (alreadyFavorite) {
    await removeFavoriteModel(picked.providerID, picked.modelID);
    await ctx.answerCallbackQuery({ text: t("model.search.removed_favorite") }).catch(() => {});
  } else {
    await addFavoriteModel({ providerID: picked.providerID, modelID: picked.modelID });
    await ctx.answerCallbackQuery({ text: t("model.search.added_favorite") }).catch(() => {});
  }

  const updatedFavorites = await getFavoriteModels().catch(() => [] as FavoriteModel[]);
  const currentModel = fetchCurrentModel(scopeKey);
  await ctx
    .editMessageReplyMarkup({
      reply_markup: buildModelSearchResultsKeyboard(meta.models, currentModel, updatedFavorites),
    })
    .catch((error: unknown) => {
      // Re-taps produce identical markup; that specific no-op is expected.
      if (
        error instanceof Error &&
        error.message.toLowerCase().includes("message is not modified")
      ) {
        return;
      }
      logger.warn("[Model] Failed to refresh model search markup:", error);
    });

  return true;
}

/**
 * Handle the free-text search query typed after pressing the model search button.
 * @param ctx grammY context
 * @returns true if handled, false otherwise
 */
export async function handleModelSearchTextAnswer(ctx: Context): Promise<boolean> {
  const scopeKey = getScopeKeyFromContext(ctx);
  const meta = parseModelSearchMetadata(interactionManager.getSnapshot(scopeKey));
  if (!meta || meta.stage !== "query") {
    return false;
  }

  const text = ctx.message?.text;
  if (!text || text.startsWith("/")) {
    return false;
  }

  const scope = getScopeFromContext(ctx);
  const query = text.trim();

  let results: FavoriteModel[];
  try {
    results = await searchModels(query);
  } catch (err) {
    logger.error("[ModelHandler] Model search failed:", err);
    interactionManager.clear(INTERACTION_CLEAR_REASON.MODEL_SEARCH_FAILED, scopeKey);
    await ctx.reply(
      t("model.search.error"),
      getThreadSendOptions(scope?.threadId ?? null),
    );
    return true;
  }

  if (results.length === 0) {
    await ctx.reply(
      t("model.search.no_results", { query }),
      getThreadSendOptions(scope?.threadId ?? null),
    );
    return true;
  }

  const currentModel = fetchCurrentModel(scopeKey);
  const favorites = await getFavoriteModels().catch(() => [] as FavoriteModel[]);
  const keyboard = buildModelSearchResultsKeyboard(results, currentModel, favorites);
  const resultsMessage = await ctx.reply(t("model.search.results_title", { query }), {
    reply_markup: keyboard,
    ...getThreadSendOptions(scope?.threadId ?? null),
  });

  interactionManager.transition(
    {
      expectedInput: "callback",
      metadata: {
        flow: MODEL_SEARCH_FLOW,
        stage: "results",
        query,
        messageId: resultsMessage.message_id,
        models: results,
      },
    },
    scopeKey,
  );

  return true;
}

/**
 * Long provider/model ids (proxies, prefixed gateways) would exceed
 * Telegram's 64-byte callback_data limit and kill the whole menu. Short
 * ids travel inline; long ones go through a small lookup table.
 */
const MAX_MODEL_CALLBACK_BYTES = 64;
const MAX_MODEL_INDEX_ENTRIES = 1000;
const modelByIndexKey = new Map<string, FavoriteModel>();
let modelIndexCounter = 0;

function encodeModelCallback(model: FavoriteModel): string {
  const naive = `model:${model.providerID}:${model.modelID}`;
  if (Buffer.byteLength(naive, "utf-8") <= MAX_MODEL_CALLBACK_BYTES) {
    return naive;
  }
  while (modelByIndexKey.size >= MAX_MODEL_INDEX_ENTRIES) {
    const oldest = modelByIndexKey.keys().next();
    if (oldest.done) {
      break;
    }
    modelByIndexKey.delete(oldest.value);
  }
  const key = `#${modelIndexCounter++}`;
  modelByIndexKey.set(key, model);
  return `model:ref:${key}`;
}

function decodeModelCallback(data: string): { providerID: string; modelID: string } | null {
  const refPrefix = "model:ref:";
  if (data.startsWith(refPrefix)) {
    const model = modelByIndexKey.get(data.slice(refPrefix.length));
    return model ? { providerID: model.providerID, modelID: model.modelID } : null;
  }
  // Parse callback data: "model:providerID:modelID"
  const parts = data.split(":");
  if (parts.length < 3) {
    return null;
  }
  return { providerID: parts[1], modelID: parts.slice(2).join(":") };
}

export const __modelCallbackTestHooks = {
  encodeModelCallback,
  decodeModelCallback,
};
/**
 * Build inline keyboard with favorite and recent models
 * @param currentModel Current model for highlighting
 * @returns InlineKeyboard with model selection buttons
 */
export async function buildModelSelectionMenu(
  currentModel?: ModelInfo,
  modelLists?: ModelSelectionLists,
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard();
  const lists = modelLists ?? (await getModelSelectionLists());
  const favorites = lists.favorites;
  const recent = lists.recent;

  if (favorites.length === 0 && recent.length === 0) {
    logger.warn("[ModelHandler] No model choices found in favorites/recent");
  }

  const addButton = (model: FavoriteModel, prefix: string): void => {
    const isActive =
      currentModel &&
      model.providerID === currentModel.providerID &&
      model.modelID === currentModel.modelID;

    // Inline buttons use full model ID without truncation
    const label = `${prefix} ${model.providerID}/${model.modelID}`;
    const labelWithCheck = isActive ? `✅ ${label}` : label;

    keyboard.text(labelWithCheck, encodeModelCallback(model)).row();
  };

  favorites.forEach((model) => addButton(model, "⭐"));
  recent.forEach((model) => addButton(model, "🕘"));

  keyboard.text(t("model.search.button"), MODEL_SEARCH_CALLBACK).row();

  return keyboard;
}

/**
 * Show model selection menu
 * @param ctx grammY context
 */
export async function showModelSelectionMenu(ctx: Context): Promise<void> {
  try {
    const threadId = getScopeFromContext(ctx)?.threadId ?? null;
    const scopeKey = getScopeKeyFromContext(ctx);
    const currentModel = fetchCurrentModel(scopeKey);
    const modelLists = await getModelSelectionLists();
    const keyboard = await buildModelSelectionMenu(currentModel, modelLists);

    if (keyboard.inline_keyboard.length === 0) {
      await ctx.reply(t("model.menu.empty"), getThreadSendOptions(threadId));
      return;
    }

    const text = buildModelSelectionMenuText(modelLists);

    await replyWithInlineMenu(ctx, {
      menuKind: "model",
      text,
      keyboard,
    });
  } catch (err) {
    logger.error("[ModelHandler] Error showing model menu:", err);
    await ctx.reply(
      t("model.menu.error"),
      getThreadSendOptions(getScopeFromContext(ctx)?.threadId ?? null),
    );
  }
}
