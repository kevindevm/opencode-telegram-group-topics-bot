import { logger } from "../utils/logger.js";

export interface AssistantRunStartInfo {
  startedAt: number;
  configuredAgent?: string;
  configuredProviderID?: string;
  configuredModelID?: string;
}

export interface AssistantRunInfo extends AssistantRunStartInfo {
  sessionId: string;
}

class AssistantRunState {
  private readonly runs = new Map<string, AssistantRunInfo>();

  /** Upper bound so finished runs of dead sessions cannot grow forever. */
  private static readonly MAX_RUNS = 500;

  startRun(sessionId: string, info: AssistantRunStartInfo): void {
    if (!sessionId) {
      return;
    }

    // Bounded so finished runs of dead sessions cannot grow forever.
    while (this.runs.size >= AssistantRunState.MAX_RUNS && !this.runs.has(sessionId)) {
      const oldest = this.runs.keys().next();
      if (oldest.done) {
        break;
      }
      this.runs.delete(oldest.value);
    }

    this.runs.set(sessionId, {
      sessionId,
      startedAt: info.startedAt,
      configuredAgent: info.configuredAgent,
      configuredProviderID: info.configuredProviderID,
      configuredModelID: info.configuredModelID,
    });

    logger.debug("[AssistantRunState] Started run", {
      sessionId,
      agent: info.configuredAgent,
      providerID: info.configuredProviderID,
      modelID: info.configuredModelID,
    });
  }

  getRun(sessionId: string): AssistantRunInfo | null {
    const run = this.runs.get(sessionId);
    return run ? { ...run } : null;
  }

  finishRun(sessionId: string, reason: string): AssistantRunInfo | null {
    const run = this.runs.get(sessionId) ?? null;
    if (!run) {
      return null;
    }

    // Consumed, not kept: only the last message of a turn takes the footer,
    // and the delivery layer only finishes the run for that message. Deleting
    // here guarantees a stale run can never leak its clock into a later,
    // unrelated delivery (the timer visibly kept growing). A delivery that
    // finds no run falls back to `agent · model` without duration.
    this.runs.delete(sessionId);

    logger.debug("[AssistantRunState] Finished run", { sessionId, reason });
    return { ...run };
  }

  clearRun(sessionId: string, reason: string): void {
    if (!this.runs.delete(sessionId)) {
      return;
    }

    logger.debug("[AssistantRunState] Cleared run", { sessionId, reason });
  }

  clearAll(reason: string): void {
    if (this.runs.size === 0) {
      return;
    }

    logger.debug("[AssistantRunState] Cleared all runs", { count: this.runs.size, reason });
    this.runs.clear();
  }

  __resetForTests(): void {
    this.runs.clear();
  }
}

export const assistantRunState = new AssistantRunState();
