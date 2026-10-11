import { access } from "node:fs/promises";
import type { ProjectInfo } from "../settings/manager.js";

/** Local directory check shared by prompt/command guards (the bot targets a local server). */
export async function projectDirectoryExists(directory: string): Promise<boolean> {
  try {
    await access(directory);
    return true;
  } catch {
    return false;
  }
}

/**
 * Drops projects whose worktree is gone from picker lists, preserving order.
 * Adapted from upstream OTB-131: instead of server-confirmed absence (V2-only),
 * the fork checks the local filesystem it shares with its OpenCode server.
 */
export async function filterProjectsWithExistingDirectories(
  projects: ProjectInfo[],
): Promise<ProjectInfo[]> {
  const checks = await Promise.all(
    projects.map(async (project) => projectDirectoryExists(project.worktree)),
  );
  return projects.filter((_, index) => checks[index]);
}
