import { describe, expect, it } from "vitest";
import { formatAssistantRunFooter } from "../../../src/bot/utils/assistant-run-footer.js";

describe("bot/utils/assistant-run-footer", () => {
  it("formats agent, short model id, and seconds", () => {
    const footer = formatAssistantRunFooter(
      {
        sessionId: "s1",
        startedAt: 1000,
        configuredAgent: "build",
        configuredProviderID: "openai",
        configuredModelID: "gpt-5",
      },
      {},
      3500,
    );

    expect(footer).toBe("🛠️ Build · gpt-5 · 2.5s");
  });

  it("formats minutes and seconds past the minute", () => {
    const footer = formatAssistantRunFooter(
      {
        sessionId: "s1",
        startedAt: 0,
        configuredAgent: "build",
        configuredProviderID: "anthropic",
        configuredModelID: "opus-4-6",
      },
      {},
      90_000,
    );

    expect(footer).toBe("🛠️ Build · opus-4-6 · 1m 30s");
  });

  it("falls back to stored scope values without duration when the run is gone", () => {
    const footer = formatAssistantRunFooter(null, {
      agentName: "build",
      modelID: "opus-4-6",
    });

    expect(footer).toBe("🛠️ Build · opus-4-6");
  });

  it("falls back to placeholders when nothing is known", () => {
    expect(formatAssistantRunFooter(null)).toBe("🤖 Assistant · unknown");
  });
});
