import { logger } from "../utils/logger.js";

const PROCESS_EVENT = {
  UNHANDLED_REJECTION: "unhandledRejection",
  UNCAUGHT_EXCEPTION: "uncaughtException",
} as const;

let installed = false;

export function installProcessErrorHandlers(): void {
  if (installed) {
    return;
  }

  installed = true;

  process.on(PROCESS_EVENT.UNHANDLED_REJECTION, (reason: unknown) => {
    logger.error("[Runtime] Unhandled promise rejection", {
      reason,
    });
    // Same policy as uncaught exceptions: an unhandled rejection means an
    // unknown subset of work was silently dropped. Crash so the service
    // manager (NSSM/systemd/Docker) restarts from clean state instead of
    // serving with lost messages, queues, or corrupted in-memory state.
    logger.error("[Runtime] Exiting due to unhandled rejection; awaiting restart");
    process.exit(1);
  });

  process.on(PROCESS_EVENT.UNCAUGHT_EXCEPTION, (error: Error) => {
    logger.error("[Runtime] Uncaught exception", {
      name: error.name,
      message: error.message,
      stack: error.stack,
    });
    // An uncaught exception leaves unknown corrupted state behind. Crash so
    // the service manager (NSSM/systemd/Docker) restarts from clean state
    // instead of serving with a broken runtime.
    logger.error("[Runtime] Exiting due to uncaught exception; awaiting restart");
    process.exit(1);
  });
}
