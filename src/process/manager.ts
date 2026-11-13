import { spawn, exec, type ChildProcess } from "child_process";
import { promisify } from "util";
import { getServerProcess, setServerProcess, clearServerProcess } from "../settings/manager.js";
import { config } from "../config.js";
import { opencodeClient } from "../opencode/client.js";
import { logger } from "../utils/logger.js";
import type { ProcessState, ProcessOperationResult, ProcessManagerInterface } from "./types.js";

const execAsync = promisify(exec);

/** How long to wait for the background service to answer health after start. */
const SERVICE_READY_WAIT_MS = 15000;
const SERVICE_READY_POLL_MS = 500;

/**
 * Singleton manager for OpenCode server process
 * Handles starting, stopping, and monitoring the server process
 * Persists PID to settings.json for recovery after bot restart
 */
class ProcessManager implements ProcessManagerInterface {
  private state: ProcessState = {
    process: null,
    pid: null,
    startTime: null,
    isRunning: false,
    viaService: false,
  };

  /**
   * Initialize the manager by restoring state from settings
   * Checks if the stored process is still alive
   */
  async initialize(): Promise<void> {
    const savedProcess = getServerProcess();

    if (!savedProcess) {
      logger.debug("[ProcessManager] No saved process found in settings");
      return;
    }

    if (savedProcess.viaService === true) {
      // No PID to check: the v2 background service owns its process.
      // Verify it answers health, otherwise drop it so auto-start relaunches.
      try {
        const { data, error } = await opencodeClient.global.health();
        if (!error && data?.healthy) {
          logger.info("[ProcessManager] Restored managed background service (v2)");
          // Re-anchor the clock: the saved stamp predates external restarts
          // (service restarts, reboots) that never update settings, so a
          // stale stamp would report an impossible uptime. From here uptime
          // means continuously healthy under this bot session.
          const restoredAt = new Date();
          this.state = {
            process: null,
            pid: null,
            startTime: restoredAt,
            isRunning: true,
            viaService: true,
          };
          setServerProcess({
            pid: null,
            startTime: restoredAt.toISOString(),
            viaService: true,
          });
          return;
        }
      } catch {
        // Unreachable: fall through to cleanup below.
      }
      logger.warn("[ProcessManager] Managed background service is unreachable, cleaning up");
      clearServerProcess();
      return;
    }

    if (savedProcess.pid === null) {
      logger.warn("[ProcessManager] Saved process has no PID, cleaning up");
      clearServerProcess();
      return;
    }

    logger.info(`[ProcessManager] Found saved process: PID=${savedProcess.pid}`);

    // Check if the process is still alive
    if (this.isProcessAlive(savedProcess.pid)) {
      logger.info(
        `[ProcessManager] Process PID=${savedProcess.pid} is still alive, restoring state`,
      );

      this.state = {
        process: null, // Cannot recover ChildProcess reference
        pid: savedProcess.pid,
        startTime: new Date(savedProcess.startTime),
        isRunning: true,
        viaService: false,
      };
    } else {
      logger.warn(`[ProcessManager] Process PID=${savedProcess.pid} is dead, cleaning up`);
      clearServerProcess();
    }
  }

  private transitionInProgress: Promise<ProcessOperationResult> | null = null;

  /**
   * Single health probe: true when the server answers with the configured
   * credentials, false on any failure. Never throws.
   */
  private async isServerReachable(): Promise<boolean> {
    try {
      const { data, error } = await opencodeClient.global.health();
      return !error && !!data?.healthy;
    } catch {
      return false;
    }
  }

