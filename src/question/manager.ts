import { Question, QuestionState, QuestionAnswer } from "./types.js";
import { logger } from "../utils/logger.js";

class QuestionManager {
  private stateByScope: Map<string, QuestionState> = new Map();

  private createDefaultState(): QuestionState {
    return {
      questions: [],
      currentIndex: 0,
      selectedOptions: new Map(),
      customAnswers: new Map(),
      customInputQuestionIndex: null,
      activeMessageId: null,
      messageIds: [],
      isActive: false,
      requestID: null,
    };
  }

  private peekState(scopeKey: string): QuestionState | undefined {
    return this.stateByScope.get(scopeKey);
  }

  private getState(scopeKey: string): QuestionState {
    const state = this.stateByScope.get(scopeKey);
    if (state) {
      return state;
    }

    const next = this.createDefaultState();
    this.stateByScope.set(scopeKey, next);
    return next;
  }

  startQuestions(questions: Question[], requestID: string, scopeKey: string = "global"): void {
    const state = this.getState(scopeKey);

    logger.debug(
      `[QuestionManager] startQuestions called: isActive=${state.isActive}, currentQuestions=${state.questions.length}, newQuestions=${questions.length}, requestID=${requestID}`,
    );

    if (state.isActive) {
      logger.info(`[QuestionManager] Poll already active! Forcing reset before starting new poll.`);
      this.clear(scopeKey);
    }

    logger.info(
      `[QuestionManager] Starting new poll with ${questions.length} questions, requestID=${requestID}`,
    );

    this.stateByScope.set(scopeKey, {
      questions,
      currentIndex: 0,
      selectedOptions: new Map(),
      customAnswers: new Map(),
      customInputQuestionIndex: null,
      activeMessageId: null,
      messageIds: [],
      isActive: true,
      requestID,
    });
  }

  getRequestID(scopeKey: string = "global"): string | null {
    return this.peekState(scopeKey)?.requestID ?? null;
  }

  getCurrentQuestion(scopeKey: string = "global"): Question | null {
    const state = this.peekState(scopeKey);
    if (!state || state.currentIndex >= state.questions.length) {
      return null;
    }

    return state.questions[state.currentIndex];
  }

  selectOption(questionIndex: number, optionIndex: number, scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (!state || !state.isActive) {
      return;
    }

    const question = state.questions[questionIndex];
    if (!question) {
      return;
    }

    const selected = state.selectedOptions.get(questionIndex) || new Set();

    if (question.multiple) {
      if (selected.has(optionIndex)) {
        selected.delete(optionIndex);
      } else {
        selected.add(optionIndex);
      }
    } else {
      selected.clear();
      selected.add(optionIndex);
    }

    state.selectedOptions.set(questionIndex, selected);

    logger.debug(
      `[QuestionManager] Selected options for question ${questionIndex}: ${Array.from(selected).join(", ")}`,
    );
  }

  getSelectedOptions(questionIndex: number, scopeKey: string = "global"): Set<number> {
    return this.peekState(scopeKey)?.selectedOptions.get(questionIndex) || new Set();
  }

  getSelectedAnswer(questionIndex: number, scopeKey: string = "global"): string {
    const state = this.peekState(scopeKey);
    if (!state) {
      return "";
    }
    const question = state.questions[questionIndex];
    if (!question) {
      return "";
    }

    const selected = state.selectedOptions.get(questionIndex) || new Set();
    const options = Array.from(selected)
      .map((idx) => question.options[idx])
      .filter((opt) => opt)
      .map((opt) => `* ${opt.label}: ${opt.description}`);

    return options.join("\n");
  }

  setCustomAnswer(questionIndex: number, answer: string, scopeKey: string = "global"): void {
    logger.debug(
      `[QuestionManager] Custom answer received for question ${questionIndex}: ${answer}`,
    );
    this.peekState(scopeKey)?.customAnswers.set(questionIndex, answer);
  }

