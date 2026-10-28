import { afterEach, describe, expect, it, vi } from "vitest";
import type { Event } from "@opencode-ai/sdk/v2";

const { subscribeMock } = vi.hoisted(() => ({
  subscribeMock: vi.fn(),
}));

vi.mock("../../src/opencode/client.js", () => ({
  opencodeClient: {
    event: {
      subscribe: subscribeMock,
    },
  },
}));

import {
  getReconnectDelayMs,
  stopEventListening,
  subscribeToEvents,
  unsubscribeFromEvents,
} from "../../src/opencode/events.js";

function createStream(events: Event[]): AsyncGenerator<Event, void, unknown> {
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

function createAbortableStream(signal: AbortSignal): AsyncGenerator<Event, void, unknown> {
  return (async function* () {
    while (!signal.aborted) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  })();
}

function createControllableStream() {
  const queue: Event[] = [];
  let wake: (() => void) | null = null;
  return {
    push(event: Event): void {
      queue.push(event);
      wake?.();
      wake = null;
    },
    stream(signal: AbortSignal): AsyncGenerator<Event, void, unknown> {
      return (async function* () {
        while (!signal.aborted) {
          const next = queue.shift();
          if (next) {
            yield next;
            continue;
          }
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }
      })();
    },
  };
}

describe("opencode/events", () => {
  afterEach(() => {
    stopEventListening();
    subscribeMock.mockReset();
  });

  it("subscribes once per directory and forwards events", async () => {
    const eventA = {
      type: "session.status",
      properties: { sessionID: "s1", status: { type: "busy" } },
    } as unknown as Event;
    const eventB = {
      type: "session.idle",
      properties: { sessionID: "s1" },
    } as unknown as Event;
    subscribeMock.mockResolvedValueOnce({ stream: createStream([eventA, eventB]) });

    const callback = vi.fn();
    await subscribeToEvents("/repo/a", callback);

    await vi.waitFor(() => {
      expect(callback).toHaveBeenCalledTimes(2);
    });

    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock).toHaveBeenCalledWith(
      { directory: "/repo/a" },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("does not start duplicate stream for same directory", async () => {
    subscribeMock.mockImplementation(async (_params, options: { signal: AbortSignal }) => ({
      stream: createAbortableStream(options.signal),
    }));

    const callbackA = vi.fn();
    const callbackB = vi.fn();

    await subscribeToEvents("/repo/a", callbackA);
    await vi.waitFor(() => {
      expect(subscribeMock).toHaveBeenCalledTimes(1);
    });

    await subscribeToEvents("/repo/a", callbackB);
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("shares a single stream across directories and delivers each event once", async () => {
    const controllable = createControllableStream();
    subscribeMock.mockImplementation(
      async (_params: unknown, options: { signal: AbortSignal }) => ({
        stream: controllable.stream(options.signal),
      }),
    );

    const callbackA = vi.fn();
    const callbackB = vi.fn();

    await subscribeToEvents("/repo/a", callbackA);
    await subscribeToEvents("/repo/b", callbackB);

    expect(subscribeMock).toHaveBeenCalledTimes(1);

    const event = {
      type: "session.idle",
      properties: { sessionID: "s1" },
    } as unknown as Event;
    controllable.push(event);

    await vi.waitFor(() => {
      expect(callbackA).toHaveBeenCalledTimes(1);
      expect(callbackB).toHaveBeenCalledTimes(1);
    });

    expect(callbackA).toHaveBeenCalledWith(event);
    expect(callbackB).toHaveBeenCalledWith(event);
  });

  it("can unsubscribe a callback without stopping other listeners", async () => {
    subscribeMock.mockImplementation(async (_params, options: { signal: AbortSignal }) => ({
      stream: createAbortableStream(options.signal),
    }));

    const callbackA = vi.fn();
    const callbackB = vi.fn();

    await subscribeToEvents("/repo/a", callbackA);
    await subscribeToEvents("/repo/a", callbackB);
    unsubscribeFromEvents("/repo/a", callbackA);

    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("repoints the shared stream to a remaining directory after stop", async () => {
    const event = {
      type: "session.idle",
      properties: { sessionID: "s1" },
    } as unknown as Event;
    const controllable = createControllableStream();
    subscribeMock
      .mockImplementationOnce(async (_params: unknown, options: { signal: AbortSignal }) => ({
        stream: createStream([event]),
      }))
      .mockImplementation(async (_params: unknown, options: { signal: AbortSignal }) => ({
        stream: controllable.stream(options.signal),
      }));

    await subscribeToEvents("/repo/a", vi.fn());
    await subscribeToEvents("/repo/b", vi.fn());
    stopEventListening("/repo/a");

    await vi.waitFor(
      () => {
        expect(subscribeMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 5000 },
    );

    const secondCallParams = subscribeMock.mock.calls[1]?.[0] as
      | { directory?: string }
      | undefined;
    expect(secondCallParams?.directory).toBe("/repo/b");
  });

  it("stops only the requested directory listener on the shared stream", async () => {    const controllable = createControllableStream();
    subscribeMock.mockImplementation(
      async (_params: unknown, options: { signal: AbortSignal }) => ({
        stream: controllable.stream(options.signal),
      }),
    );

    const callbackA = vi.fn();
    const callbackB = vi.fn();

    await subscribeToEvents("/repo/a", callbackA);
    await subscribeToEvents("/repo/b", callbackB);

    stopEventListening("/repo/a");

    const event = {
      type: "session.idle",
      properties: { sessionID: "s1" },
    } as unknown as Event;
    controllable.push(event);

    await vi.waitFor(() => {
      expect(callbackB).toHaveBeenCalledTimes(1);
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callbackA).not.toHaveBeenCalled();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
  });

  it("reconnects after stream end", async () => {
    subscribeMock
      .mockResolvedValueOnce({ stream: createStream([]) })
      .mockImplementationOnce(async (_params, options: { signal: AbortSignal }) => ({
        stream: createAbortableStream(options.signal),
      }));

    await subscribeToEvents("/repo/a", vi.fn());

    await vi.waitFor(
      () => {
        expect(subscribeMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
  });

  it("watchdog forces a reconnect when the stream goes silent", async () => {
    vi.useFakeTimers();
    try {
      subscribeMock.mockImplementation(
        async (_params: unknown, options: { signal: AbortSignal }) => ({
          stream: createAbortableStream(options.signal),
        }),
      );

      await subscribeToEvents("/repo/a", vi.fn());
      await vi.advanceTimersByTimeAsync(0);
      expect(subscribeMock).toHaveBeenCalledTimes(1);

      // No event (not even a heartbeat) for over a minute: the watchdog
      // aborts the stalled subscribe and the loop reconnects (the extra
      // advance covers the reconnect backoff delay).
      await vi.advanceTimersByTimeAsync(75_000);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(subscribeMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects after non-fatal stream error", async () => {
    subscribeMock
      .mockRejectedValueOnce(new Error("transient error"))
      .mockImplementationOnce(async (_params, options: { signal: AbortSignal }) => ({
        stream: createAbortableStream(options.signal),
      }));

    await subscribeToEvents("/repo/a", vi.fn());

    await vi.waitFor(
      () => {
        expect(subscribeMock).toHaveBeenCalledTimes(2);
      },
      { timeout: 3000 },
    );
  });

  it("bounds reconnect backoff with downward jitter", () => {
    for (let attempt = 0; attempt < 50; attempt++) {
      const first = getReconnectDelayMs(1);
      expect(first).toBeGreaterThanOrEqual(500);
      expect(first).toBeLessThanOrEqual(1000);
    }

    for (let attempt = 0; attempt < 20; attempt++) {
      expect(getReconnectDelayMs(100)).toBeLessThanOrEqual(15000);
    }
  });
});
