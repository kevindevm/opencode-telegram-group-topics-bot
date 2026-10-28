import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { configMock, providersMock } = vi.hoisted(() => ({
  configMock: {
    opencode: {
      model: {
        provider: "opencode",
        modelId: "big-pickle",
      },
    },
  },
  providersMock: vi.fn(),
}));

vi.mock("../../src/config.js", () => ({
  config: configMock,
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    config: {
      providers: providersMock,
    },
  },
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  __resetModelCatalogCacheForTests,
  addFavoriteModel,
  getFavoriteModels,
  getModelSelectionLists,
  getStoredModel,
  removeFavoriteModel,
  searchModels,
} from "../../src/model/manager.js";
import {
  __resetSettingsForTests,
  clearCurrentModel,
  setCurrentModel,
} from "../../src/settings/manager.js";

describe("model/manager", () => {
  let tempDir = "";
  let originalXdgStateHome: string | undefined;
  let originalHome: string | undefined;

  beforeEach(() => {
    originalXdgStateHome = process.env.XDG_STATE_HOME;
    originalHome = process.env.HOME;
    providersMock.mockReset();
    providersMock.mockResolvedValue({
      data: {
        providers: [
          { id: "openai", models: { "gpt-4o": {}, "gpt-3.5": {} } },
          { id: "anthropic", models: { "claude-sonnet": {} } },
          { id: "google", models: { "gemini-pro": {} } },
          { id: "opencode", models: { "big-pickle": {} } },
        ],
      },
      error: null,
    });
    __resetModelCatalogCacheForTests();
  });

  afterEach(async () => {
    process.env.XDG_STATE_HOME = originalXdgStateHome;
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }

    __resetModelCatalogCacheForTests();
  });

  async function setupMockModelFile(content: object): Promise<string> {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-model-test-"));
    const opencodeDir = path.join(tempDir, "opencode");
    await mkdir(opencodeDir, { recursive: true });
    const modelFilePath = path.join(opencodeDir, "model.json");
    await writeFile(modelFilePath, JSON.stringify(content), "utf-8");
    process.env.XDG_STATE_HOME = tempDir;
    return modelFilePath;
  }

  describe("getModelSelectionLists", () => {
    it("returns favorites and recent from model.json", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "anthropic", modelID: "claude-sonnet" },
        ],
        recent: [
          { providerID: "google", modelID: "gemini-pro" },
          { providerID: "openai", modelID: "gpt-3.5" },
        ],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(3); // 2 from file + 1 default
      expect(result.favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(result.favorites).toContainEqual({
        providerID: "anthropic",
        modelID: "claude-sonnet",
      });
      expect(result.favorites).toContainEqual({ providerID: "opencode", modelID: "big-pickle" });

      expect(result.recent).toHaveLength(2);
      expect(result.recent).toContainEqual({ providerID: "google", modelID: "gemini-pro" });
      expect(result.recent).toContainEqual({ providerID: "openai", modelID: "gpt-3.5" });
    });

    it("deduplicates models with same provider/model combination", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "openai", modelID: "gpt-4o" }, // duplicate
          { providerID: "anthropic", modelID: "claude-sonnet" },
        ],
        recent: [],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(3); // 2 unique from file + 1 default
      const openaiGpt4oCount = result.favorites.filter(
        (m) => m.providerID === "openai" && m.modelID === "gpt-4o",
      ).length;
      expect(openaiGpt4oCount).toBe(1);
    });

    it("does not include recent models that are already in favorites", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "anthropic", modelID: "claude-sonnet" },
        ],
        recent: [
          { providerID: "openai", modelID: "gpt-4o" }, // duplicate of favorite
          { providerID: "google", modelID: "gemini-pro" }, // unique
        ],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(result.recent).not.toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(result.recent).toContainEqual({ providerID: "google", modelID: "gemini-pro" });
    });

    it("falls back to config model when model.json does not exist", async () => {
      // Set XDG_STATE_HOME to a non-existent directory
      tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-model-test-"));
      process.env.XDG_STATE_HOME = path.join(tempDir, "nonexistent");

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(1);
      expect(result.favorites[0]).toEqual({ providerID: "opencode", modelID: "big-pickle" });
      expect(result.recent).toHaveLength(0);
    });

    it("returns empty lists when file does not exist and no config model", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-model-test-"));
      process.env.XDG_STATE_HOME = path.join(tempDir, "nonexistent");
      configMock.opencode.model.provider = "";
      configMock.opencode.model.modelId = "";

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(0);
      expect(result.recent).toHaveLength(0);

      // Restore config
      configMock.opencode.model.provider = "opencode";
      configMock.opencode.model.modelId = "big-pickle";
    });

    it("handles missing recent array gracefully", async () => {
      await setupMockModelFile({
        favorite: [{ providerID: "openai", modelID: "gpt-4o" }],
        // no recent field
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(2); // 1 from file + 1 default
      expect(result.recent).toHaveLength(0);
    });

    it("handles missing favorite array gracefully", async () => {
      await setupMockModelFile({
        // no favorite field
        recent: [{ providerID: "openai", modelID: "gpt-4o" }],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(1); // just default
      expect(result.recent).toHaveLength(1);
      expect(result.recent[0]).toEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("filters out invalid model entries with missing providerID", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "", modelID: "invalid-model" },
          { modelID: "no-provider" }, // missing providerID
        ],
        recent: [],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(2); // 1 valid from file + 1 default
      expect(result.favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(result.favorites).toContainEqual({ providerID: "opencode", modelID: "big-pickle" });
    });

    it("filters out invalid model entries with missing modelID", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "anthropic", modelID: "" },
          { providerID: "no-model" }, // missing modelID
        ],
        recent: [],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(2); // 1 valid from file + 1 default
      expect(result.favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("deduplicates default config model when already in favorites", async () => {
      // configMock has opencode/big-pickle as default
      await setupMockModelFile({
        favorite: [
          { providerID: "opencode", modelID: "big-pickle" }, // same as default
          { providerID: "openai", modelID: "gpt-4o" },
        ],
        recent: [],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toHaveLength(2); // should not duplicate the default
      const opencodeBigPickleCount = result.favorites.filter(
        (m) => m.providerID === "opencode" && m.modelID === "big-pickle",
      ).length;
      expect(opencodeBigPickleCount).toBe(1);
    });

    it("deduplicates recent models", async () => {
      await setupMockModelFile({
        favorite: [],
        recent: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "openai", modelID: "gpt-4o" }, // duplicate
          { providerID: "google", modelID: "gemini-pro" },
        ],
      });

      const result = await getModelSelectionLists();

      expect(result.recent).toHaveLength(2);
      expect(result.recent).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(result.recent).toContainEqual({ providerID: "google", modelID: "gemini-pro" });
    });

    it("filters unavailable favorites and recents using provider catalog", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "missing", modelID: "gone" },
        ],
        recent: [
          { providerID: "google", modelID: "gemini-pro" },
          { providerID: "missing", modelID: "also-gone" },
        ],
      });

      const result = await getModelSelectionLists();

      expect(result.favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(result.favorites).not.toContainEqual({ providerID: "missing", modelID: "gone" });
      expect(result.recent).toContainEqual({ providerID: "google", modelID: "gemini-pro" });
      expect(result.recent).not.toContainEqual({ providerID: "missing", modelID: "also-gone" });
    });
  });

  describe("getFavoriteModels", () => {
    it("returns only favorites from getModelSelectionLists", async () => {
      await setupMockModelFile({
        favorite: [{ providerID: "openai", modelID: "gpt-4o" }],
        recent: [{ providerID: "google", modelID: "gemini-pro" }],
      });

      const favorites = await getFavoriteModels();

      expect(favorites).toHaveLength(2); // 1 from file + 1 default
      expect(favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      expect(favorites).toContainEqual({ providerID: "opencode", modelID: "big-pickle" });
      // recent models should not be in favorites
      expect(favorites).not.toContainEqual({ providerID: "google", modelID: "gemini-pro" });
    });
  });

  describe("searchModels", () => {
    it("matches case-insensitive substrings sorted alphabetically", async () => {
      const results = await searchModels("GPT");

      expect(results).toEqual([
        { providerID: "openai", modelID: "gpt-3.5" },
        { providerID: "openai", modelID: "gpt-4o" },
      ]);
    });

    it("matches provider names", async () => {
      const results = await searchModels("anthropic");

      expect(results).toEqual([{ providerID: "anthropic", modelID: "claude-sonnet" }]);
    });

    it("returns an empty array for blank queries", async () => {
      expect(await searchModels("")).toEqual([]);
      expect(await searchModels("   ")).toEqual([]);
      expect(providersMock).not.toHaveBeenCalled();
    });

    it("returns an empty array when nothing matches", async () => {
      expect(await searchModels("no-such-model-xyz")).toEqual([]);
    });

    it("caps results at ten matches", async () => {
      providersMock.mockResolvedValueOnce({
        data: {
          providers: [
            {
              id: "zoo",
              models: Object.fromEntries(
                Array.from({ length: 12 }, (_, index) => [`model-${index}`, {}]),
              ),
            },
          ],
        },
        error: null,
      });

      const results = await searchModels("zoo");

      expect(results).toHaveLength(10);
    });

    it("returns an empty array when the catalog is unavailable", async () => {
      providersMock.mockResolvedValueOnce({ data: undefined, error: new Error("down") });

      expect(await searchModels("gpt")).toEqual([]);
    });

    it("does not cache an empty catalog as valid", async () => {
      providersMock.mockResolvedValueOnce({ data: { providers: [] }, error: null });
      expect(await searchModels("gpt")).toEqual([]);

      // A fresh fetch right after must work instead of serving poisoned emptiness.
      const results = await searchModels("gpt");

      expect(results).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("keeps the stale catalog when a refresh comes back empty", async () => {
      vi.useFakeTimers();
      try {
        expect(await searchModels("gpt")).not.toEqual([]);

        vi.advanceTimersByTime(11 * 60 * 1000);
        providersMock.mockResolvedValueOnce({ data: { providers: [] }, error: null });

        const results = await searchModels("gpt");

        expect(results).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
      } finally {
        vi.useRealTimers();
      }
    });

    it("falls back to in-order matches for transposed queries like gml", async () => {
      providersMock.mockResolvedValueOnce({
        data: {
          providers: [
            { id: "zai-org", models: { "GLM-4.6V-Flash": {}, "GLM-4.7": {} } },
            { id: "openai", models: { "gpt-4o": {} } },
          ],
        },
        error: null,
      });

      const results = await searchModels("gml");

      // "glm-4.6v-flash" contains g...m...l in order; "glm-4.7" has no l after m.
      expect(results).toContainEqual({ providerID: "zai-org", modelID: "GLM-4.6V-Flash" });
      expect(results).not.toContainEqual({ providerID: "zai-org", modelID: "GLM-4.7" });
      expect(results).not.toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("prefers substring matches before fuzzy ones", async () => {
      providersMock.mockResolvedValueOnce({
        data: {
          providers: [
            { id: "openai", models: { "gpt-4o": {} } },
            { id: "zoo", models: { "xylophone-gpt": {} } },
          ],
        },
        error: null,
      });

      const results = await searchModels("gpt");

      expect(results[0]).toEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("ranks model-id prefix matches first", async () => {
      providersMock.mockResolvedValueOnce({
        data: {
          providers: [
            { id: "zoo", models: { "auto-glm-phone": {} } },
            { id: "opencode", models: { "glm-5.3-flash-free": {} } },
          ],
        },
        error: null,
      });

      const results = await searchModels("glm");

      expect(results[0]).toEqual({ providerID: "opencode", modelID: "glm-5.3-flash-free" });
    });

    it("boosts free-tier variants above paid ones", async () => {
      providersMock.mockResolvedValueOnce({
        data: {
          providers: [
            {
              id: "mix",
              models: { "zzz-flash": {}, "aaa-flash-free": {}, "mmm-flash": {} },
            },
          ],
        },
        error: null,
      });

      const results = await searchModels("flash");

      expect(results[0]).toEqual({ providerID: "mix", modelID: "aaa-flash-free" });
    });
  });

  describe("favorites persistence", () => {
    it("adds a favorite and reads it back", async () => {
      await setupMockModelFile({ favorite: [], recent: [] });

      expect(await addFavoriteModel({ providerID: "openai", modelID: "gpt-4o" })).toBe(true);

      const favorites = await getFavoriteModels();
      expect(favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("does not duplicate an existing favorite", async () => {
      await setupMockModelFile({ favorite: [{ providerID: "openai", modelID: "gpt-4o" }] });

      expect(await addFavoriteModel({ providerID: "openai", modelID: "gpt-4o" })).toBe(false);

      const favorites = await getFavoriteModels();
      expect(favorites.filter((m) => m.modelID === "gpt-4o")).toHaveLength(1);
    });

    it("removes a favorite", async () => {
      await setupMockModelFile({
        favorite: [
          { providerID: "openai", modelID: "gpt-4o" },
          { providerID: "anthropic", modelID: "claude-sonnet" },
        ],
      });

      expect(await removeFavoriteModel("openai", "gpt-4o")).toBe(true);

      const favorites = await getFavoriteModels();
      expect(favorites).toContainEqual({
        providerID: "anthropic",
        modelID: "claude-sonnet",
      });
      expect(favorites).not.toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("returns false when removing a missing favorite", async () => {
      await setupMockModelFile({ favorite: [] });

      expect(await removeFavoriteModel("openai", "gpt-9")).toBe(false);
    });

    it("creates the state file when none exists", async () => {
      tempDir = await mkdtemp(path.join(os.tmpdir(), "opencode-model-test-"));
      process.env.XDG_STATE_HOME = tempDir;

      expect(await addFavoriteModel({ providerID: "openai", modelID: "gpt-4o" })).toBe(true);

      const favorites = await getFavoriteModels();
      expect(favorites).toContainEqual({ providerID: "openai", modelID: "gpt-4o" });
    });

    it("rejects invalid models", async () => {
      await setupMockModelFile({ favorite: [] });

      expect(await addFavoriteModel({ providerID: "", modelID: "x" })).toBe(false);
      expect(await addFavoriteModel({ providerID: "p", modelID: "" })).toBe(false);
    });
  });

  describe("getStoredModel", () => {
    it("defaults a missing variant on the returned copy", () => {
      const scopeKey = "model-stored-variant";
      __resetSettingsForTests();
      setCurrentModel({ providerID: "openai", modelID: "gpt-4o" }, scopeKey);

      const stored = getStoredModel(scopeKey);
      expect(stored.variant).toBe("default");

      // Mutating the copy must not leak back into the settings store.
      stored.variant = "mutated";
      expect(getStoredModel(scopeKey).variant).toBe("default");

      clearCurrentModel(scopeKey);
      __resetSettingsForTests();
    });
  });
});
