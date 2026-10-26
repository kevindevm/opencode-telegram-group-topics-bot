import { config } from "../config.js";
import { opencodeClient, probeOpencodeServer } from "../opencode/client.js";
import { processManager } from "./manager.js";
import { logger } from "../utils/logger.js";

const SERVER_READY_WAIT_MS = 15000;
const SERVER_READY_POLL_MS = 500;

async function waitForServerReady(maxWaitMs: number): Promise<boolean> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < maxWaitMs) {
    try {
      const { data, error } = await opencodeClient.global.health();
      if (!error && data?.healthy) {
        return true;
      }
    } catch {
      // Server not ready yet.
    }
    await new Promise((resolve) => setTimeout(resolve, SERVER_READY_POLL_MS));
  }
  return false;
}

/**
 * Startup guard: when the bot service boots, make sure the OpenCode server is
 * up. If the configured URL already answers (e.g. started from PC), it is
 * left alone as an external process. Otherwise the managed process is
 * spawned, so a reboot never leaves the bot without a server.
 */
export async function ensureOpencodeServerRunning(): Promise<void> {
  if (!config.opencode.autoStart) {
    logger.debug("[ProcessManager] Auto-start disabled (OPENCODE_AUTO_START=false)");
    return;
  }

  if (processManager.isRunning()) {
    logger.info("[ProcessManager] Managed OpenCode server already running");
    return;
  }

  try {
    const probe = await probeOpencodeServer(config.opencode.serverVersion);
    if (probe.kind === "found") {
      logger.info("[ProcessManager] OpenCode server already reachable, keeping external process");
      return;
    }
    if (probe.kind === "unauthorized") {
      logger.warn(
        "[ProcessManager] OpenCode server answered but credentials were rejected; not starting a managed server",
      );
      return;
    }
  } catch (error) {
    logger.debug("[ProcessManager] Startup server probe failed", error);
  }

  logger.info("[ProcessManager] No OpenCode server reachable, starting managed server...");
  const { success, error } = await processManager.start();
  if (!success) {
    logger.error(`[ProcessManager] Auto-start failed: ${error ?? "unknown error"}`);
    return;
  }

  const ready = await waitForServerReady(SERVER_READY_WAIT_MS);
  if (ready) {
    logger.info(
      `[ProcessManager] Managed OpenCode server ready (PID=${processManager.getPID() ?? "-"})`,
    );
  } else {
    logger.warn("[ProcessManager] Managed server started but not ready yet; will retry on demand");
  }
}
