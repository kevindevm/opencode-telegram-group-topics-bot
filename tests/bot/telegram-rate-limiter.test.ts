import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UNKNOWN_429_DELAY_MS,
  MAX_QUEUE_JOBS,
  RateLimitExceededError,
  TelegramRateLimiter,
  parseRetryAfterMs,
} from "../../src/bot/telegram-rate-limiter.js";

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

    await vi.advanceTimersByTimeAsync(14_000);
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

    await vi.advanceTimersByTimeAsync(2_500);
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

describe("bot/telegram-rate-limiter hardening", () => {
  it("parses retry_after from numbers, strings, and descriptions", () => {
    expect(parseRetryAfterMs({ parameters: { retry_after: 23 } })).toBe(23000);
    expect(parseRetryAfterMs({ parameters: { retry_after: "5" } })).toBe(5000);
    expect(parseRetryAfterMs(new Error("Too Many Requests: retry after 3"))).toBe(3000);
    expect(parseRetryAfterMs({ description: "Flood control exceeded: retry_after 7" })).toBe(7000);
    expect(parseRetryAfterMs(new Error("network timeout"))).toBeNull();
    expect(parseRetryAfterMs({ parameters: { retry_after: 0 } })).toBeNull();
    expect(parseRetryAfterMs({ parameters: { retry_after: -2 } })).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
  });

  it("accepts camelCase, millisecond, and bare 429 shapes", () => {
    expect(parseRetryAfterMs({ parameters: { retryAfter: 4 } })).toBe(4000);
    expect(parseRetryAfterMs({ parameters: { retry_after_ms: 2500 } })).toBe(2500);
    expect(parseRetryAfterMs({ parameters: { retryAfterMs: "1500" } })).toBe(1500);
    expect(parseRetryAfterMs(new Error("Too Many Requests: retry_after:5"))).toBe(5000);
    expect(parseRetryAfterMs({ error_code: 429, description: "Too Many Requests" })).toBe(
      DEFAULT_UNKNOWN_429_DELAY_MS,
    );
    expect(parseRetryAfterMs({ error_code: 429 })).toBe(DEFAULT_UNKNOWN_429_DELAY_MS);
    expect(parseRetryAfterMs({ error_code: 400 })).toBeNull();
    expect(parseRetryAfterMs({ error_code: 429 })).toBe(DEFAULT_UNKNOWN_429_DELAY_MS);
    expect(parseRetryAfterMs({ error_code: 400, description: "Bad Request" })).toBeNull();
  });

  it("gives up the queued job after the initial try plus MAX_429_ATTEMPTS retries", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      let attempts = 0;
      const stuckJob = limiter.enqueue(
        "sendMessage",
        { chat_id: 9101 },
        async (): Promise<string> => {
          attempts += 1;
          throw createRetryAfterError(1);
        },
      );
      const assertion = expect(stuckJob).rejects.toBeInstanceOf(RateLimitExceededError);
      await vi.advanceTimersByTimeAsync(120_000);
      await assertion;
      expect(attempts).toBe(11);
    } finally {
      vi.useRealTimers();
    }
  });

  it("bounds the queue and drops oldest repaints first", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const gateJob = limiter.enqueue("sendMessage", { chat_id: 9000 }, async () => {
        await gate;
        return "gate-ok";
      });

      const repaintSettled: Array<Promise<{ status: string; value?: unknown }>> = [];
      for (let index = 0; index < MAX_QUEUE_JOBS; index++) {
        const job = limiter.enqueue(
          "editMessageText",
          { chat_id: 9001, message_id: 1000 + index },
          async () => `ok-${index}`,
        );
        repaintSettled.push(
          job.then(
            (value) => ({ status: "resolved", value }),
            () => ({ status: "rejected" }),
          ),
        );
      }

      const userJob = limiter.enqueue("sendMessage", { chat_id: 9002 }, async () => "user-ok");
      const extraRepaint = limiter.enqueue(
        "editMessageText",
        { chat_id: 9001, message_id: 9999 },
        async () => "extra-ok",
      );

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(300_000);
      await Promise.all([gateJob, userJob, extraRepaint]);

      const settled = await Promise.all(repaintSettled);
      expect(settled[0].status).toBe("rejected");
      expect(settled[1].status).toBe("rejected");
      expect(settled.slice(2).every((entry) => entry.status === "resolved")).toBe(true);
      await expect(userJob).resolves.toBe("user-ok");
      await expect(extraRepaint).resolves.toBe("extra-ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("never drops user jobs when the queue overflows", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const gateJob = limiter.enqueue("sendMessage", { chat_id: 9000 }, async () => {
        await gate;
        return "gate-ok";
      });

      const jobs: Array<Promise<string>> = [];
      for (let index = 0; index < MAX_QUEUE_JOBS + 1; index++) {
        jobs.push(
          limiter.enqueue("sendMessage", { chat_id: 9100 + index }, async () => `ok-${index}`),
        );
      }

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(300_000);
      await gateJob;
      await expect(Promise.all(jobs)).resolves.toHaveLength(MAX_QUEUE_JOBS + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs off sibling jobs for a chat after a 429", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      const executionOrder: string[] = [];
      let attempts = 0;

      const firstJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1001, message_thread_id: 77 },
        async () => {
          attempts += 1;
          executionOrder.push(`first-${attempts}`);
          if (attempts === 1) {
            throw createRetryAfterError(5);
          }
          return "first-ok";
        },
      );
      const siblingJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1001, message_thread_id: 78 },
        async () => {
          executionOrder.push("sibling");
          return "sibling-ok";
        },
      );
      const otherChatJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1002, message_thread_id: 1 },
        async () => {
          executionOrder.push("other");
          return "other-ok";
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      expect(executionOrder).toEqual(["first-1", "other"]);

      await vi.advanceTimersByTimeAsync(2_000);
      expect(executionOrder).not.toContain("sibling");

      await vi.advanceTimersByTimeAsync(10_000);
      await Promise.all([firstJob, siblingJob, otherChatJob]);
      expect(executionOrder).toEqual(["first-1", "other", "sibling", "first-2"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("paces markup edits at the edit interval and coalesces them", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      const sentAt: number[] = [];
      let runs = 0;

      let releaseGate!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseGate = resolve;
      });
      const gateJob = limiter.enqueue("sendMessage", { chat_id: 9000 }, async () => {
        await gate;
        return "gate-ok";
      });

      const firstMarkup = limiter.enqueue(
        "editMessageReplyMarkup",
        { chat_id: 9001, message_id: 5 },
        async () => {
          runs += 1;
          sentAt.push(Date.now());
          return "markup-ok";
        },
      );
      const secondMarkup = limiter.enqueue(
        "editMessageReplyMarkup",
        { chat_id: 9001, message_id: 5 },
        async () => {
          runs += 1;
          sentAt.push(Date.now());
          return "markup-ok";
        },
      );
      const otherMarkup = limiter.enqueue(
        "editMessageReplyMarkup",
        { chat_id: 9001, message_id: 6 },
        async () => {
          sentAt.push(Date.now());
          return "other-ok";
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.all([gateJob, firstMarkup, secondMarkup, otherMarkup]);

      expect(runs).toBe(1);
      await expect(firstMarkup).resolves.toBe("markup-ok");
      await expect(secondMarkup).resolves.toBe("markup-ok");
      expect(sentAt).toHaveLength(2);
      expect(sentAt[1] - sentAt[0]).toBeGreaterThanOrEqual(250);
      expect(sentAt[1] - sentAt[0]).toBeLessThan(1100);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps markup edits out of the group window", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      for (let index = 0; index < 20; index++) {
        limiter.enqueue(
          "editMessageReplyMarkup",
          { chat_id: -1001, message_thread_id: 77, message_id: 300 + index },
          async () => `markup-${index}`,
        );
      }
      const finalSend = limiter.enqueue(
        "sendMessage",
        { chat_id: -1001, message_thread_id: 77 },
        async () => "final-ok",
      );
      await vi.advanceTimersByTimeAsync(15_000);
      await expect(finalSend).resolves.toBe("final-ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts text edits towards the group window", async () => {
    vi.useFakeTimers();
    try {
      const limiter = new TelegramRateLimiter();
      for (let index = 0; index < 20; index++) {
        limiter.enqueue(
          "editMessageText",
          { chat_id: -1001, message_thread_id: 77, message_id: 400 + index },
          async () => `edit-${index}`,
        );
      }
      let sendDone = false;
      const finalSend = limiter
        .enqueue("sendMessage", { chat_id: -1001, message_thread_id: 77 }, async () => "final-ok")
        .then((value) => {
          sendDone = true;
          return value;
        });

      await vi.advanceTimersByTimeAsync(30_000);
      expect(sendDone).toBe(false);

      await vi.advanceTimersByTimeAsync(60_000);
      await expect(finalSend).resolves.toBe("final-ok");
    } finally {
      vi.useRealTimers();
    }
  });

  it("prefers another scope after consecutive picks from one scope", async () => {
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

      const jobs: Array<Promise<unknown>> = [];
      for (let index = 0; index < 6; index++) {
        const label = `a${index}`;
        jobs.push(
          limiter.enqueue(
            "sendMessage",
            { chat_id: -1001, message_thread_id: 77 },
            async () => {
              executionOrder.push(label);
              return label;
            },
          ),
        );
      }
      const otherJob = limiter.enqueue(
        "sendMessage",
        { chat_id: -1001, message_thread_id: 78 },
        async () => {
          executionOrder.push("b");
          return "b";
        },
      );

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(60_000);
      await Promise.all([gateJob, ...jobs, otherJob]);

      expect(executionOrder).toEqual(["a0", "a1", "a2", "a3", "a4", "b", "a5"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("adds bounded jitter to retry sleeps", async () => {
    vi.useFakeTimers();
    try {
      const { runWithRateLimitRetries } = await import(
        "../../src/bot/telegram-rate-limiter.js"
      );
      const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
      try {
        let attempts = 0;
        const pending = runWithRateLimitRetries(
          "probe",
          async (): Promise<string> => {
            attempts += 1;
            if (attempts === 1) {
              throw { parameters: { retry_after: 2 } };
            }
            return "ok";
          },
        );
        await vi.advanceTimersByTimeAsync(2100);
        expect(attempts).toBe(1);
        await vi.advanceTimersByTimeAsync(600);
        await expect(pending).resolves.toBe("ok");
        expect(attempts).toBe(2);
      } finally {
        random.mockRestore();
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets a priority override promote a final edit to user tier", async () => {
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
      const finalJob = limiter.enqueue(
        "editMessageText",
        { chat_id: -1002, message_thread_id: 2, message_id: 11 },
        async () => {
          executionOrder.push("final");
          return "final-ok";
        },
        { priority: "user" },
      );

      await vi.advanceTimersByTimeAsync(0);
      releaseGate!();
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.all([gateJob, repaintJob, finalJob]);

      expect(executionOrder).toEqual(["final", "repaint"]);
    } finally {
      vi.useRealTimers();
    }
  });
});
