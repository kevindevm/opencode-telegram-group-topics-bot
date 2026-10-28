import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetForwardedPromptsForTests,
  claimPcTextMirror,
  clearForwardedPromptsForSession,
  consumeForwardedPrompt,
  isForwardedPrompt,
  markForwardedPrompt,
} from "../../src/session/forwarded-prompts.js";

describe("session/forwarded-prompts hygiene", () => {
  beforeEach(() => {
    __resetForwardedPromptsForTests();
  });

  it("clears every mark of a finished session on demand", () => {
    markForwardedPrompt("ses-gone", "hola");
    claimPcTextMirror("ses-gone", "mirror me");

    clearForwardedPromptsForSession("ses-gone");

    expect(isForwardedPrompt("ses-gone", "hola")).toBe(false);
    expect(consumeForwardedPrompt("ses-gone", "hola")).toBe(false);
    // The mirror claim for that session is gone, so it can be claimed again.
    expect(claimPcTextMirror("ses-gone", "mirror me")).toBe(true);
  });

  it("bounds the number of tracked sessions instead of growing forever", () => {
    for (let i = 0; i < 1005; i++) {
      markForwardedPrompt(`ses-${i}`, `prompt ${i}`);
    }

    expect(isForwardedPrompt("ses-0", "prompt 0")).toBe(false);
    expect(isForwardedPrompt("ses-1004", "prompt 1004")).toBe(true);
  });
});
