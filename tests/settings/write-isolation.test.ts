import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setRuntimeMode } from "../../src/runtime/mode.js";
import {
  __resetSettingsForTests,
  flushSettingsWrites,
  getCurrentProject,
  loadSettings,
  setCurrentProject,
} from "../../src/settings/manager.js";

describe("settings write isolation", () => {
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

  it("writes to the home captured at enqueue time, even if env changes after", async () => {
    setCurrentProject({ id: "proj-1", worktree: "/repo/a" }, "chat:-100:1");

    // Simulate the afterEach race: env deleted while the write is queued.
    delete process.env.OPENCODE_TELEGRAM_HOME;
    await flushSettingsWrites();

    const content = await readFile(settingsPath, "utf-8");
    expect(JSON.parse(content).groups["-100"].general.project.id).toBe("proj-1");
  });

  it("backs up a corrupt settings file instead of silently resetting", async () => {
    const garbage = '{"groups": {"-100": BROKEN';
    await writeFile(settingsPath, garbage, "utf-8");

    await loadSettings();

    const files = await readdir(tempHome);
    const backup = files.find(
      (file) => file.startsWith("settings.json.corrupt-"),
    );
    expect(backup).toBeDefined();
    expect(await readFile(path.join(tempHome, backup!), "utf-8")).toBe(garbage);
    expect(getCurrentProject("chat:-100:1")).toBeUndefined();
  });
});
