import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeMode } from "../../src/runtime/mode.js";
import {
  __resetSettingsForTests,
  __waitForSettingsWritesForTests,
  getDailyCost,
  getDisplayOverrides,
  getPersistedQueuedPrompts,
  getScopeDisplayOverride,
  loadSettings,
  setPersistedQueuedPrompts,
} from "../../src/settings/manager.js";
import { listSavedPrompts } from "../../src/settings/manager.js";

describe("settings display/cost/saved persistence", () => {
  let tempHome: string;
  let settingsPath: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "opencode-telegram-settings-"));
    settingsPath = path.join(tempHome, "settings.json");
    process.env.OPENCODE_TELEGRAM_HOME = tempHome;
    setRuntimeMode("installed");
    __resetSettingsForTests();
  });

  afterEach(async () => {
    __resetSettingsForTests();
    delete process.env.OPENCODE_TELEGRAM_HOME;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("keeps display overrides, daily costs and saved prompts across reloads", async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({
        settingsVersion: 2,
        display: { thinking: false },
        costDaily: { "2026-10-22": 1.5 },
        savedPrompts: [{ name: "review", text: "do strict review" }],
        groups: {
          "-1001": {
            topics: {
              22: {
                session: { id: "ses-1", title: "S", directory: "/repo" },
                display: { toolCalls: false },
              },
            },
          },
        },
      }),
    );

    await loadSettings();

    expect(getDisplayOverrides()).toEqual({ thinking: false });
    expect(getDailyCost("2026-10-22")).toBe(1.5);
    expect(listSavedPrompts()).toEqual([{ name: "review", text: "do strict review" }]);
    expect(getScopeDisplayOverride("-1001:22", "toolCalls")).toBe(false);
    expect(getScopeDisplayOverride("-1001:22", "thinking")).toBeUndefined();
  });

  it("drops invalid display, cost and saved entries on load", async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({
        settingsVersion: 2,
        display: { thinking: "yes", ok: true },
        costDaily: { nope: 1.5, "2026-10-22": -2 },
        savedPrompts: [{ name: "", text: "x" }, { name: "ok", text: "y" }],
      }),
    );

    await loadSettings();

    expect(getDisplayOverrides()).toEqual({ ok: true });
    expect(getDailyCost("2026-10-22")).toBe(0);
    expect(listSavedPrompts()).toEqual([{ name: "ok", text: "y" }]);
  });

  it("keeps valid queued prompts and drops malformed ones on load", async () => {
    const valid = {
      queueId: "q1",
      sessionId: "ses-1",
      chatId: -1001,
      threadId: 22,
      responseMode: "text_only",
      promptOptions: {
        sessionID: "ses-1",
        directory: "/repo",
        parts: [{ type: "text", text: "hello" }],
      },
      promptErrorLogContext: {
        sessionId: "ses-1",
        directory: "/repo",
        agent: "build",
        modelProvider: "openai",
        modelId: "gpt-5",
        variant: "fast",
        promptLength: 5,
        fileCount: 0,
      },
    };

    await writeFile(
      settingsPath,
      JSON.stringify({
        settingsVersion: 2,
        queuedPrompts: {
          "ses-1": [valid, { nope: true }, { ...valid, sessionId: 42 }],
          "": [valid],
        },
      }),
    );

    await loadSettings();

    expect(getPersistedQueuedPrompts()).toEqual({ "ses-1": [valid] });
  });

  it("round-trips queued prompts through the setter", async () => {
    await loadSettings();

    const entry = {
      queueId: "q9",
      sessionId: "ses-9",
      chatId: -1001,
      threadId: null,
      responseMode: "text_and_tts",
      promptOptions: {
        sessionID: "ses-9",
        directory: "/repo",
        parts: [{ type: "text", text: "hi" }],
      },
      promptErrorLogContext: {
        sessionId: "ses-9",
        directory: "/repo",
        agent: "build",
        modelProvider: "p",
        modelId: "m",
        variant: "default",
        promptLength: 2,
        fileCount: 0,
      },
    };

    setPersistedQueuedPrompts({ "ses-9": [entry] });
    await __waitForSettingsWritesForTests();

    expect(getPersistedQueuedPrompts()).toEqual({ "ses-9": [entry] });
  });
});
