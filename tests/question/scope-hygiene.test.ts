import { describe, expect, it } from "vitest";
import { questionManager } from "../../src/question/manager.js";
import type { Question } from "../../src/question/types.js";

const SAMPLE: Question = {
  question: "Pick one option",
  header: "single",
  options: [
    { label: "Yes", description: "accept" },
    { label: "No", description: "decline" },
  ],
};

function scopeSize(): number {
  const manager = questionManager as unknown as { stateByScope: Map<string, unknown> };
  return manager.stateByScope.size;
}

describe("question/manager scope hygiene", () => {
  it("does not materialize scope entries on read-only access", () => {
    const before = scopeSize();

    expect(questionManager.isActive("ghost-scope")).toBe(false);
    expect(questionManager.getRequestID("ghost-scope")).toBeNull();
    expect(questionManager.getCurrentQuestion("ghost-scope")).toBeNull();
    expect(questionManager.getSelectedOptions(0, "ghost-scope")).toEqual(new Set());
    expect(questionManager.getSelectedAnswer(0, "ghost-scope")).toBe("");
    expect(questionManager.getMessageIds("ghost-scope")).toEqual([]);
    expect(questionManager.getAllAnswers("ghost-scope")).toEqual([]);
    expect(questionManager.hasNextQuestion("ghost-scope")).toBe(false);

    expect(scopeSize()).toBe(before);
  });

  it("ignores mutations for unknown scopes instead of creating entries", () => {
    const before = scopeSize();

    questionManager.selectOption(0, 0, "ghost-scope");
    questionManager.setCustomAnswer(0, "x", "ghost-scope");
    questionManager.nextQuestion("ghost-scope");
    questionManager.addMessageId(1, "ghost-scope");
    questionManager.setActiveMessageId(1, "ghost-scope");
    questionManager.clearActiveMessage("ghost-scope");
    questionManager.clearCustomInput("ghost-scope");
    questionManager.startCustomInput(0, "ghost-scope");
    questionManager.cancel("ghost-scope");

    expect(scopeSize()).toBe(before);
  });

  it("clear() deletes the scope entry instead of keeping an empty one", () => {
    questionManager.startQuestions([SAMPLE], "req-hygiene", "hygiene-scope");
    expect(questionManager.isActive("hygiene-scope")).toBe(true);

    questionManager.clear("hygiene-scope");

    expect(questionManager.isActive("hygiene-scope")).toBe(false);
    expect(questionManager.getRequestID("hygiene-scope")).toBeNull();
    const manager = questionManager as unknown as { stateByScope: Map<string, unknown> };
    expect(manager.stateByScope.has("hygiene-scope")).toBe(false);
  });
});
