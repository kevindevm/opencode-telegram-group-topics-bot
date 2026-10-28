import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingCompactionNotice,
  consumePendingCompactionNotice,
  markPendingCompactionNotice,
} from "../../../src/bot/utils/pending-compaction-notices.js";

describe("bot/utils/pending-compaction-notices", () => {
  beforeEach(() => {
    clearPendingCompactionNotice("notice-basic");
    clearPendingCompactionNotice("notice-clear");
  });

  it("marks and consumes a pending notice exactly once", () => {
    markPendingCompactionNotice("notice-basic");

    expect(consumePendingCompactionNotice("notice-basic")).toBe(true);
    expect(consumePendingCompactionNotice("notice-basic")).toBe(false);
  });

  it("clears a pending notice without consuming it", () => {
    markPendingCompactionNotice("notice-clear");
    clearPendingCompactionNotice("notice-clear");

    expect(consumePendingCompactionNotice("notice-clear")).toBe(false);
  });

  it("evicts the oldest sessions past the cap instead of growing forever", () => {
    const victim = `notice-evict-victim-${Date.now()}`;
    markPendingCompactionNotice(victim);
    for (let index = 0; index < 500; index += 1) {
      markPendingCompactionNotice(`notice-evict-filler-${Date.now()}-${index}`);
    }

    expect(consumePendingCompactionNotice(victim)).toBe(false);
  });
});
