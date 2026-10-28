import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  TOPIC_SESSION_STATUS,
  __resetSettingsForTests,
  __waitForSettingsWritesForTests,
  getScopeDisplayOverride,
  getTopicSessionBinding,
  setScopeDisplayOverride,
  setTopicSessionBinding,
  updateTopicSessionBindingStatus,
} from "../../src/settings/manager.js";
import { getRuntimePaths } from "../../src/runtime/paths.js";
import { setRuntimeMode } from "../../src/runtime/mode.js";
import type { TopicSessionBinding } from "../../src/settings/manager.js";

const BINDING_KEY = "-100:11";

function createBinding(): TopicSessionBinding {
  return {
    scopeKey: "-100:11",
    chatId: -100,
    threadId: 11,
    sessionId: "ses-1",
    projectId: "p1",
    status: TOPIC_SESSION_STATUS.ACTIVE,
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("settings/manager topic binding lifecycle", () => {
  beforeEach(() => {
    __resetSettingsForTests();
  });

  it("records closedAt for every terminal status, not just closed/stale", () => {
    setTopicSessionBinding(BINDING_KEY, createBinding());

    updateTopicSessionBindingStatus(BINDING_KEY, TOPIC_SESSION_STATUS.ABANDONED);
    expect(getTopicSessionBinding(BINDING_KEY)?.status).toBe("abandoned");
    expect(typeof getTopicSessionBinding(BINDING_KEY)?.closedAt).toBe("number");

    setTopicSessionBinding(BINDING_KEY, createBinding());
    updateTopicSessionBindingStatus(BINDING_KEY, TOPIC_SESSION_STATUS.ERROR);
    expect(typeof getTopicSessionBinding(BINDING_KEY)?.closedAt).toBe("number");
  });

  it("clears closedAt when a binding returns to active", () => {
    setTopicSessionBinding(BINDING_KEY, createBinding());

    updateTopicSessionBindingStatus(BINDING_KEY, TOPIC_SESSION_STATUS.CLOSED);
    expect(typeof getTopicSessionBinding(BINDING_KEY)?.closedAt).toBe("number");

    updateTopicSessionBindingStatus(BINDING_KEY, TOPIC_SESSION_STATUS.ACTIVE);
    expect(getTopicSessionBinding(BINDING_KEY)?.closedAt).toBeUndefined();
  });
});

describe("settings/manager scope display reads", () => {
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "opencode-telegram-binding-status-"));
    process.env.OPENCODE_TELEGRAM_HOME = tempHome;
    setRuntimeMode("installed");
    __resetSettingsForTests();
  });

  afterEach(async () => {
    await __waitForSettingsWritesForTests();
    __resetSettingsForTests();
    delete process.env.OPENCODE_TELEGRAM_HOME;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("reads without materializing empty scopes in settings.json", async () => {
    setScopeDisplayOverride("-100:11", "pc_mirror", true);

    expect(getScopeDisplayOverride("-100:11", "pc_mirror")).toBe(true);
    expect(getScopeDisplayOverride("-200:22", "pc_mirror")).toBeUndefined();

    await __waitForSettingsWritesForTests();
    const raw = await readFile(getRuntimePaths().settingsFilePath, "utf-8");
    const persisted = JSON.parse(raw) as {
      groups?: Record<string, { topics?: Record<string, unknown> }>;
    };

    expect(persisted.groups?.["-200"]).toBeUndefined();
    expect(persisted.groups?.["-100"]?.topics?.["11"]).toBeDefined();
  });
});
