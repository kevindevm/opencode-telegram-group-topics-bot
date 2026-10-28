import { describe, expect, it } from "vitest";
import { contextStateManager } from "../../src/context/manager.js";

describe("context/manager", () => {
  it("clamps used over the limit so the button never exceeds 100%", () => {
    contextStateManager.update(125_000, 100_000, "ctx-clamp");
    expect(contextStateManager.get("ctx-clamp")).toEqual({
      tokensUsed: 100_000,
      tokensLimit: 100_000,
    });
    contextStateManager.clear("ctx-clamp");
  });

  it("floors negative usage at zero", () => {
    contextStateManager.update(-5, 100_000, "ctx-floor");
    expect(contextStateManager.get("ctx-floor")?.tokensUsed).toBe(0);
    contextStateManager.clear("ctx-floor");
  });

  it("clears scope state", () => {
    contextStateManager.update(10, 100, "ctx-clear");
    contextStateManager.clear("ctx-clear");
    expect(contextStateManager.get("ctx-clear")).toBeNull();
  });
});
