import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRuntimeMode } from "../../src/runtime/mode.js";
import {
  __resetSettingsForTests,
  flushSettingsWrites,
  getCurrentProject,
  loadSettings,
  setCurrentProject,
} from "../../src/settings/manager.js";

describe("settings backup and restore", () => {
  let tempHome: string;
  let settingsPath: string;
  let backupPath: string;
  let backup1Path: string;

  beforeEach(async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), "opencode-telegram-settings-"));
    settingsPath = path.join(tempHome, "settings.json");
    backupPath = `${settingsPath}.bak`;
    backup1Path = `${settingsPath}.bak-1`;
    process.env.OPENCODE_TELEGRAM_HOME = tempHome;
    setRuntimeMode("installed");
    __resetSettingsForTests();
  });

  afterEach(async () => {
    __resetSettingsForTests();
    delete process.env.OPENCODE_TELEGRAM_HOME;
    await rm(tempHome, { recursive: true, force: true });
  });

  it("rotates the last two good states on every verified write", async () => {
    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-100:1");
    await flushSettingsWrites();
    expect(JSON.parse(await readFile(backupPath, "utf-8"))).toMatchObject({
      groups: { "-100": { general: { project: { id: "p1" } } } },
    });

    setCurrentProject({ id: "p2", worktree: "/repo/b" }, "chat:-100:1");
    await flushSettingsWrites();

    // Newest backup holds the latest state, older generation the previous one.
    expect(JSON.parse(await readFile(backupPath, "utf-8"))).toMatchObject({
      groups: { "-100": { general: { project: { id: "p2" } } } },
    });
    expect(JSON.parse(await readFile(backup1Path, "utf-8"))).toMatchObject({
      groups: { "-100": { general: { project: { id: "p1" } } } },
    });
  });

  it("restores the newest usable backup instead of starting empty", async () => {
    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-100:1");
    await flushSettingsWrites();

    await writeFile(settingsPath, '{"groups": {"-100": BROKEN', "utf-8");

    await loadSettings();

    expect(getCurrentProject("chat:-100:1")).toMatchObject({ id: "p1" });
    // Healed on disk too, so the next boot is clean without mutations.
    expect(JSON.parse(await readFile(settingsPath, "utf-8"))).toMatchObject({
      groups: { "-100": { general: { project: { id: "p1" } } } },
    });
  });

  it("falls back to the older generation when the newest backup is also corrupt", async () => {
    setCurrentProject({ id: "p1", worktree: "/repo/a" }, "chat:-100:1");
    await flushSettingsWrites();
    setCurrentProject({ id: "p2", worktree: "/repo/b" }, "chat:-100:1");
    await flushSettingsWrites();

    await writeFile(settingsPath, '{"groups": {"-100": BROKEN', "utf-8");
    await writeFile(backupPath, "not json at all", "utf-8");

    await loadSettings();

    // .bak is garbage, .bak-1 still holds the first state.
    expect(getCurrentProject("chat:-100:1")).toMatchObject({ id: "p1" });
  });

  it("starts empty only when main and all backups are unusable", async () => {
    await writeFile(settingsPath, '{"groups": {"-100": BROKEN', "utf-8");

    await loadSettings();

    const files = await readdir(tempHome);
    expect(files.some((file) => file.startsWith("settings.json.corrupt-"))).toBe(true);
    expect(getCurrentProject("chat:-100:1")).toBeUndefined();
  });
});
