import { beforeEach, describe, expect, it, vi } from "vitest";
import { keyboardManager } from "../../src/keyboard/manager.js";
import { contextStateManager } from "../../src/context/manager.js";
import { setCurrentModel } from "../../src/settings/manager.js";

function getButtonText(button: string | { text: string }): string {
  return typeof button === "string" ? button : button.text;
}

describe("keyboard/manager", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("uses shared context state for topic scopes", () => {
    const scopeKey = "-100123:77";

    keyboardManager.updateAgent("build", scopeKey);
    keyboardManager.updateModel(
      {
        providerID: "openai",
        modelID: "gpt-5.4",
        variant: "default",
      },
      scopeKey,
    );
    keyboardManager.updateContext(0, 1_100_000, scopeKey);

    contextStateManager.update(42_000, 1_100_000, scopeKey);

    const keyboard = keyboardManager.getKeyboard(scopeKey);

    expect(keyboard).toBeDefined();
    expect(getButtonText(keyboard!.keyboard[0][0])).toBe("📊 42K / 1.1M (4%)");

    contextStateManager.clear(scopeKey);
    keyboardManager.clearScope(scopeKey);
  });

  it("debounces identical reposts but lets a forced final update through", async () => {
    vi.useFakeTimers();
    try {
      const scopeKey = "-100123:99";
      const sendMessage = vi.fn().mockResolvedValue({ message_id: 7 });
      const deleteMessage = vi.fn().mockResolvedValue(true);
      keyboardManager.initialize(
        { sendMessage, deleteMessage } as never,
        -100123,
        scopeKey,
      );
      keyboardManager.updateAgent("build", scopeKey);
      keyboardManager.updateModel(
        { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
        scopeKey,
      );

      contextStateManager.update(1_000, 100_000, scopeKey);
      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey);
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // Same markup within the debounce window: skipped.
      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey);
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // Forced (turn-end) repost bypasses the time debounce; the unchanged
      // markup fingerprint still skips the send.
      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey, { force: true });
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // New numbers with force: sent even inside the debounce window.
      contextStateManager.update(5_000, 100_000, scopeKey);
      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey, { force: true });
      expect(sendMessage).toHaveBeenCalledTimes(2);

      keyboardManager.clearScope(scopeKey);
    } finally {
      vi.useRealTimers();
    }
  });

  it("piggybacks fresh markup once, then reports up-to-date", () => {
    const scopeKey = "-100123:55";
    keyboardManager.updateAgent("build", scopeKey);
    keyboardManager.updateModel(
      { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
      scopeKey,
    );
    contextStateManager.update(1_000, 100_000, scopeKey);

    // First call: stale, returns markup and records delivery...
    const markup = keyboardManager.consumeStaleKeyboardMarkup(scopeKey);
    expect(markup).toBeDefined();

    // ...so the second call is a no-op and the carrier stays silent.
    expect(keyboardManager.consumeStaleKeyboardMarkup(scopeKey)).toBeUndefined();

    // New numbers make it stale again.
    contextStateManager.update(9_000, 100_000, scopeKey);
    expect(keyboardManager.consumeStaleKeyboardMarkup(scopeKey)).toBeDefined();

    // Unknown scope: nothing to attach.
    expect(keyboardManager.consumeStaleKeyboardMarkup("never-initialized")).toBeUndefined();

    contextStateManager.clear(scopeKey);
    keyboardManager.clearScope(scopeKey);
  });

  it("reflects store-side model changes without an explicit keyboard update", () => {
    const scopeKey = "-100123:56";
    keyboardManager.updateAgent("build", scopeKey);
    keyboardManager.updateModel(
      { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
      scopeKey,
    );

    // A flow like the pre-prompt live-model sync writes the settings store
    // directly; the next build must pick it up so buttons stop lying.
    setCurrentModel(
      { providerID: "anthropic", modelID: "opus-4-6", variant: "default" },
      scopeKey,
    );

    const keyboard = keyboardManager.getKeyboard(scopeKey);
    expect(keyboard).toBeDefined();
    expect(getButtonText(keyboard!.keyboard[1][0])).toContain("opus");

    contextStateManager.clear(scopeKey);
    keyboardManager.clearScope(scopeKey);
  });

  it("keeps the local model variant in sync on variant-only updates", () => {
    const scopeKey = "-100123:57";
    keyboardManager.updateAgent("build", scopeKey);
    keyboardManager.updateModel(
      { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
      scopeKey,
    );
    keyboardManager.updateVariant("high", scopeKey);

    const state = keyboardManager.getState(scopeKey);
    expect(state?.currentModel.variant).toBe("high");
    expect(state?.variantName).toBe("💡 High");

    const keyboard = keyboardManager.getKeyboard(scopeKey);
    expect(keyboard).toBeDefined();

    contextStateManager.clear(scopeKey);
    keyboardManager.clearScope(scopeKey);
  });

  it("mirrors shared context into local state instead of serving stale null", () => {
    const scopeKey = "-100123:58";
    keyboardManager.updateAgent("build", scopeKey);
    keyboardManager.updateModel(
      { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
      scopeKey,
    );
    keyboardManager.updateContext(9_000, 100_000, scopeKey);

    expect(keyboardManager.getState(scopeKey)?.contextInfo).toEqual({
      tokensUsed: 9_000,
      tokensLimit: 100_000,
    });

    keyboardManager.clearContext(scopeKey);
    expect(keyboardManager.getState(scopeKey)?.contextInfo).toBeNull();

    contextStateManager.clear(scopeKey);
    keyboardManager.clearScope(scopeKey);
  });

  it("retries the same markup after a failed carrier send", async () => {
    const scopeKey = "-100123:59";
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValue({ message_id: 8 });
    const deleteMessage = vi.fn().mockResolvedValue(true);
    keyboardManager.initialize({ sendMessage, deleteMessage } as never, -100123, scopeKey);
    keyboardManager.updateAgent("build", scopeKey);
    keyboardManager.updateModel(
      { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
      scopeKey,
    );
    contextStateManager.update(1_000, 100_000, scopeKey);

    await keyboardManager.sendKeyboardUpdate(-100123, scopeKey, { force: true });
    expect(sendMessage).toHaveBeenCalledTimes(1);

    // The optimistic fingerprint must roll back so the retry resends.
    await keyboardManager.sendKeyboardUpdate(-100123, scopeKey, { force: true });
    expect(sendMessage).toHaveBeenCalledTimes(2);

    keyboardManager.clearScope(scopeKey);
  });

  it("does not let a forced no-op restart the debounce window", async () => {
    vi.useFakeTimers();
    try {
      const scopeKey = "-100123:60";
      const sendMessage = vi.fn().mockResolvedValue({ message_id: 9 });
      const deleteMessage = vi.fn().mockResolvedValue(true);
      keyboardManager.initialize({ sendMessage, deleteMessage } as never, -100123, scopeKey);
      keyboardManager.updateAgent("build", scopeKey);
      keyboardManager.updateModel(
        { providerID: "openai", modelID: "gpt-5.4", variant: "default" },
        scopeKey,
      );
      contextStateManager.update(1_000, 100_000, scopeKey);

      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey);
      expect(sendMessage).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1_500);
      // Nothing changed: forced repost stays silent without touching debounce.
      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey, { force: true });
      expect(sendMessage).toHaveBeenCalledTimes(1);

      // 600ms later (2.1s after the real delivery) new numbers go out
      // immediately instead of being throttled by the no-op.
      await vi.advanceTimersByTimeAsync(600);
      contextStateManager.update(5_000, 100_000, scopeKey);
      await keyboardManager.sendKeyboardUpdate(-100123, scopeKey);
      expect(sendMessage).toHaveBeenCalledTimes(2);

      keyboardManager.clearScope(scopeKey);
    } finally {
      vi.useRealTimers();
    }
  });
});
