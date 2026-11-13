import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionOutputCoordinator } from "../../src/bot/session-output-coordinator.js";

describe("bot/session-output-coordinator", () => {
  function createCoordinator(overrides?: {
    onFinalizeSession?: ReturnType<typeof vi.fn>;
    onFinalDeliveryCommitted?: ReturnType<typeof vi.fn>;
    onFinalDeliveryGiveUp?: ReturnType<typeof vi.fn>;
    onFinalDeliveryNotice?: ReturnType<typeof vi.fn>;
  }): SessionOutputCoordinator {
    return new SessionOutputCoordinator({
      settleMs: 100,
      onFinalizeSession: overrides?.onFinalizeSession ?? vi.fn().mockResolvedValue(true),
      onFinalDeliveryCommitted:
        overrides?.onFinalDeliveryCommitted ?? vi.fn().mockResolvedValue(undefined),
      onFinalDeliveryGiveUp: overrides?.onFinalDeliveryGiveUp,
      onFinalDeliveryNotice: overrides?.onFinalDeliveryNotice,
      handlers: {
        onAssistantUpdate: vi.fn().mockResolvedValue(undefined),
        onAssistantComplete: vi.fn().mockResolvedValue(undefined),
        onTool: vi.fn().mockResolvedValue(undefined),
        onSubagent: vi.fn().mockResolvedValue(undefined),
        onToolFile: vi.fn().mockResolvedValue(undefined),
        onQuestion: vi.fn().mockResolvedValue(undefined),
        onPermission: vi.fn().mockResolvedValue(undefined),
        onThinking: vi.fn().mockResolvedValue(undefined),
        onSessionError: vi.fn().mockResolvedValue(undefined),
        onSessionRetry: vi.fn().mockResolvedValue(undefined),
      },
    });
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs session tasks sequentially", async () => {
    const calls: string[] = [];
    const coordinator = createCoordinator();

    coordinator.enqueue("s1", async () => {
      calls.push("first:start");
      await Promise.resolve();
      calls.push("first:end");
    });

    coordinator.enqueue("s1", async () => {
      calls.push("second");
    });

    await vi.runAllTimersAsync();

    expect(calls).toEqual(["first:start", "first:end", "second"]);
  });

  it("delays finalization until the session has been quiet for settleMs", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.markActivity("s1");
    coordinator.scheduleFinalDelivery("s1");

    await vi.advanceTimersByTimeAsync(80);
    coordinator.markActivity("s1");
    await vi.advanceTimersByTimeAsync(80);

    expect(onFinalizeSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(onFinalizeSession).toHaveBeenCalledTimes(1);
    expect(onFinalizeSession).toHaveBeenCalledWith("s1", null, true);
  });

  it("cancels pending finalization", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.scheduleFinalDelivery("s1");
    coordinator.cancelFinalDelivery("s1");

    await vi.runAllTimersAsync();

    expect(onFinalizeSession).not.toHaveBeenCalled();
  });

  it("dispatches typed actions to the matching handlers in session order", async () => {
    const calls: string[] = [];
    const coordinator = new SessionOutputCoordinator({
      settleMs: 100,
      onFinalizeSession: vi.fn().mockResolvedValue(true),
      onFinalDeliveryCommitted: vi.fn().mockResolvedValue(undefined),
      handlers: {
        onAssistantUpdate: vi.fn(async () => {
          calls.push("assistant_update:start");
          await Promise.resolve();
          calls.push("assistant_update:end");
        }),
        onAssistantComplete: vi.fn(async () => {
          calls.push("assistant_complete");
        }),
        onTool: vi.fn(async () => {
          calls.push("tool");
        }),
        onSubagent: vi.fn().mockResolvedValue(undefined),
        onToolFile: vi.fn().mockResolvedValue(undefined),
        onQuestion: vi.fn().mockResolvedValue(undefined),
        onPermission: vi.fn().mockResolvedValue(undefined),
        onThinking: vi.fn().mockResolvedValue(undefined),
        onSessionError: vi.fn().mockResolvedValue(undefined),
        onSessionRetry: vi.fn().mockResolvedValue(undefined),
      },
    });

    coordinator.dispatch({ kind: "assistant_update", sessionId: "s1", messageId: "m1", text: "a" });
    coordinator.dispatch({
      kind: "tool",
      sessionId: "s1",
      toolInfo: {} as never,
      visibleToUser: true,
    });
    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "done",
    });

    await vi.runAllTimersAsync();

    expect(calls).toEqual([
      "assistant_update:start",
      "assistant_update:end",
      "tool",
      "assistant_complete",
    ]);
  });

  it("routes session errors through the error handler and cancels pending finalization", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const onSessionError = vi.fn().mockResolvedValue(undefined);
    const coordinator = new SessionOutputCoordinator({
      settleMs: 100,
      onFinalizeSession,
      onFinalDeliveryCommitted: vi.fn().mockResolvedValue(undefined),
      handlers: {
        onAssistantUpdate: vi.fn().mockResolvedValue(undefined),
        onAssistantComplete: vi.fn().mockResolvedValue(undefined),
        onTool: vi.fn().mockResolvedValue(undefined),
        onSubagent: vi.fn().mockResolvedValue(undefined),
        onToolFile: vi.fn().mockResolvedValue(undefined),
        onQuestion: vi.fn().mockResolvedValue(undefined),
        onPermission: vi.fn().mockResolvedValue(undefined),
        onThinking: vi.fn().mockResolvedValue(undefined),
        onSessionError,
        onSessionRetry: vi.fn().mockResolvedValue(undefined),
      },
    });

    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
    coordinator.dispatch({ kind: "session_error", sessionId: "s1", message: "boom" });

    await vi.runAllTimersAsync();

    expect(onSessionError).toHaveBeenCalledWith({
      kind: "session_error",
      sessionId: "s1",
      message: "boom",
    });
    expect(onFinalizeSession).not.toHaveBeenCalled();
  });

  it("reschedules finalization when a visible tool action arrives", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
    await vi.advanceTimersByTimeAsync(80);
    coordinator.dispatch({
      kind: "tool",
      sessionId: "s1",
      toolInfo: {} as never,
      visibleToUser: true,
    });
    await vi.advanceTimersByTimeAsync(80);

    expect(onFinalizeSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(onFinalizeSession).toHaveBeenCalledTimes(1);
  });

  it("does not reschedule finalization for hidden tool actions", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
    await vi.advanceTimersByTimeAsync(80);
    coordinator.dispatch({
      kind: "tool",
      sessionId: "s1",
      toolInfo: {} as never,
      visibleToUser: false,
    });
    await vi.advanceTimersByTimeAsync(20);

    expect(onFinalizeSession).toHaveBeenCalledTimes(1);
  });

  it("delivers every queued completion in order instead of only the latest", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "First",
    });
    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m2",
      text: "Second",
    });
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

    await vi.runAllTimersAsync();

    expect(onFinalizeSession).toHaveBeenCalledTimes(2);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(1, "s1", "First", false);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(2, "s1", "Second", true);
  });

  it("delivers finished messages mid-turn without the footer", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "Mid-turn answer",
    });
    await vi.runAllTimersAsync();

    // No idle yet: the message goes out promptly but plain, like the
    // opencode chat timeline.
    expect(onFinalizeSession).toHaveBeenCalledTimes(1);
    expect(onFinalizeSession).toHaveBeenLastCalledWith("s1", "Mid-turn answer", false);
  });

  it("keeps the pending completion when finalization reports failure", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "Retry me",
    });
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(1, "s1", "Retry me", true);

    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(2, "s1", "Retry me", true);
  });

  it("flushes pending final delivery immediately for the next prompt", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCoordinator({ onFinalizeSession, onFinalDeliveryCommitted });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "Reply",
    });
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

    const flushed = await coordinator.flushPendingFinalDelivery("s1");

    expect(flushed).toBe(true);
    expect(onFinalizeSession).toHaveBeenCalledTimes(1);
    expect(onFinalizeSession).toHaveBeenCalledWith("s1", "Reply", true);
    expect(onFinalDeliveryCommitted).toHaveBeenCalledWith("s1");
  });

  it("flushes queued completions for the next prompt even when idle was lost", async () => {
    const onFinalizeSession = vi.fn().mockResolvedValue(true);
    const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCoordinator({ onFinalizeSession, onFinalDeliveryCommitted });

    // A swallowed session.idle: completion tracked, but no delivery scheduled.
    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "Lost idle turn",
    });

    const flushed = await coordinator.flushPendingFinalDelivery("s1");

    expect(flushed).toBe(true);
    expect(onFinalizeSession).toHaveBeenCalledWith("s1", "Lost idle turn", true);
    expect(onFinalDeliveryCommitted).toHaveBeenCalledWith("s1");
  });

  it("requeues the undelivered tail ahead of retry arrivals to preserve order", async () => {
    const onFinalizeSession = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true);
    const coordinator = createCoordinator({ onFinalizeSession });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "One",
    });
    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m2",
      text: "Two",
    });
    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m3",
      text: "Three",
    });
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(1, "s1", "One", false);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(2, "s1", "Two", false);

    // "Two" failed: retried before "Three", order preserved.
    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(3, "s1", "Two", false);
    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(4, "s1", "Three", true);
  });

  it("does not commit an older finalization when a newer completion arrives during delivery", async () => {
    let releaseFirstFinalize: (() => void) | null = null;
    const onFinalizeSession = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            releaseFirstFinalize = () => resolve(true);
          }),
      )
      .mockResolvedValueOnce(true);
    const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCoordinator({ onFinalizeSession, onFinalDeliveryCommitted });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "Old",
    });
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenNthCalledWith(1, "s1", "Old", true);

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m2",
      text: "New",
    });
    // The turn ends after the late arrival: idle re-arms the footer for it.
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
    releaseFirstFinalize?.();
    await Promise.resolve();

    expect(onFinalDeliveryCommitted).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(onFinalizeSession).toHaveBeenNthCalledWith(2, "s1", "New", true);
    expect(onFinalDeliveryCommitted).toHaveBeenCalledTimes(1);
    expect(onFinalDeliveryCommitted).toHaveBeenCalledWith("s1");
  });

  it("retries finalization when the finalizer throws instead of stalling", async () => {
    const onFinalizeSession = vi
      .fn()
      .mockRejectedValueOnce(new Error("telegram down"))
      .mockResolvedValue(true);
    const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
    const coordinator = createCoordinator({ onFinalizeSession, onFinalDeliveryCommitted });

    coordinator.dispatch({
      kind: "assistant_complete",
      sessionId: "s1",
      messageId: "m1",
      text: "Reply",
    });
    coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(100);
    expect(onFinalizeSession).toHaveBeenCalledTimes(2);
    expect(onFinalDeliveryCommitted).toHaveBeenCalledWith("s1");
  });

  it("gives up final delivery after repeated failures instead of retrying forever", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockRejectedValue(new Error("telegram down"));
      const onFinalDeliveryCommitted = vi.fn();
      const onFinalDeliveryGiveUp = vi.fn();
      const coordinator = createCoordinator({
        onFinalizeSession,
        onFinalDeliveryCommitted,
        onFinalDeliveryGiveUp,
      });

      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      for (let attempt = 0; attempt < 60; attempt++) {
        await vi.advanceTimersByTimeAsync(100);
      }

      expect(onFinalizeSession.mock.calls.length).toBeLessThanOrEqual(51);
      expect(onFinalDeliveryCommitted).not.toHaveBeenCalled();
      // The dropped turn releases its run record so no stale clock leaks
      // into a later delivery.
      expect(onFinalDeliveryGiveUp).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("recovers a rate-limited final delivery when the flood ends within budget", async () => {
    vi.useFakeTimers();
    try {
      const { RateLimitExceededError } = await import(
        "../../src/bot/telegram-rate-limiter.js"
      );
      const onFinalizeSession = vi.fn(async () => {
        throw new RateLimitExceededError("final:s1");
      });
      const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
      const coordinator = createCoordinator({ onFinalizeSession, onFinalDeliveryCommitted });

      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m1",
        text: "Reply",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      for (let attempt = 0; attempt < 5; attempt++) {
        await vi.advanceTimersByTimeAsync(15_000);
      }
      expect(onFinalDeliveryCommitted).not.toHaveBeenCalled();

      // Flood over: the very same turn text finally lands.
      onFinalizeSession.mockResolvedValue(true);
      await vi.advanceTimersByTimeAsync(20_000);

      expect(onFinalizeSession).toHaveBeenLastCalledWith("s1", "Reply", true);
      expect(onFinalDeliveryCommitted).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a rate-limited final delivery after the consecutive 429 cap", async () => {
    vi.useFakeTimers();
    try {
      const { RateLimitExceededError } = await import(
        "../../src/bot/telegram-rate-limiter.js"
      );
      const onFinalizeSession = vi.fn(async () => {
        throw new RateLimitExceededError("final:s1");
      });
      const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
      const onFinalDeliveryGiveUp = vi.fn();
      const coordinator = createCoordinator({
        onFinalizeSession,
        onFinalDeliveryCommitted,
        onFinalDeliveryGiveUp,
      });

      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m1",
        text: "Reply",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      for (let attempt = 0; attempt < 50; attempt++) {
        await vi.advanceTimersByTimeAsync(15_000);
      }
      expect(onFinalDeliveryCommitted).not.toHaveBeenCalled();
      expect(onFinalDeliveryGiveUp).toHaveBeenCalledWith("s1");

      const callsAfterGiveUp = onFinalizeSession.mock.calls.length;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(onFinalizeSession.mock.calls.length).toBe(callsAfterGiveUp);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends a best-effort notice before dropping on non-429 give-up", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockRejectedValue(new Error("telegram down"));
      const onFinalDeliveryCommitted = vi.fn();
      const onFinalDeliveryNotice = vi.fn().mockResolvedValue(undefined);
      const onFinalDeliveryGiveUp = vi.fn();
      const coordinator = createCoordinator({
        onFinalizeSession,
        onFinalDeliveryCommitted,
        onFinalDeliveryNotice,
        onFinalDeliveryGiveUp,
      });

      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      for (let attempt = 0; attempt < 60; attempt++) {
        await vi.advanceTimersByTimeAsync(100);
      }
      await Promise.resolve();

      expect(onFinalDeliveryCommitted).not.toHaveBeenCalled();
      expect(onFinalDeliveryNotice).toHaveBeenCalledTimes(1);
      expect(onFinalDeliveryNotice).toHaveBeenCalledWith("s1");
      expect(onFinalDeliveryGiveUp).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("still drops when the give-up notice itself fails", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockRejectedValue(new Error("telegram down"));
      const onFinalDeliveryNotice = vi.fn().mockRejectedValue(new Error("send failed"));
      const onFinalDeliveryGiveUp = vi.fn();
      const coordinator = createCoordinator({
        onFinalizeSession,
        onFinalDeliveryNotice,
        onFinalDeliveryGiveUp,
      });

      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      for (let attempt = 0; attempt < 60; attempt++) {
        await vi.advanceTimersByTimeAsync(100);
      }
      await Promise.resolve();

      expect(onFinalDeliveryGiveUp).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not reset the give-up budget when new completions arrive", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockResolvedValue(false);
      const onFinalDeliveryCommitted = vi.fn();
      const onFinalDeliveryGiveUp = vi.fn();
      const coordinator = createCoordinator({
        onFinalizeSession,
        onFinalDeliveryCommitted,
        onFinalDeliveryGiveUp,
      });

      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m0",
        text: "Start",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      for (let attempt = 0; attempt < 60; attempt++) {
        coordinator.dispatch({
          kind: "assistant_complete",
          sessionId: "s1",
          messageId: `m${attempt + 1}`,
          text: `Drip ${attempt + 1}`,
        });
        await vi.advanceTimersByTimeAsync(100);
      }

      expect(onFinalDeliveryCommitted).not.toHaveBeenCalled();
      expect(onFinalDeliveryGiveUp).toHaveBeenCalledWith("s1");
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops consecutive duplicate completions instead of delivering twice", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockResolvedValue(true);
      const coordinator = createCoordinator({ onFinalizeSession });

      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m1",
        text: "Same answer",
      });
      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m2",
        text: "Same answer",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
      await vi.runAllTimersAsync();

      expect(onFinalizeSession).toHaveBeenCalledTimes(1);
      expect(onFinalizeSession).toHaveBeenLastCalledWith("s1", "Same answer", true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("drops a re-delivery of an already delivered completion in a later turn", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockResolvedValue(true);
      const coordinator = createCoordinator({ onFinalizeSession });

      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m1",
        text: "Panorama answer",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
      await vi.runAllTimersAsync();
      expect(onFinalizeSession).toHaveBeenCalledTimes(1);

      // Replay with a new message id after the queue was committed: the
      // consecutive check cannot see it, the delivered memory must.
      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m2",
        text: "Panorama answer",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
      await vi.runAllTimersAsync();
      // Only the empty repaint round ran (null text): the answer text went
      // out exactly once across both turns.
      expect(
        onFinalizeSession.mock.calls.filter((call) => call[1] === "Panorama answer"),
      ).toHaveLength(1);

      // A different answer still goes out, and the repeated one after it too.
      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m3",
        text: "Other answer",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
      await vi.runAllTimersAsync();
      expect(onFinalizeSession).toHaveBeenLastCalledWith("s1", "Other answer", true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("marks dropped completions with a gap marker instead of losing them silently", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockResolvedValue(true);
      const coordinator = createCoordinator({ onFinalizeSession });

      for (let index = 1; index <= 202; index++) {
        coordinator.dispatch({
          kind: "assistant_complete",
          sessionId: "s1",
          messageId: `m${index}`,
          text: `Update ${index}`,
        });
      }
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
      await vi.runAllTimersAsync();

      expect(onFinalizeSession).toHaveBeenCalledTimes(200);
      expect(onFinalizeSession).toHaveBeenNthCalledWith(1, "s1", "Update 3", false);
      expect(onFinalizeSession).toHaveBeenLastCalledWith(
        "s1",
        "[system notice: 2 earlier updates dropped] Update 202",
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps the overflow gap marker count", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockResolvedValue(true);
      const coordinator = createCoordinator({ onFinalizeSession });

      for (let index = 1; index <= 350; index++) {
        coordinator.dispatch({
          kind: "assistant_complete",
          sessionId: "s1",
          messageId: `m${index}`,
          text: `Update ${index}`,
        });
      }
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });
      await vi.runAllTimersAsync();

      expect(onFinalizeSession).toHaveBeenLastCalledWith(
        "s1",
        "[system notice: 99+ earlier updates dropped] Update 350",
        true,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not resurrect a cleared session on retry", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi
        .fn()
        .mockRejectedValueOnce(new Error("telegram down"))
        .mockResolvedValue(true);
      const coordinator = createCoordinator({ onFinalizeSession });

      coordinator.dispatch({
        kind: "assistant_complete",
        sessionId: "s1",
        messageId: "m1",
        text: "Reply",
      });
      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      await vi.advanceTimersByTimeAsync(100);
      expect(onFinalizeSession).toHaveBeenCalledTimes(1);

      coordinator.clearSession("s1");
      await vi.advanceTimersByTimeAsync(1000);

      expect(onFinalizeSession).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not double finalize when flush races an in-flight round", async () => {
    vi.useFakeTimers();
    try {
      const onFinalizeSession = vi.fn().mockResolvedValue(true);
      const onFinalDeliveryCommitted = vi.fn().mockResolvedValue(undefined);
      const coordinator = createCoordinator({ onFinalizeSession, onFinalDeliveryCommitted });

      coordinator.dispatch({ kind: "session_idle", sessionId: "s1" });

      const first = coordinator.flushPendingFinalDelivery("s1");
      const second = coordinator.flushPendingFinalDelivery("s1");
      const [firstResult, secondResult] = await Promise.all([first, second]);

      expect(firstResult).toBe(true);
      expect(secondResult).toBe(true);
      expect(onFinalizeSession).toHaveBeenCalledTimes(1);
      expect(onFinalizeSession).toHaveBeenCalledWith("s1", null, true);
      expect(onFinalDeliveryCommitted).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
