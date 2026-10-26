import { describe, expect, it } from "vitest";
import { __modelCallbackTestHooks } from "../../../src/bot/handlers/model.js";

const { encodeModelCallback, decodeModelCallback } = __modelCallbackTestHooks;

describe("bot/handlers/model callback encoding", () => {
  it("keeps short provider/model ids inline", () => {
    const callback = encodeModelCallback({ providerID: "openai", modelID: "gpt-5" });
    expect(callback).toBe("model:openai:gpt-5");
    expect(decodeModelCallback(callback)).toEqual({ providerID: "openai", modelID: "gpt-5" });
  });

  it("keeps colons inside model ids intact", () => {
    const callback = encodeModelCallback({ providerID: "proxy", modelID: "a:b:c" });
    expect(decodeModelCallback(callback)).toEqual({ providerID: "proxy", modelID: "a:b:c" });
  });

  it("indexes long ids so callback_data stays within 64 bytes", () => {
    const model = { providerID: "openrouter", modelID: "x".repeat(100) };
    const callback = encodeModelCallback(model);
    expect(Buffer.byteLength(callback, "utf-8")).toBeLessThanOrEqual(64);
    expect(callback.startsWith("model:ref:")).toBe(true);
    expect(decodeModelCallback(callback)).toEqual({
      providerID: "openrouter",
      modelID: "x".repeat(100),
    });
  });

  it("returns null for unknown refs and malformed data", () => {
    expect(decodeModelCallback("model:ref:#999999")).toBeNull();
    expect(decodeModelCallback("model:only-one-part")).toBeNull();
    expect(decodeModelCallback("something-else")).toBeNull();
  });
});
