import { opencodeClient } from "../opencode/client.js";
import { getProjects } from "../project/manager.js";
import { filterProjectsWithExistingDirectories } from "../project/directory.js";
import { logger } from "../utils/logger.js";
import type { ProjectInfo } from "../settings/manager.js";

export type RecentSessionStatus = "running" | "idle";

export interface RecentSessionEntry {
  id: string;
  title: string;
  directory: string;
  project: ProjectInfo;
  updatedAt: number;
  status: RecentSessionStatus;
}

/**
 * Recent root sessions across all projects with an existing local directory,
 * newest first. A failing project never fails the whole list (adapted from
 * upstream OTB-76; folder filtering uses the fork's local check instead of
 * the V2-only server confirmation, and statuses are running/idle only).
 */
export async function loadRecentSessions(limit: number): Promise<RecentSessionEntry[]> {
  const safeLimit = Math.max(1, limit);
  let projects: ProjectInfo[];
  try {
    projects = await filterProjectsWithExistingDirectories(await getProjects());
  } catch (error) {
    logger.error("[Recent] Failed to load projects:", error);
    throw error;
  }

  const perProject = await Promise.all(
    projects.map(async (project): Promise<RecentSessionEntry[]> => {
      try {
        const [listResult, statusResult] = await Promise.all([
          opencodeClient.session.list({
            directory: project.worktree,
            limit: safeLimit,
            roots: true,
          }),
          opencodeClient.session.status({ directory: project.worktree }),
        ]);

        if (listResult.error || !listResult.data) {
          logger.warn(
            `[Recent] Skipping ${project.worktree}: session list failed`,
            listResult.error,
          );
          return [];
        }

        const statuses = (
          statusResult.error || !statusResult.data
            ? {}
            : statusResult.data
        ) as Record<string, { type?: string }>;

        return listResult.data.map((session) => {
          const time = (session as { time?: { updated?: number; created?: number } }).time;
          return {
            id: session.id,
            title: session.title,
            directory: project.worktree,
            project,
            updatedAt: time?.updated ?? time?.created ?? 0,
            status: statuses[session.id]?.type === "busy" ? "running" : "idle",
          } satisfies RecentSessionEntry;
        });
      } catch (error) {
        logger.warn(`[Recent] Skipping ${project.worktree}:`, error);
        return [];
      }
    }),
  );

  return perProject
    .flat()
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, safeLimit);
}
