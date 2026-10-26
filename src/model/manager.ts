import path from "node:path";
import { config } from "../config.js";
import { opencodeClient } from "../opencode/client.js";
import { getCurrentModel, getScopedModels, setCurrentModel } from "../settings/manager.js";
import { logger } from "../utils/logger.js";
import type { FavoriteModel, ModelInfo, ModelSelectionLists } from "./types.js";

interface OpenCodeModelState {
  favorite?: Array<{ providerID?: string; modelID?: string }>;
  recent?: Array<{ providerID?: string; modelID?: string }>;
}

const MODEL_CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;

let cachedValidModelKeys: Set<string> | null = null;
let modelCatalogCacheExpiresAt = 0;
let modelCatalogFetchInFlight: Promise<Set<string> | null> | null = null;

function getModelKey(providerID: string, modelID: string): string {
  return `${providerID}/${modelID}`;
}

function getEnvDefaultModel(): FavoriteModel | null {
  const providerID = config.opencode.model.provider;
  const modelID = config.opencode.model.modelId;

  if (!providerID || !modelID) {
    return null;
  }

  return { providerID, modelID };
}

function dedupeModels(models: FavoriteModel[]): FavoriteModel[] {
  const unique = new Map<string, FavoriteModel>();

  for (const model of models) {
    const key = `${model.providerID}/${model.modelID}`;
    if (!unique.has(key)) {
      unique.set(key, model);
    }
  }

  return Array.from(unique.values());
}

function filterModelsByCatalog(
  models: FavoriteModel[],
  validModelKeys: Set<string> | null,
): FavoriteModel[] {
  if (!validModelKeys) {
    return models;
  }

  return models.filter((model) => validModelKeys.has(getModelKey(model.providerID, model.modelID)));
}

async function getValidModelKeys(): Promise<Set<string> | null> {
  if (cachedValidModelKeys && Date.now() < modelCatalogCacheExpiresAt) {
    logger.debug(
      `[ModelManager] Model catalog cache hit: models=${cachedValidModelKeys.size}, ttlMs=${modelCatalogCacheExpiresAt - Date.now()}`,
    );
    return cachedValidModelKeys;
  }

  if (modelCatalogFetchInFlight) {
    logger.debug("[ModelManager] Awaiting in-flight model catalog refresh");
    return modelCatalogFetchInFlight;
  }

  modelCatalogFetchInFlight = (async () => {
    try {
      logger.debug("[ModelManager] Refreshing model catalog from OpenCode API");
      const response = await opencodeClient.config.providers();

      if (response.error || !response.data) {
        logger.warn("[ModelManager] Failed to refresh model catalog:", response.error);

        if (cachedValidModelKeys) {
          logger.warn("[ModelManager] Using stale model catalog cache after refresh failure");
          return cachedValidModelKeys;
        }

        return null;
      }

      const validModelKeys = new Set<string>();

      for (const provider of response.data.providers) {
        for (const modelID of Object.keys(provider.models ?? {})) {
          validModelKeys.add(getModelKey(provider.id, modelID));
        }
      }

      if (validModelKeys.size === 0) {
        logger.warn(
          "[ModelManager] Model catalog came back empty, not caching it as valid",
        );

        if (cachedValidModelKeys) {
          logger.warn("[ModelManager] Using stale model catalog cache after empty refresh");
          return cachedValidModelKeys;
        }

        return null;
      }

      cachedValidModelKeys = validModelKeys;
      modelCatalogCacheExpiresAt = Date.now() + MODEL_CATALOG_CACHE_TTL_MS;

      logger.debug(
        `[ModelManager] Model catalog refreshed: providers=${response.data.providers.length}, models=${validModelKeys.size}`,
      );

      return cachedValidModelKeys;
    } catch (err) {
      logger.warn("[ModelManager] Error refreshing model catalog:", err);

      if (cachedValidModelKeys) {
        logger.warn("[ModelManager] Using stale model catalog cache after refresh exception");
        return cachedValidModelKeys;
      }

      return null;
    } finally {
      modelCatalogFetchInFlight = null;
    }
  })();

  return modelCatalogFetchInFlight;
}

const MODEL_SEARCH_RESULTS_LIMIT = 10;

