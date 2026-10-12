import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForwardedPromptsForTests,
  consumeForwardedPrompt,
  markForwardedPrompt,
} from "../../src/session/forwarded-prompts.js";

describe("session/forwarded-prompts", () => {
  beforeEach(() => {
    __resetForwardedPromptsForTests();
  });

  it("consumes a mark for the same session and text", () => {
    markForwardedPrompt("ses-1", "hola");

    expect(consumeForwardedPrompt("ses-1", "hola")).toBe(true);
  });

  it("is one-shot: a second consume finds nothing", () => {
    markForwardedPrompt("ses-1", "hola");

    expect(consumeForwardedPrompt("ses-1", "hola")).toBe(true);
    expect(consumeForwardedPrompt("ses-1", "hola")).toBe(false);
  });

  it("ignores other sessions and other texts", () => {
    markForwardedPrompt("ses-1", "hola");

    expect(consumeForwardedPrompt("ses-2", "hola")).toBe(false);
    expect(consumeForwardedPrompt("ses-1", "chau")).toBe(false);
    // The mark survives non-matching consumes.
    expect(consumeForwardedPrompt("ses-1", "hola")).toBe(true);
  });

  it("never marks empty text", () => {
    markForwardedPrompt("ses-1", "   ");

    expect(consumeForwardedPrompt("ses-1", "")).toBe(false);
    expect(consumeForwardedPrompt("ses-1", "   ")).toBe(false);
  });

  it("expires marks after the TTL", () => {
    vi.useFakeTimers();
    try {
      markForwardedPrompt("ses-1", "hola");
      vi.advanceTimersByTime(11 * 60 * 1000);

      expect(consumeForwardedPrompt("ses-1", "hola")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("matches within the TTL despite surrounding whitespace", () => {
    markForwardedPrompt("ses-1", "  hola  ");

    expect(consumeForwardedPrompt("ses-1", "hola")).toBe(true);
  });
});
