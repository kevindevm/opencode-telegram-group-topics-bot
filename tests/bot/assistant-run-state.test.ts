import { beforeEach, describe, expect, it } from "vitest";
import { assistantRunState } from "../../src/bot/assistant-run-state.js";

describe("bot/assistant-run-state", () => {
  beforeEach(() => {
    assistantRunState.__resetForTests();
  });

  it("stores and returns the active run", () => {
    assistantRunState.startRun("s1", {
      startedAt: 123,
      configuredAgent: "build",
      configuredProviderID: "openai",
      configuredModelID: "gpt-5",
    });

    expect(assistantRunState.getRun("s1")).toEqual({
      sessionId: "s1",
      startedAt: 123,
      configuredAgent: "build",
      configuredProviderID: "openai",
      configuredModelID: "gpt-5",
    });
  });

  it("returns the finished snapshot and consumes it so later deliveries fall back", () => {
    assistantRunState.startRun("s1", { startedAt: 123 });

    expect(assistantRunState.finishRun("s1", "done")).toEqual({
      sessionId: "s1",
      startedAt: 123,
      configuredAgent: undefined,
      configuredProviderID: undefined,
      configuredModelID: undefined,
    });
    // Consumed: a late, unrelated delivery finds no run and falls back to
    // `agent · model` without duration instead of showing a growing clock.
    expect(assistantRunState.getRun("s1")).toBeNull();
    expect(assistantRunState.finishRun("s1", "done")).toBeNull();
  });

  it("leaves the run untouched until the last message of the turn finishes it", () => {
    assistantRunState.startRun("s1", { startedAt: 123, configuredAgent: "build" });

    // Non-last deliveries never touch the run (no footer taken, none consumed).
    expect(assistantRunState.getRun("s1")).toMatchObject({
      sessionId: "s1",
      startedAt: 123,
      configuredAgent: "build",
    });

    assistantRunState.finishRun("s1", "final_delivery_sent");

    // The last message consumed it: nothing leaks into the next turn.
    expect(assistantRunState.getRun("s1")).toBeNull();
  });

  it("replaces the finished run when the next prompt starts", () => {
    assistantRunState.startRun("s1", { startedAt: 123, configuredAgent: "build" });
    assistantRunState.finishRun("s1", "done");

    assistantRunState.startRun("s1", { startedAt: 456, configuredAgent: "plan" });

    expect(assistantRunState.getRun("s1")).toMatchObject({
      startedAt: 456,
      configuredAgent: "plan",
    });
  });
});
