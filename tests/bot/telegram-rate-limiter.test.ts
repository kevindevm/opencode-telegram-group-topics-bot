import { describe, expect, it, vi } from "vitest";
import { TelegramRateLimiter } from "../../src/bot/telegram-rate-limiter.js";

function createRetryAfterError(seconds: number): { parameters: { retry_after: number } } {
  return {
    parameters: {
      retry_after: seconds,
    },
  };
}

describe("bot/telegram-rate-limiter", () => {
  it("keeps in-order delivery for same scope after retry", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    const executionOrder: string[] = [];
    let firstJobAttempt = 0;

    const firstJob = limiter.enqueue(
      "sendMessage",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        firstJobAttempt += 1;
        executionOrder.push(`first-${firstJobAttempt}`);

        if (firstJobAttempt === 1) {
          throw createRetryAfterError(1);
        }

        return "first-ok";
      },
    );

    const secondJob = limiter.enqueue(
      "sendMessage",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        executionOrder.push("second");
        return "second-ok";
      },
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(executionOrder).toEqual(["first-1"]);

    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.all([firstJob, secondJob]);

    expect(executionOrder).toEqual(["first-1", "first-2", "second"]);

    vi.useRealTimers();
  });

  it("coalesces queued edits for the same message without changing queue order", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    const executionOrder: string[] = [];

    const primeJob = limiter.enqueue(
      "sendMessage",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        executionOrder.push("prime");
        return "prime-ok";
      },
    );

    await vi.advanceTimersByTimeAsync(0);
    await primeJob;

    const firstEditJob = limiter.enqueue(
      "editMessageText",
      {
        chat_id: -1001,
        message_thread_id: 77,
        message_id: 10,
      },
      async () => {
        executionOrder.push("edit-1");
        return "edit-1-ok";
      },
    );

    const fileJob = limiter.enqueue(
      "sendDocument",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        executionOrder.push("file");
        return "file-ok";
      },
    );

    const secondEditJob = limiter.enqueue(
      "editMessageText",
      {
        chat_id: -1001,
        message_thread_id: 77,
        message_id: 10,
      },
      async () => {
        executionOrder.push("edit-2");
        return "edit-2-ok";
      },
    );

    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.all([firstEditJob, secondEditJob, fileJob]);

    expect(executionOrder).toEqual(["prime", "edit-2", "file"]);

    vi.useRealTimers();
  });

  it("enqueues a new edit after an in-flight edit instead of coalescing it", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    const executionOrder: string[] = [];
    const firstEditGateControl: { release: (() => void) | null } = { release: null };
    const firstEditGate = new Promise<void>((resolve) => {
      firstEditGateControl.release = resolve;
    });

    const firstEditJob = limiter.enqueue(
      "editMessageText",
      {
        chat_id: -1001,
        message_thread_id: 77,
        message_id: 10,
      },
      async () => {
        executionOrder.push("edit-1");
        await firstEditGate;
        return "edit-1-ok";
      },
    );

    await vi.advanceTimersByTimeAsync(0);

    const fileJob = limiter.enqueue(
      "sendDocument",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        executionOrder.push("file");
        return "file-ok";
      },
    );

    const secondEditJob = limiter.enqueue(
      "editMessageText",
      {
        chat_id: -1001,
        message_thread_id: 77,
        message_id: 10,
      },
      async () => {
        executionOrder.push("edit-2");
        return "edit-2-ok";
      },
    );

    const release = firstEditGateControl.release;
    if (typeof release === "function") {
      release();
    }

    await vi.advanceTimersByTimeAsync(3_000);
    await Promise.all([firstEditJob, fileJob, secondEditJob]);

    expect(executionOrder).toEqual(["edit-1", "file", "edit-2"]);

    vi.useRealTimers();
  });

  it("does not let frequent edits exhaust the group send window", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    const executionOrder: string[] = [];

    for (let index = 0; index < 20; index++) {
      limiter.enqueue(
        "editMessageText",
        {
          chat_id: -1001,
          message_thread_id: 77,
          message_id: 10,
        },
        async () => {
          executionOrder.push(`edit-${index}`);
          return `edit-${index}-ok`;
        },
      );
    }

    const finalSend = limiter.enqueue(
      "sendMessage",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        executionOrder.push("final-send");
        return "final-ok";
      },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await finalSend;

    expect(executionOrder).toContain("final-send");

    vi.useRealTimers();
  });

  it("waits for the full Telegram retry_after duration", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    const executionOrder: string[] = [];
    let attempts = 0;

    const job = limiter.enqueue(
      "sendDocument",
      {
        chat_id: -1001,
        message_thread_id: 77,
      },
      async () => {
        attempts += 1;
        executionOrder.push(`attempt-${attempts}`);
        if (attempts === 1) {
          throw createRetryAfterError(23);
        }

        return "ok";
      },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(executionOrder).toEqual(["attempt-1"]);

    await vi.advanceTimersByTimeAsync(13_500);
    await expect(job).resolves.toBe("ok");
    expect(executionOrder).toEqual(["attempt-1", "attempt-2"]);

    vi.useRealTimers();
  });

  it("retries retry_after for non-queued Telegram methods too", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    const executionOrder: string[] = [];
    let attempts = 0;

    const job = limiter.enqueue(
      "deleteMessage",
      {
        chat_id: -1001,
        message_id: 99,
      },
      async () => {
        attempts += 1;
        executionOrder.push(`attempt-${attempts}`);
        if (attempts === 1) {
          throw createRetryAfterError(2);
        }

        return "ok";
      },
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(executionOrder).toEqual(["attempt-1"]);

    await vi.advanceTimersByTimeAsync(1_500);
    await expect(job).resolves.toBe("ok");
    expect(executionOrder).toEqual(["attempt-1", "attempt-2"]);

    vi.useRealTimers();
  });

  it("gives up after repeated rate limits so the queue keeps draining", async () => {
    vi.useFakeTimers();

    const limiter = new TelegramRateLimiter();
    let attempts = 0;

    const stuckJob = limiter.enqueue(
      "sendMessage",
      { chat_id: -1001, message_thread_id: 77 },
      async (): Promise<string> => {
        attempts += 1;
        throw createRetryAfterError(1);
      },
    );
    const stuckPromise = expect(stuckJob).rejects.toThrow(/rate limit/i);

    const queuedOrder: string[] = [];
    const nextJob = limiter.enqueue(
      "sendMessage",
      { chat_id: -1001, message_thread_id: 78 },
      async () => {
        queuedOrder.push("next");
        return "next-ok";
      },
    );

    await vi.advanceTimersByTimeAsync(120_000);
    await stuckPromise;
    // 1 initial attempt + capped retries (not unbounded).
    expect(attempts).toBeLessThanOrEqual(11);
    await expect(nextJob).resolves.toBe("next-ok");
    expect(queuedOrder).toEqual(["next"]);

    vi.useRealTimers();
  });

  it("drops a stale pin edit retry when a newer edit for the same message is queued", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      const sentTexts: string[] = [];

      const oldJob = limiter.enqueue(
        "editMessageText",
        { chat_id: -1001, message_thread_id: 77, message_id: 10, text: "old" },
        async () => {
          sentTexts.push("old");
          throw createRetryAfterError(5);
        },
      );
      // Swallow the old rejection path: after the merge it resolves with the newer result.
      const oldSettled = oldJob.then(
        (value) => ({ status: "resolved" as const, value }),
        (error) => ({ status: "rejected" as const, error }),
      );

      // Let the old edit attempt once so it requeues with a retry_after.
      await vi.advanceTimersByTimeAsync(500);

      const newJob = limiter.enqueue(
        "editMessageText",
        { chat_id: -1001, message_thread_id: 77, message_id: 10, text: "new" },
        async () => {
          sentTexts.push("new");
          return "new-ok";
        },
      );

      await vi.advanceTimersByTimeAsync(10_000);
      await expect(newJob).resolves.toBe("new-ok");
      // The stale retry is dropped, never resent; its waiters get the fresh result.
      await expect(oldSettled).resolves.toEqual({ status: "resolved", value: "new-ok" });
      expect(sentTexts).toEqual(["old", "new"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries an edit when no newer edit supersedes it", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      let attempts = 0;

      const job = limiter.enqueue(
        "editMessageText",
        { chat_id: -1001, message_thread_id: 77, message_id: 10, text: "same" },
        async () => {
          attempts += 1;
          if (attempts === 1) {
            throw createRetryAfterError(2);
          }
          return "ok";
        },
      );

      await vi.advanceTimersByTimeAsync(5_000);
      await expect(job).resolves.toBe("ok");
      expect(attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("runWithRateLimitRetries", () => {
  it("serves user traffic before repaints when both are ready", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      const executionOrder: string[] = [];

      // Occupy the loop so the next two jobs actually queue up together.
      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const gateJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1000, message_thread_id: 1 },
        async () => {
          await gate;
          return "gate-ok";
        },
      );

      const repaintJob = limiter.enqueue(
        "editMessageText",
        { chat_id: -1001, message_thread_id: 1, message_id: 10 },
        async () => {
          executionOrder.push("repaint");
          return "repaint-ok";
        },
      );

      const userJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1002, message_thread_id: 2 },
        async () => {
          executionOrder.push("user");
          return "user-ok";
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.all([gateJob, repaintJob, userJob]);

      expect(executionOrder).toEqual(["user", "repaint"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps in-order delivery within the same scope across priorities", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      const executionOrder: string[] = [];

      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const gateJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1000, message_thread_id: 9 },
        async () => {
          await gate;
          return "gate-ok";
        },
      );

      const repaintJob = limiter.enqueue(
        "editMessageText",
        { chat_id: -1001, message_thread_id: 1, message_id: 10 },
        async () => {
          executionOrder.push("repaint");
          return "repaint-ok";
        },
      );

      const userJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1001, message_thread_id: 1 },
        async () => {
          executionOrder.push("user");
          return "user-ok";
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(2000);
      await Promise.all([gateJob, repaintJob, userJob]);

      // Same scope: FIFO wins over priority, messages never reorder.
      expect(executionOrder).toEqual(["repaint", "user"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("passes through the first success", async () => {
    const { runWithRateLimitRetries } = await import(
      "../../src/bot/telegram-rate-limiter.js"
    );
    await expect(runWithRateLimitRetries("probe", async () => 42)).resolves.toBe(42);
  });

  it("rethrows non-rate-limit errors immediately", async () => {
    const { runWithRateLimitRetries } = await import(
      "../../src/bot/telegram-rate-limiter.js"
    );
    const boom = new Error("Bad Request: message to edit not found");
    await expect(
      runWithRateLimitRetries("probe", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
  });

  it("gives up with RateLimitExceededError after the budget", async () => {
    vi.useFakeTimers();
    try {
      const { RateLimitExceededError, runWithRateLimitRetries } = await import(
        "../../src/bot/telegram-rate-limiter.js"
      );
      let attempts = 0;
      const pending = runWithRateLimitRetries(
        "probe",
        async (): Promise<string> => {
          attempts += 1;
          throw { parameters: { retry_after: 1 } };
        },
        3,
      );
      const assertion = expect(pending).rejects.toBeInstanceOf(RateLimitExceededError);
      await vi.advanceTimersByTimeAsync(60_000);
      await assertion;
      expect(attempts).toBe(4);
    } finally {
      vi.useRealTimers();
    }
  });
});
