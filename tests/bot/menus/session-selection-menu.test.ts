import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_SESSION_KIND_BY_CALLBACK_MARKER,
  buildBackgroundSessionOpenKeyboard,
  parseBackgroundSessionCallback,
  parseSessionIdCallback,
} from "../../../src/bot/menus/session-selection-menu.js";

vi.mock("../../../src/utils/logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("bot/menus/session-selection-menu background callbacks", () => {
  it("round-trips every notification kind through build and parse", () => {
    for (const kind of Object.keys(BACKGROUND_SESSION_KIND_BY_CALLBACK_MARKER) as Array<
      "a" | "q" | "p"
    >) {
      const expectedKind = BACKGROUND_SESSION_KIND_BY_CALLBACK_MARKER[kind];
      const keyboard = buildBackgroundSessionOpenKeyboard("ses-123", expectedKind!);
      const data = keyboard.inline_keyboard[0]?.[0]?.callback_data ?? "";
      expect(data.startsWith("background-session:")).toBe(true);
      expect(parseBackgroundSessionCallback(data)).toEqual({
        sessionId: "ses-123",
        kind: expectedKind,
      });
    }
  });

  it("keeps background callbacks out of the plain session parser", () => {
    const keyboard = buildBackgroundSessionOpenKeyboard("ses-123", "assistant_response");
    const data = keyboard.inline_keyboard[0]?.[0]?.callback_data ?? "";
    expect(parseSessionIdCallback(data)).toBeNull();
  });

  it("rejects unknown markers and empty session ids", () => {
    expect(parseBackgroundSessionCallback("background-session:z:ses-1")).toBeNull();
    expect(parseBackgroundSessionCallback("background-session:a:")).toBeNull();
    expect(parseBackgroundSessionCallback("background-session:")).toBeNull();
    expect(parseBackgroundSessionCallback("session:ses-1")).toBeNull();
    expect(parseBackgroundSessionCallback("")).toBeNull();
  });
});
