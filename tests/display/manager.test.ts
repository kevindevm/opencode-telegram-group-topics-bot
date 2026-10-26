import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  overrides: {} as Record<string, boolean>,
  setOverrideMock: vi.fn(),
  scopeOverrides: {} as Record<string, Record<string, boolean>>,
  setScopeOverrideMock: vi.fn(),
}));

vi.mock("../../src/settings/manager.js", () => ({
  getDisplayOverrides: () => ({ ...mocked.overrides }),
  setDisplayOverride: mocked.setOverrideMock,
  getScopeDisplayOverride: (scopeKey: string, flag: string) =>
    mocked.scopeOverrides[scopeKey]?.[flag],
  setScopeDisplayOverride: mocked.setScopeOverrideMock,
}));

vi.mock("../../src/utils/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  DISPLAY_CALLBACK_PREFIX,
  DISPLAY_FLAG,
  buildDisplayKeyboard,
  isDisplayVisible,
  parseDisplayCallback,
  toggleDisplayFlag,
} from "../../src/display/manager.js";

describe("display/manager", () => {
  beforeEach(() => {
    mocked.overrides = {};
    mocked.setOverrideMock.mockReset();
    mocked.scopeOverrides = {};
    mocked.setScopeOverrideMock.mockReset();
    delete process.env.HIDE_THINKING_MESSAGES;
    delete process.env.SHOW_LINK_PREVIEWS;
  });

  it("defaults to visible for every flag without overrides", () => {
    expect(isDisplayVisible(DISPLAY_FLAG.THINKING)).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.TOOL_CALLS)).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.TOOL_FILES)).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.CODE_BLOCKS)).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.BACKGROUND)).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.PC_MIRROR)).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.LINK_PREVIEWS)).toBe(true);
  });

  it("honors runtime overrides over env defaults", () => {
    mocked.overrides = { [DISPLAY_FLAG.THINKING]: false, [DISPLAY_FLAG.CODE_BLOCKS]: false };

    expect(isDisplayVisible(DISPLAY_FLAG.THINKING)).toBe(false);
    expect(isDisplayVisible(DISPLAY_FLAG.TOOL_CALLS)).toBe(true);
  });

  it("toggles a flag from its current value", () => {
    expect(toggleDisplayFlag(DISPLAY_FLAG.BACKGROUND)).toBe(true);
    expect(mocked.setOverrideMock).toHaveBeenCalledWith(DISPLAY_FLAG.BACKGROUND, false);

    mocked.overrides = { [DISPLAY_FLAG.BACKGROUND]: false };
    expect(toggleDisplayFlag(DISPLAY_FLAG.BACKGROUND)).toBe(true);
    expect(mocked.setOverrideMock).toHaveBeenCalledWith(DISPLAY_FLAG.BACKGROUND, true);
  });

  it("rejects unknown flags", () => {
    expect(toggleDisplayFlag("nope")).toBe(false);
    expect(mocked.setOverrideMock).not.toHaveBeenCalled();
    expect(parseDisplayCallback(`${DISPLAY_CALLBACK_PREFIX}nope`)).toBeNull();
  });

  it("prefers the topic override over the global one", () => {
    mocked.overrides = { [DISPLAY_FLAG.THINKING]: false };
    mocked.scopeOverrides = { "chat:1": { [DISPLAY_FLAG.THINKING]: true } };

    expect(isDisplayVisible(DISPLAY_FLAG.THINKING, "chat:1")).toBe(true);
    expect(isDisplayVisible(DISPLAY_FLAG.THINKING, "chat:2")).toBe(false);
    expect(isDisplayVisible(DISPLAY_FLAG.THINKING)).toBe(false);
  });

  it("toggles per topic without touching the global override", () => {
    mocked.overrides = { [DISPLAY_FLAG.TOOL_CALLS]: true };

    expect(toggleDisplayFlag(DISPLAY_FLAG.TOOL_CALLS, "chat:9")).toBe(true);

    expect(mocked.setScopeOverrideMock).toHaveBeenCalledWith(
      "chat:9",
      DISPLAY_FLAG.TOOL_CALLS,
      false,
    );
    expect(mocked.setOverrideMock).not.toHaveBeenCalled();
  });

  it("parses display toggle callbacks", () => {
    expect(parseDisplayCallback(`${DISPLAY_CALLBACK_PREFIX}${DISPLAY_FLAG.PC_MIRROR}`)).toBe(
      DISPLAY_FLAG.PC_MIRROR,
    );
    expect(parseDisplayCallback("model:result:0")).toBeNull();
    expect(parseDisplayCallback(`${DISPLAY_CALLBACK_PREFIX}`)).toBeNull();
  });

  it("builds one toggle button per flag plus an agent shortcut", () => {
    mocked.overrides = { [DISPLAY_FLAG.THINKING]: false };

    const keyboard = buildDisplayKeyboard(undefined, "build");
    const rows = (
      keyboard as unknown as {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
      }
    ).inline_keyboard;

    expect(rows).toHaveLength(8);
    expect(rows[0]?.[0]?.callback_data).toBe(`${DISPLAY_CALLBACK_PREFIX}${DISPLAY_FLAG.THINKING}`);
    expect(rows[0]?.[0]?.text).toContain("❌");
    expect(rows[1]?.[0]?.text).toContain("✅");
    expect(rows[7]?.[0]?.callback_data).toBe("display:agents");
    expect(rows[7]?.[0]?.text).toContain("build");
  });

  it("falls back to a generic agent label without a current agent", () => {
    const keyboard = buildDisplayKeyboard();
    const rows = (
      keyboard as unknown as {
        inline_keyboard: Array<Array<{ text: string; callback_data: string }>>;
      }
    ).inline_keyboard;

    expect(rows).toHaveLength(8);
    expect(rows[7]?.[0]?.callback_data).toBe("display:agents");
  });
});
