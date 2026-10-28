import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForwardedPromptsForTests,
  claimPcTextMirror,
  consumeForwardedPrompt,
  isForwardedPrompt,
  markForwardedPrompt,
  unmarkForwardedPrompt,
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

  it("peeks forwarded marks without consuming them", () => {
    markForwardedPrompt("ses-1", "hola");

    expect(isForwardedPrompt("ses-1", "hola")).toBe(true);
    expect(isForwardedPrompt("ses-1", "hola")).toBe(true);
    expect(consumeForwardedPrompt("ses-1", "hola")).toBe(true);
    expect(isForwardedPrompt("ses-2", "hola")).toBe(false);
    expect(isForwardedPrompt("ses-1", "chau")).toBe(false);
  });

  it("claims a pc mirror once per text", () => {
    expect(claimPcTextMirror("ses-1", "hola")).toBe(true);
    expect(claimPcTextMirror("ses-1", "hola")).toBe(false);
    expect(claimPcTextMirror("ses-1", "chau")).toBe(true);
    expect(claimPcTextMirror("ses-2", "hola")).toBe(true);
  });

  it("rejects empty claims", () => {
    expect(claimPcTextMirror("", "hola")).toBe(false);
    expect(claimPcTextMirror("ses-1", "   ")).toBe(false);
  });

  it("expires mirror claims after the TTL", () => {
    vi.useFakeTimers();
    try {
      expect(claimPcTextMirror("ses-1", "hola")).toBe(true);
      vi.advanceTimersByTime(95 * 1000);

      expect(claimPcTextMirror("ses-1", "hola")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps one mark per queued prompt instead of overwriting", () => {
    markForwardedPrompt("ses-1", "first prompt");
    markForwardedPrompt("ses-1", "second prompt");

    expect(consumeForwardedPrompt("ses-1", "first prompt")).toBe(true);
    expect(consumeForwardedPrompt("ses-1", "second prompt")).toBe(true);
    expect(consumeForwardedPrompt("ses-1", "second prompt")).toBe(false);
  });

  it("unmarks a single entry without dropping the rest", () => {
    markForwardedPrompt("ses-1", "first prompt");
    markForwardedPrompt("ses-1", "second prompt");

    unmarkForwardedPrompt("ses-1", "first prompt");

    expect(isForwardedPrompt("ses-1", "first prompt")).toBe(false);
    expect(isForwardedPrompt("ses-1", "second prompt")).toBe(true);
  });
});
