import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeMode } from "../../src/runtime/mode.js";
import {
  forgetBinding,
  loadBindingBackup,
  snapshotBinding,
} from "../../src/topic/binding-backup.js";
import type { TopicSessionBinding } from "../../src/settings/manager.js";

function makeBinding(overrides: Partial<TopicSessionBinding> = {}): TopicSessionBinding {
  return {
    scopeKey: "-100:11",
    chatId: -100,
    threadId: 11,
    sessionId: "ses-1",
    projectId: "p1",
    topicName: "demo",
    status: "active",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("topic/binding-backup", () => {
  let tempHome: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "opencode-telegram-bindings-"));
    process.env.OPENCODE_TELEGRAM_HOME = tempHome;
    setRuntimeMode("installed");
  });

  afterEach(async () => {
    delete process.env.OPENCODE_TELEGRAM_HOME;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("snapshots and reloads a binding", () => {
    snapshotBinding(makeBinding());

    expect(loadBindingBackup()).toMatchObject([{ sessionId: "ses-1", topicName: "demo" }]);
  });

  it("refreshes a binding and forgets it by scope", () => {
    snapshotBinding(makeBinding());
    snapshotBinding(makeBinding({ topicName: "renamed", updatedAt: 2 }));

    expect(loadBindingBackup()).toMatchObject([{ topicName: "renamed" }]);

    forgetBinding("-100:11");

    expect(loadBindingBackup()).toEqual([]);
  });

  it("skips ephemeral bindings and corrupt files", async () => {
    snapshotBinding(makeBinding({ scopeKey: "-100:99", threadId: 99, ephemeral: true }));

    expect(loadBindingBackup()).toEqual([]);

    snapshotBinding(makeBinding());
    await writeFile(path.join(tempHome, "topic-bindings.backup.json"), "not json", "utf-8");

    expect(loadBindingBackup()).toEqual([]);
  });

  it("ignores a version mismatch instead of crashing", async () => {
    await writeFile(
      path.join(tempHome, "topic-bindings.backup.json"),
      JSON.stringify({ version: 999, bindings: {} }),
      "utf-8",
    );

    expect(loadBindingBackup()).toEqual([]);
  });

  it("keeps the latest snapshot readable as JSON", async () => {
    snapshotBinding(makeBinding());

    const raw = await readFile(path.join(tempHome, "topic-bindings.backup.json"), "utf-8");
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
      bindings: { "-100:11": { sessionId: "ses-1" } },
    });
  });
});
