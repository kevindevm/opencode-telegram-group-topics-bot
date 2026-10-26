import { describe, expect, it } from "vitest";
import {
  getChatActionThreadOptions,
  getThreadSendOptions,
} from "../../src/bot/scope.js";

describe("bot/scope thread options", () => {
  it("omits message_thread_id for null (DM) and General (thread 1)", () => {
    expect(getThreadSendOptions(null)).toEqual({});
    expect(getThreadSendOptions(1)).toEqual({});
    expect(getThreadSendOptions(9)).toEqual({ message_thread_id: 9 });
  });

  it("never sends thread 1 for chat actions either", () => {
    expect(getChatActionThreadOptions(null)).toEqual({});
    expect(getChatActionThreadOptions(1)).toEqual({});
    expect(getChatActionThreadOptions(9)).toEqual({ message_thread_id: 9 });
  });
});
