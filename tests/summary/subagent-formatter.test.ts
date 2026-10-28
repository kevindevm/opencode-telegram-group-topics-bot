import { describe, expect, it } from "vitest";
import { renderSubagentCards } from "../../src/summary/subagent-formatter.js";

describe("summary/subagent-formatter", () => {
  it("renders subagent cards with task, agent, model, and activity", () => {
    const rendered = renderSubagentCards([
      {
        cardId: "card-1",
        sessionId: "child-1",
        parentSessionId: "root-1",
        agent: "explore",
        description: "Inspect upstream diff",
        prompt: "Inspect upstream diff",
        status: "running",
        providerID: "openai",
        modelID: "gpt-5",
        currentTool: "read",
        currentToolInput: { filePath: "src/summary/aggregator.ts" },
        currentToolTitle: undefined,
        terminalMessage: undefined,
        updatedAt: Date.now(),
      },
    ]);

    expect(rendered).toContain("🧩 Task: Inspect upstream diff");
    expect(rendered).toContain("Agent: explore");
    expect(rendered).toContain("Model: openai/gpt-5");
    expect(rendered).toContain("read src/summary/aggregator.ts");
  });

  it("strips model markdown so plain-text cards show no markers", () => {
    const rendered = renderSubagentCards([
      {
        cardId: "card-1",
        sessionId: "child-1",
        parentSessionId: "root-1",
        agent: "explore",
        description: "**Descubierto** y *verificado*",
        prompt: "**Descubierto** y *verificado*",
        status: "running",
        providerID: "opencode",
        modelID: "big-pickle",
        currentTool: "read",
        currentToolInput: { filePath: "**src/index.ts**" },
        currentToolTitle: undefined,
        terminalMessage: undefined,
        updatedAt: Date.now(),
      },
    ]);

    expect(rendered).not.toContain("**");
    expect(rendered).toContain("Descubierto y verificado");
    expect(rendered).toContain("src/index.ts");
  });

  it("renders paths relative to the session worktree when provided", () => {
    const rendered = renderSubagentCards(
      [
        {
          cardId: "card-1",
          sessionId: "child-1",
          parentSessionId: "root-1",
          agent: "build",
          description: "Fix the offer retry",
          prompt: "Fix the offer retry",
          status: "running",
          providerID: "openai",
          modelID: "gpt-5",
          currentTool: "edit",
          currentToolInput: {
            filePath: "E:/Repos/opencode-telegram-group-topics-bot/src/tool/background-offer.ts",
          },
          currentToolTitle: undefined,
          terminalMessage: undefined,
          updatedAt: Date.now(),
        },
      ],
      "E:/Repos/opencode-telegram-group-topics-bot",
    );

    expect(rendered).toContain("edit src/tool/background-offer.ts");
    expect(rendered).not.toContain("E:/Repos");
  });
});
