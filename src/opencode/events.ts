import { Event } from "@opencode-ai/sdk/v2";
import { opencodeClient } from "./client.js";
import { logger } from "../utils/logger.js";

type EventCallback = (event: Event) => void | Promise<void>;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;
const FATAL_NO_STREAM_ERROR = "No stream returned from event subscription";

interface SharedStreamState {
  abortController: AbortController;
  loopPromise: Promise<void> | null;
  directory: string;
}

/**
 * Per-directory callback registry. The registry is scoped so listeners can be
 * removed per directory, but the underlying SSE stream is always shared: the
 * server fans every event out to every connection, so one loop dispatches
 * each event exactly once. (One worker per directory used to open one stream
 * each, processing every event N times.)
 */
const callbacksByDirectory = new Map<string, Set<EventCallback>>();
let sharedStream: SharedStreamState | null = null;

function getReconnectDelayMs(attempt: number): number {
  const exponentialDelay = RECONNECT_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(exponentialDelay, RECONNECT_MAX_DELAY_MS);
}

function waitWithAbort(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve(false);
    };

    const timeoutId = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function allCallbacks(): EventCallback[] {
  const seen = new Set<EventCallback>();

  for (const callbacks of callbacksByDirectory.values()) {
    for (const callback of callbacks) {
      seen.add(callback);
    }
  }

  return [...seen];
}

function hasCallbacks(): boolean {
  for (const callbacks of callbacksByDirectory.values()) {
    if (callbacks.size > 0) {
      return true;
    }
  }

  return false;
}

async function dispatchEvent(event: Event): Promise<void> {
  for (const callback of allCallbacks()) {
    try {
      await callback(event);
    } catch (error) {
      logger.error("[Events] Event callback failed", { eventType: event.type }, error);
    }
  }
}

async function runSharedLoop(state: SharedStreamState): Promise<void> {
  const { abortController } = state;
  let reconnectAttempt = 0;

  // The generation guard (sharedStream === state) handles the stop/start
  // race: maybeStopSharedLoop aborts and drops the reference, but the old
  // for-await may still be draining if the SDK ignores the signal. A
  // superseded loop must not dispatch — otherwise two loops deliver every
  // event twice until the old one notices the abort.
  const isCurrent = (): boolean => sharedStream === state;

  while (!abortController.signal.aborted && hasCallbacks() && isCurrent()) {
    try {
      const result = await opencodeClient.event.subscribe(
        { directory: state.directory },
        { signal: abortController.signal },
      );

      if (!result.stream) {
        throw new Error(FATAL_NO_STREAM_ERROR);
      }

      reconnectAttempt = 0;

      for await (const event of result.stream) {
        if (abortController.signal.aborted || !hasCallbacks() || !isCurrent()) {
          break;
        }

        await new Promise<void>((resolve) => setImmediate(resolve));
        if (!isCurrent()) {
          break;
        }
        await dispatchEvent(event);
      }

      if (abortController.signal.aborted || !hasCallbacks() || !isCurrent()) {
        break;
      }

      reconnectAttempt++;
      const reconnectDelay = getReconnectDelayMs(reconnectAttempt);
      logger.warn(`[Events] Stream ended, reconnecting`, {
        directory: state.directory,
        reconnectAttempt,
        reconnectDelay,
      });

      const shouldContinue = await waitWithAbort(reconnectDelay, abortController.signal);
      if (!shouldContinue) {
        break;
      }
    } catch (error) {
      if (abortController.signal.aborted || !hasCallbacks()) {
        break;
      }

      if (error instanceof Error && error.message === FATAL_NO_STREAM_ERROR) {
        logger.error("[Events] Fatal event stream error", { directory: state.directory }, error);
        break;
      }

      reconnectAttempt++;
      const reconnectDelay = getReconnectDelayMs(reconnectAttempt);
      logger.error(
        `[Events] Stream failed, reconnecting`,
        { directory: state.directory, reconnectAttempt, reconnectDelay },
        error,
      );

      const shouldContinue = await waitWithAbort(reconnectDelay, abortController.signal);
      if (!shouldContinue) {
        break;
      }
    }
  }
}

function ensureSharedLoop(directory: string): void {
  if (sharedStream?.loopPromise) {
    return;
  }

  const state: SharedStreamState = {
    abortController: new AbortController(),
    loopPromise: null,
    directory,
  };
  sharedStream = state;
  state.loopPromise = runSharedLoop(state)
    .catch((error) => {
      logger.error("[Events] Shared stream loop failed unexpectedly", { directory }, error);
    })
    .finally(() => {
      if (sharedStream === state) {
        sharedStream = null;
      }
    });
}

function maybeStopSharedLoop(): void {
  if (hasCallbacks()) {
    return;
  }

  if (sharedStream) {
    sharedStream.abortController.abort();
    sharedStream = null;
  }
}

/**
 * The `directory` is bookkeeping for logs/reconnects (the server fans out
 * globally). When the worker that created the loop goes away but others
 * remain, re-point it so diagnostics don't blame a dead directory.
 */
function repointSharedLoopDirectory(): void {
  if (!sharedStream || !hasCallbacks()) {
    return;
  }

  const current = callbacksByDirectory.get(sharedStream.directory);
  if (current && current.size > 0) {
    return;
  }

  for (const [directory, callbacks] of callbacksByDirectory) {
    if (callbacks.size > 0) {
      sharedStream.directory = directory;
      return;
    }
  }
}

export async function subscribeToEvents(directory: string, callback: EventCallback): Promise<void> {
  let callbacks = callbacksByDirectory.get(directory);
  if (!callbacks) {
    callbacks = new Set<EventCallback>();
    callbacksByDirectory.set(directory, callbacks);
  }

  callbacks.add(callback);
  ensureSharedLoop(directory);
}

export function unsubscribeFromEvents(directory: string, callback: EventCallback): void {
  const callbacks = callbacksByDirectory.get(directory);
  if (callbacks) {
    callbacks.delete(callback);
    // Drop the empty registry entry so project switches cannot accumulate
    // dead directory keys for the life of the process.
    if (callbacks.size === 0) {
      callbacksByDirectory.delete(directory);
    }
  }
  repointSharedLoopDirectory();
  maybeStopSharedLoop();
}

export function stopEventListening(directory?: string): void {
  if (directory) {
    callbacksByDirectory.delete(directory);
    logger.info("[Events] Stopped event listener", { directory });
    repointSharedLoopDirectory();
    maybeStopSharedLoop();
    return;
  }

  callbacksByDirectory.clear();
  maybeStopSharedLoop();
  logger.info("[Events] Stopped all event listeners");
}
