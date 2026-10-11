import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterProjectsWithExistingDirectories,
  projectDirectoryExists,
} from "../../src/project/directory.js";

describe("project/directory", () => {
  let tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  async function makeTempDir(): Promise<string> {
    const dir = await mkdtemp(path.join(os.tmpdir(), "project-dir-"));
    tempDirs.push(dir);
    return dir;
  }

  it("reports existing directories as present", async () => {
    const dir = await makeTempDir();

    await expect(projectDirectoryExists(dir)).resolves.toBe(true);
  });

  it("reports missing directories as gone", async () => {
    const dir = await makeTempDir();
    const gone = path.join(dir, "deleted-worktree");

    await expect(projectDirectoryExists(gone)).resolves.toBe(false);
  });

  it("filters gone worktrees out of picker lists preserving order", async () => {
    const keptA = await makeTempDir();
    const keptB = await makeTempDir();
    const gone = path.join(keptA, "gone");

    const projects = [
      { id: "a", worktree: keptA, name: "a" },
      { id: "gone", worktree: gone, name: "gone" },
      { id: "b", worktree: keptB, name: "b" },
    ];

    await expect(filterProjectsWithExistingDirectories(projects)).resolves.toEqual([
      { id: "a", worktree: keptA, name: "a" },
      { id: "b", worktree: keptB, name: "b" },
    ]);
  });
});