  /**
   * Start the OpenCode server process
   */
  async start(): Promise<ProcessOperationResult> {
    if (this.transitionInProgress) {
      logger.warn("[ProcessManager] Start requested while a transition is in progress; joining it");
      return this.transitionInProgress;
    }

    if (this.state.isRunning) {
      // State can go stale (server killed externally, reboot): confirm it
      // still answers before refusing, or a dead server blocks every start.
      if (await this.isServerReachable()) {
        return {
          success: false,
          error: "Process already running",
        };
      }
      logger.warn("[ProcessManager] Managed server is unreachable, dropping stale state and starting");
      this.cleanup();
    }

    this.transitionInProgress = this.doStart();
    try {
      return await this.transitionInProgress;
    } finally {
      this.transitionInProgress = null;
    }
  }

  private async doStart(): Promise<ProcessOperationResult> {
    // V2 boots through the background service, ensured via `opencode pair`:
    // a bare `opencode serve` binds a random port with a random password,
    // so the bot could never reach it at the configured URL.
    if (config.opencode.serverVersion === "v2") {
      return this.startViaService();
    }
    try {
      logger.info("[ProcessManager] Starting OpenCode server process (v1 `serve`)...");

      const isWindows = process.platform === "win32";
      const command = isWindows ? "cmd.exe" : "opencode";
      const args = isWindows ? ["/c", "opencode", "serve"] : ["serve"];

      // Spawn the process
      // Windows: use cmd.exe to resolve npm-installed global commands
      // Unix-like: run opencode directly
      const childProcess = spawn(command, args, {
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: isWindows,
      });

      if (!childProcess.pid) {
        throw new Error(
          "Failed to start OpenCode server process. Ensure 'opencode' is installed and available in PATH.",
        );
      }

      // Setup event handlers
      childProcess.on("error", (err) => {
        logger.error("[ProcessManager] Process error:", err);
        this.cleanup();
      });

      childProcess.on("exit", (code, signal) => {
        logger.info(`[ProcessManager] Process exited: code=${code}, signal=${signal}`);
        this.cleanup();
      });

      // Log stdout/stderr
      if (childProcess.stdout) {
        childProcess.stdout.on("data", (data) => {
          logger.debug(`[OpenCode Server] ${data.toString().trim()}`);
        });
      }

      if (childProcess.stderr) {
        childProcess.stderr.on("data", (data) => {
          logger.warn(`[OpenCode Server Error] ${data.toString().trim()}`);
        });
      }

      // Save state in memory
      const startTime = new Date();
      this.state = {
        process: childProcess,
        pid: childProcess.pid,
        startTime,
        isRunning: true,
        viaService: false,
      };

      // Persist to settings.json
      setServerProcess({
        pid: childProcess.pid,
        startTime: startTime.toISOString(),
        viaService: false,
      });

      logger.info(`[ProcessManager] OpenCode server started with PID=${childProcess.pid}`);

      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[ProcessManager] Failed to start process:", err);
      this.cleanup();
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Bring the v2 background service up via `opencode pair` and wait until
   * it answers health at the configured URL. Pair ensures a server is
   * running to mint its one-time link, so this also covers a cold boot.
   * The service owns its process (stable port from its own config), so
   * there is no child PID to track — `service stop` tears it down.
   */
  private async startViaService(): Promise<ProcessOperationResult> {
    try {
      logger.info("[ProcessManager] Ensuring OpenCode background service via pair (v2)...");
      // exec runs through the shell, which resolves npm-installed shims
      // on both Windows (cmd.exe) and Unix-like systems.
      // NOTE: pair prints a one-time auth link; never log stdout.
      const { stderr } = await execAsync("opencode pair", {
        timeout: 30_000,
      });
      const errOutput = `${stderr ?? ""}`.trim();
      if (errOutput) {
        logger.debug(`[ProcessManager] pair stderr: ${errOutput}`);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[ProcessManager] Failed to start background service:", err);
      this.cleanup();
      return { success: false, error: errorMessage };
    }

    if (!(await this.waitForHealthy(SERVICE_READY_WAIT_MS))) {
      logger.error("[ProcessManager] Background service did not become healthy in time");
      this.cleanup();
      return { success: false, error: "Background service did not become healthy in time" };
    }

    const startTime = new Date();
    this.state = {
      process: null,
      pid: null,
      startTime,
      isRunning: true,
      viaService: true,
    };
    setServerProcess({
      pid: null,
      startTime: startTime.toISOString(),
      viaService: true,
    });

    logger.info("[ProcessManager] OpenCode background service is healthy");
    return { success: true };
  }

  private async waitForHealthy(timeoutMs: number): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      try {
        const { data, error } = await opencodeClient.global.health();
        if (!error && data?.healthy) {
          return true;
        }
      } catch {
        // Not ready yet.
      }
      await new Promise((resolve) => setTimeout(resolve, SERVICE_READY_POLL_MS));
    }
    return false;
  }

  /**
   * Stop the OpenCode server process
   * Sends SIGINT (Ctrl+C) and waits for graceful shutdown
   * Falls back to SIGKILL if timeout is exceeded
   */
  async stop(timeoutMs: number = 5000): Promise<ProcessOperationResult> {
    if (this.transitionInProgress) {
      logger.warn("[ProcessManager] Stop requested while a transition is in progress; joining it");
      const inProgress = await this.transitionInProgress;
      if (!inProgress.success || !this.state.isRunning) {
        return inProgress;
      }
    }

    if (!this.state.isRunning) {
      return {
        success: false,
        error: "Process not running",
      };
    }

    if (this.state.viaService) {
      this.transitionInProgress = this.doStopService();
      try {
        return await this.transitionInProgress;
      } finally {
        this.transitionInProgress = null;
      }
    }

    const pid = this.state.pid;
    if (pid === null) {
      return {
        success: false,
        error: "Process not running",
      };
    }
    this.transitionInProgress = this.doStop(timeoutMs, pid);
    try {
      return await this.transitionInProgress;
    } finally {
      this.transitionInProgress = null;
    }
  }

  private async doStopService(): Promise<ProcessOperationResult> {
    try {
      logger.info("[ProcessManager] Stopping OpenCode background service (v2)...");
      await execAsync("opencode service stop", { timeout: 30_000 });
      this.cleanup();
      logger.info("[ProcessManager] OpenCode background service stopped");
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[ProcessManager] Failed to stop background service:", err);
      return { success: false, error: errorMessage };
    }
  }

  private async doStop(timeoutMs: number, pid: number): Promise<ProcessOperationResult> {
    try {
      logger.info(`[ProcessManager] Stopping process PID=${pid}...`);

      // On Windows, use taskkill to kill the entire process tree
      // This is necessary because cmd.exe spawns child processes
      if (process.platform === "win32") {
        try {
          // /F = force terminate, /T = terminate tree, /PID = process id
          logger.debug(`[ProcessManager] Using taskkill to terminate process tree for PID=${pid}`);
          await execAsync(`taskkill /F /T /PID ${pid}`, { timeout: 10_000 });
          logger.info(`[ProcessManager] Process tree terminated successfully for PID=${pid}`);
        } catch (err) {
          // taskkill returns error if process not found, which is ok
          const error = err as Error & { code?: number };
          if (error.message?.includes("not found")) {
            logger.debug(`[ProcessManager] Process PID=${pid} already terminated`);
          } else {
            logger.warn(`[ProcessManager] taskkill error for PID=${pid}:`, err);
          }
        }

        // taskkill succeeding does not mean the tree is gone: verify before
        // reporting success, or a surviving server keeps its port while the
        // state claims it is stopped (zombie that breaks the next start).
        let stopped: boolean;
        if (this.state.process) {
          stopped = await this.waitForProcessExit(this.state.process, timeoutMs);
        } else {
          // No ChildProcess reference (recovered from settings)
          await new Promise((resolve) => setTimeout(resolve, 1000));
          stopped = !this.isProcessAlive(pid);
        }

        if (!stopped && this.isProcessAlive(pid)) {
          logger.error(`[ProcessManager] Process PID=${pid} survived taskkill, still running`);
          return { success: false, error: `Process PID=${pid} did not exit` };
        }
      } else {
        // Unix-like systems: use SIGINT/SIGKILL
        if (this.state.process) {
          const childProcess = this.state.process;

          // Send SIGINT (Ctrl+C)
          logger.debug(`[ProcessManager] Sending SIGINT to PID=${pid}`);
          childProcess.kill("SIGINT");

          // Wait for graceful shutdown
          const gracefulExit = await this.waitForProcessExit(childProcess, timeoutMs);

          if (!gracefulExit && this.state.isRunning) {
            logger.warn(`[ProcessManager] Graceful shutdown failed, sending SIGKILL to PID=${pid}`);
            childProcess.kill("SIGKILL");
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        } else {
          // No ChildProcess reference (recovered from settings)
          logger.debug(`[ProcessManager] Sending SIGTERM to PID=${pid}`);
          try {
            process.kill(pid, "SIGTERM");
          } catch (err) {
            logger.debug(`[ProcessManager] Failed to send SIGTERM to PID=${pid}:`, err);
          }

          // Wait for process to die
          await new Promise((resolve) => setTimeout(resolve, timeoutMs));

          // Check if still alive
          if (this.isProcessAlive(pid)) {
            logger.warn(`[ProcessManager] Graceful shutdown failed, sending SIGKILL to PID=${pid}`);
            try {
              process.kill(pid, "SIGKILL");
            } catch (err) {
              logger.error(`[ProcessManager] Failed to send SIGKILL to PID=${pid}:`, err);
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      }

      this.cleanup();
      logger.info(`[ProcessManager] Process PID=${pid} stopped successfully`);
      return { success: true };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error("[ProcessManager] Failed to stop process:", err);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if the process is running
   * Validates that the process with stored PID is actually alive
   */
  isRunning(): boolean {
    if (!this.state.isRunning) {
      return false;
    }

    // The background service owns its process: nothing PID-checkable here.
    // Liveness was verified at start/restore; the stop path tears it down.
    if (this.state.viaService) {
      return true;
    }

    if (!this.state.pid) {
      return false;
    }

    // Verify that the process is actually alive
    if (!this.isProcessAlive(this.state.pid)) {
      logger.warn(`[ProcessManager] Process PID=${this.state.pid} appears dead, cleaning up`);
      this.cleanup();
      return false;
    }

    return true;
  }

  /**
   * Get the process ID of the running server
   */
  getPID(): number | null {
    return this.state.pid;
  }

  /**
   * Get the uptime of the server in milliseconds
   */
  getUptime(): number | null {
    if (!this.state.startTime || !this.state.isRunning) {
      return null;
    }
    return Date.now() - this.state.startTime.getTime();
  }

  /**
   * Check if a process with given PID is alive
   * Uses process.kill(pid, 0) which checks existence without killing
   */
  private isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for process to exit
   */
  private async waitForProcessExit(
    childProcess: ChildProcess,
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const exitHandler = () => {
        logger.debug("[ProcessManager] Process exited gracefully");
        clearTimeout(timer);
        resolve(true);
      };

      childProcess.once("exit", exitHandler);

      const timer = setTimeout(() => {
        childProcess.removeListener("exit", exitHandler);
        resolve(false);
      }, timeoutMs);
      timer.unref?.();
    });
  }

  /**
   * Clean up state and settings
   */
  private cleanup(): void {
    const childProcess = this.state.process;
    if (childProcess) {
      childProcess.removeAllListeners("error");
      childProcess.removeAllListeners("exit");
      childProcess.stdout?.removeAllListeners("data");
      childProcess.stderr?.removeAllListeners("data");
      childProcess.unref?.();
    }
    this.state = {
      process: null,
      pid: null,
      startTime: null,
      isRunning: false,
      viaService: false,
    };
    clearServerProcess();
  }
}

// Export singleton instance
export const processManager = new ProcessManager();