  getCustomAnswer(questionIndex: number, scopeKey: string = "global"): string | undefined {
    return this.peekState(scopeKey)?.customAnswers.get(questionIndex);
  }

  hasCustomAnswer(questionIndex: number, scopeKey: string = "global"): boolean {
    return this.peekState(scopeKey)?.customAnswers.has(questionIndex) ?? false;
  }

  nextQuestion(scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (!state) {
      return;
    }
    state.currentIndex++;
    state.customInputQuestionIndex = null;
    state.activeMessageId = null;

    logger.debug(
      `[QuestionManager] Moving to next question: ${state.currentIndex}/${state.questions.length}`,
    );
  }

  hasNextQuestion(scopeKey: string = "global"): boolean {
    const state = this.peekState(scopeKey);
    return state ? state.currentIndex < state.questions.length : false;
  }

  getCurrentIndex(scopeKey: string = "global"): number {
    return this.peekState(scopeKey)?.currentIndex ?? 0;
  }

  getTotalQuestions(scopeKey: string = "global"): number {
    return this.peekState(scopeKey)?.questions.length ?? 0;
  }

  addMessageId(messageId: number, scopeKey: string = "global"): void {
    this.peekState(scopeKey)?.messageIds.push(messageId);
  }

  setActiveMessageId(messageId: number, scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (state) {
      state.activeMessageId = messageId;
    }
  }

  clearActiveMessage(scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (state) {
      state.activeMessageId = null;
    }
  }

  getActiveMessageId(scopeKey: string = "global"): number | null {
    return this.peekState(scopeKey)?.activeMessageId ?? null;
  }

  isActiveMessage(messageId: number | null, scopeKey: string = "global"): boolean {
    const state = this.peekState(scopeKey);
    return (
      Boolean(state?.isActive) && state?.activeMessageId !== null && messageId === state?.activeMessageId
    );
  }

  startCustomInput(questionIndex: number, scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (!state || !state.isActive || !state.questions[questionIndex]) {
      return;
    }

    state.customInputQuestionIndex = questionIndex;
  }

  clearCustomInput(scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (state) {
      state.customInputQuestionIndex = null;
    }
  }

  isWaitingForCustomInput(questionIndex: number, scopeKey: string = "global"): boolean {
    return this.peekState(scopeKey)?.customInputQuestionIndex === questionIndex;
  }

  getMessageIds(scopeKey: string = "global"): number[] {
    return [...(this.peekState(scopeKey)?.messageIds ?? [])];
  }

  isActive(scopeKey: string = "global"): boolean {
    const state = this.peekState(scopeKey);
    logger.debug(
      `[QuestionManager] isActive check: ${state?.isActive ?? false}, questions=${state?.questions.length ?? 0}, currentIndex=${state?.currentIndex ?? 0}`,
    );
    return state?.isActive ?? false;
  }

  cancel(scopeKey: string = "global"): void {
    const state = this.peekState(scopeKey);
    if (!state) {
      return;
    }
    logger.info("[QuestionManager] Poll cancelled");
    state.isActive = false;
    state.customInputQuestionIndex = null;
    state.activeMessageId = null;
  }

  clear(scopeKey: string = "global"): void {
    this.stateByScope.delete(scopeKey);
  }

  getAllAnswers(scopeKey: string = "global"): QuestionAnswer[] {
    const state = this.peekState(scopeKey);
    if (!state) {
      return [];
    }
    const answers: QuestionAnswer[] = [];

    for (let i = 0; i < state.questions.length; i++) {
      const question = state.questions[i];
      const selectedAnswer = this.getSelectedAnswer(i, scopeKey);
      const customAnswer = this.getCustomAnswer(i, scopeKey);

      const finalAnswer = customAnswer || selectedAnswer;

      if (finalAnswer) {
        answers.push({
          question: question.question,
          answer: finalAnswer,
        });
      }
    }

    return answers;
  }
}

export const questionManager = new QuestionManager();
