import { describe, expect, it } from "vitest";
import { ChainStallWatch } from "../../../src/bot/utils/chain-stall-watch.js";

describe("bot/utils/chain-stall-watch", () => {
  it("reports a task only after the stall budget passes, once", () => {
    const watch = new ChainStallWatch("Test", 60_000, 30_000);
    watch.markStart("s1", 1_000);

    expect(watch.checkStalled(60_999)).toEqual([]);
    expect(watch.checkStalled(61_000)).toEqual([
      { owner: "Test", sessionId: "s1", ageMs: 60_000 },
    ]);
    // Already warned: silent until a fresh task starts.
    expect(watch.checkStalled(300_000)).toEqual([]);

    watch.markDone("s1");
    watch.markStart("s1", 300_000);
    expect(watch.checkStalled(360_000)).toEqual([
      { owner: "Test", sessionId: "s1", ageMs: 60_000 },
    ]);
  });

  it("forgets finished tasks", () => {
    const watch = new ChainStallWatch("Test", 60_000, 30_000);
    watch.markStart("s1", 1_000);
    watch.markDone("s1");

    expect(watch.checkStalled(1_000_000)).toEqual([]);
  });

  it("tracks sessions independently", () => {
    const watch = new ChainStallWatch("Test", 60_000, 30_000);
    watch.markStart("s1", 1_000);
    watch.markStart("s2", 50_000);

    expect(watch.checkStalled(61_000).map((entry) => entry.sessionId)).toEqual(["s1"]);
    expect(watch.checkStalled(110_000).map((entry) => entry.sessionId)).toEqual(["s2"]);
  });
});