/** In-order character match, so "gml" still finds "glm-..." models. */
function isSubsequenceMatch(query: string, target: string): boolean {
  let queryIndex = 0;
  for (let i = 0; i < target.length && queryIndex < query.length; i++) {
    if (target[i] === query[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === query.length;
}

const FREE_MODEL_SUFFIX = "-free";

/**
 * Lower is better: model-id prefix matches first, then provider prefix,
 * then substring hits, then fuzzy in-order matches. Free-tier variants win
 * ties so "-free" models are not buried under alphabetical ordering.
 */
function rankModelKey(key: string, query: string): [number, number, string] {
  const separatorIndex = key.indexOf("/");
  const provider = key.slice(0, separatorIndex).toLowerCase();
  const modelId = key.slice(separatorIndex + 1).toLowerCase();

  let tier: number;
  if (modelId.startsWith(query)) {
    tier = 0;
  } else if (provider.startsWith(query)) {
    tier = 1;
  } else if (modelId.includes(query) || provider.includes(query)) {
    tier = 2;
  } else {
    tier = 3;
  }

  const freeBoost = modelId.endsWith(FREE_MODEL_SUFFIX) ? 0 : 1;
  return [tier, freeBoost, key.toLowerCase()];
}

function compareRankedKeys(
  left: [number, number, string],
  right: [number, number, string],
): number {
  return (
    left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2])
  );
}

function toFavoriteModels(keys: string[]): FavoriteModel[] {
  return keys.map((key) => {
    const separatorIndex = key.indexOf("/");
    return {
      providerID: key.slice(0, separatorIndex),
      modelID: key.slice(separatorIndex + 1),
    };
  });
}

/**
 * Search models across the full provider catalog. Results are ranked:
 * model-id prefix matches first, then provider prefix, then substring hits,
 * then in-order (fuzzy) matches. Free-tier variants win ties so they are not
 * buried under alphabetical ordering. Returns at most the result limit.
 */
export async function searchModels(query: string): Promise<FavoriteModel[]> {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  const validModelKeys = await getValidModelKeys();
  if (!validModelKeys) {
    return [];
  }

  const keys = [...validModelKeys];

  const substringMatches = keys.filter((key) =>
    key.toLowerCase().includes(normalizedQuery),
  );
  const substringSet = new Set(substringMatches);
  const fuzzyMatches = keys.filter(
    (key) => !substringSet.has(key) && isSubsequenceMatch(normalizedQuery, key.toLowerCase()),
  );

  const ranked = [...substringMatches, ...fuzzyMatches]
    .map((key) => ({ key, rank: rankModelKey(key, normalizedQuery) }))
    .sort((left, right) => compareRankedKeys(left.rank, right.rank))
    .slice(0, MODEL_SEARCH_RESULTS_LIMIT)
    .map((entry) => entry.key);

  return toFavoriteModels(ranked);
}

async function readOpenCodeModelState(): Promise<OpenCodeModelState | null> {
  try {
    const fs = await import("fs/promises");
    const content = await fs.readFile(getOpenCodeModelStatePath(), "utf-8");
    return JSON.parse(content) as OpenCodeModelState;
  } catch {
    return null;
  }
}

async function writeOpenCodeModelState(state: OpenCodeModelState): Promise<void> {
  const fs = await import("fs/promises");
  const stateFilePath = getOpenCodeModelStatePath();
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Adds a model to the OpenCode favorites file. Uses the same state file the
 * bot reads, so the favorite shows up in the menu right away. Note the bot
 * service may resolve a different state file than an interactive CLI login
 * (service HOME vs user HOME), in which case favorites stay bot-local.
 */
export async function addFavoriteModel(model: FavoriteModel): Promise<boolean> {
  if (!model.providerID || !model.modelID) {
    return false;
  }

  const state = (await readOpenCodeModelState()) ?? {};
  const favorites = Array.isArray(state.favorite) ? [...state.favorite] : [];
  const alreadyListed = favorites.some(
    (entry) => entry?.providerID === model.providerID && entry?.modelID === model.modelID,
  );
  if (alreadyListed) {
    return false;
  }

  favorites.push({ providerID: model.providerID, modelID: model.modelID });
  await writeOpenCodeModelState({ ...state, favorite: favorites });
  logger.info(`[ModelManager] Added model to favorites: ${model.providerID}/${model.modelID}`);
  return true;
}

export async function removeFavoriteModel(providerID: string, modelID: string): Promise<boolean> {
  const state = await readOpenCodeModelState();
  if (!state || !Array.isArray(state.favorite)) {
    return false;
  }

  const next = state.favorite.filter(
    (entry) => entry?.providerID !== providerID || entry?.modelID !== modelID,
  );
  if (next.length === state.favorite.length) {
    return false;
  }

  await writeOpenCodeModelState({ ...state, favorite: next });
  logger.info(`[ModelManager] Removed model from favorites: ${providerID}/${modelID}`);
  return true;
}

function normalizeFavoriteModels(state: OpenCodeModelState): FavoriteModel[] {
  if (!Array.isArray(state.favorite)) {
    return [];
  }

  return state.favorite
    .filter(
      (model): model is { providerID: string; modelID: string } =>
        typeof model?.providerID === "string" &&
        model.providerID.length > 0 &&
        typeof model.modelID === "string" &&
        model.modelID.length > 0,
    )
    .map((model) => ({
      providerID: model.providerID,
      modelID: model.modelID,
    }));
}

function normalizeRecentModels(state: OpenCodeModelState): FavoriteModel[] {
  if (!Array.isArray(state.recent)) {
    return [];
  }

  return state.recent
    .filter(
      (model): model is { providerID: string; modelID: string } =>
        typeof model?.providerID === "string" &&
        model.providerID.length > 0 &&
        typeof model.modelID === "string" &&
        model.modelID.length > 0,
    )
    .map((model) => ({
      providerID: model.providerID,
      modelID: model.modelID,
    }));
}

function getOpenCodeModelStatePath(): string {
  const xdgStateHome = process.env.XDG_STATE_HOME;

  if (xdgStateHome && xdgStateHome.trim().length > 0) {
    return path.join(xdgStateHome, "opencode", "model.json");
  }

  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  return path.join(homeDir, ".local", "state", "opencode", "model.json");
}

/**
 * Get favorite and recent models from OpenCode local state file.
 * Config model is always treated as favorite.
 */
export async function getModelSelectionLists(): Promise<ModelSelectionLists> {
  const envDefaultModel = getEnvDefaultModel();

  try {
    const fs = await import("fs/promises");

    const stateFilePath = getOpenCodeModelStatePath();
    const content = await fs.readFile(stateFilePath, "utf-8");
    const state = JSON.parse(content) as OpenCodeModelState;

    const rawFavorites = normalizeFavoriteModels(state);
    const rawRecent = normalizeRecentModels(state);
    const shouldValidateWithCatalog = rawFavorites.length > 0 || rawRecent.length > 0;
    const validModelKeys = shouldValidateWithCatalog ? await getValidModelKeys() : null;

    const validatedFavorites = filterModelsByCatalog(rawFavorites, validModelKeys);
    const validatedRecent = filterModelsByCatalog(rawRecent, validModelKeys);

    const favorites = envDefaultModel
      ? dedupeModels([...validatedFavorites, envDefaultModel])
      : validatedFavorites;

    if (rawFavorites.length === 0 && envDefaultModel) {
      logger.info(
        `[ModelManager] No favorites in ${stateFilePath}, using config model as favorite`,
      );
    }

    if (favorites.length === 0) {
      logger.warn(`[ModelManager] No favorites in ${stateFilePath}`);
    }

    const filteredOutFavorites = rawFavorites.length - validatedFavorites.length;
    const filteredOutRecent = rawRecent.length - validatedRecent.length;

    if (filteredOutFavorites > 0 || filteredOutRecent > 0) {
      logger.info(
        `[ModelManager] Filtered unavailable models from OpenCode state: favoritesRemoved=${filteredOutFavorites}, recentRemoved=${filteredOutRecent}`,
      );
    }

    const favoriteKeys = new Set(
      favorites.map((model) => getModelKey(model.providerID, model.modelID)),
    );
    const recent = dedupeModels(validatedRecent).filter(
      (model) => !favoriteKeys.has(getModelKey(model.providerID, model.modelID)),
    );

    logger.debug(
      `[ModelManager] Loaded model selection lists from ${stateFilePath}: favorites=${favorites.length}, recent=${recent.length}`,
    );

    return { favorites, recent };
  } catch (err) {
    if (envDefaultModel) {
      logger.warn(
        "[ModelManager] Failed to load OpenCode model state, using config model as favorite:",
        err,
      );
      return {
        favorites: [envDefaultModel],
        recent: [],
      };
    }

    logger.error("[ModelManager] Failed to load OpenCode model state:", err);
    return {
      favorites: [],
      recent: [],
    };
  }
}

export async function reconcileStoredModelSelection(): Promise<void> {
  const scopedEntries = Object.entries(getScopedModels()).filter(([, model]) =>
    Boolean(model?.providerID && model.modelID),
  );

  if (scopedEntries.length === 0) {
    return;
  }

  const validModelKeys = await getValidModelKeys();

  if (!validModelKeys) {
    logger.warn("[ModelManager] Skipping stored model validation: model catalog unavailable");
    return;
  }

  const envDefaultModel = getEnvDefaultModel();
  if (!envDefaultModel) {
    logger.warn(
      "[ModelManager] Cannot reconcile unavailable stored models: env default model is missing",
    );
    return;
  }

  const fallbackModel: ModelInfo = {
    providerID: envDefaultModel.providerID,
    modelID: envDefaultModel.modelID,
    variant: "default",
  };

  for (const [scopeKey, model] of scopedEntries) {
    const currentModelKey = getModelKey(model.providerID, model.modelID);

    if (validModelKeys.has(currentModelKey)) {
      continue;
    }

    logger.warn(
      `[ModelManager] Stored model ${currentModelKey} is unavailable in scope ${scopeKey}, falling back to ${fallbackModel.providerID}/${fallbackModel.modelID}`,
    );
    setCurrentModel({ ...fallbackModel }, scopeKey);
  }
}

export function __resetModelCatalogCacheForTests(): void {
  cachedValidModelKeys = null;
  modelCatalogCacheExpiresAt = 0;
  modelCatalogFetchInFlight = null;
}

/** Drops the cached catalog so the next read refetches it from the server. */
export function resetModelCatalogCache(): void {
  cachedValidModelKeys = null;
  modelCatalogCacheExpiresAt = 0;
  modelCatalogFetchInFlight = null;
}

/** Refetches the model catalog and reconciles stored scoped selections. */
export async function refreshModelCatalog(): Promise<void> {
  resetModelCatalogCache();
  await reconcileStoredModelSelection();
}

/**
 * Get list of favorite models from OpenCode local state file
 * Falls back to env default model if file is unavailable or empty
 */
export async function getFavoriteModels(): Promise<FavoriteModel[]> {
  const { favorites } = await getModelSelectionLists();
  return favorites;
}

/**
 * Get current model from settings or fallback to config
 * @returns Current model info
 */
export function fetchCurrentModel(scopeKey: string = "global"): ModelInfo {
  return getStoredModel(scopeKey);
}

/**
 * Select model and persist to settings
 * @param modelInfo Model to select
 */
export function selectModel(modelInfo: ModelInfo, scopeKey: string = "global"): void {
  logger.info(`[ModelManager] Selected model: ${modelInfo.providerID}/${modelInfo.modelID}`);
  setCurrentModel(modelInfo, scopeKey);
}

/**
 * Get stored model from settings (synchronous)
 * ALWAYS returns a model - fallback to config if not found
 * @returns Current model info
 */
export function getStoredModel(scopeKey: string = "global"): ModelInfo {
  const storedModel = getCurrentModel(scopeKey);

  if (storedModel) {
    // Ensure variant is set (default to "default")
    if (!storedModel.variant) {
      storedModel.variant = "default";
    }
    return storedModel;
  }

  // Fallback to model from config (environment variables)
  if (config.opencode.model.provider && config.opencode.model.modelId) {
    logger.debug("[ModelManager] Using model from config");
    return {
      providerID: config.opencode.model.provider,
      modelID: config.opencode.model.modelId,
      variant: "default",
    };
  }

  // This should not happen if config is properly set
  logger.warn("[ModelManager] No model found in settings or config, returning empty model");
  return {
    providerID: "",
    modelID: "",
    variant: "default",
  };
}
