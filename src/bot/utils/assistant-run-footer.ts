import { getAgentDisplayName } from "../../agent/types.js";
import type { AssistantRunInfo } from "../assistant-run-state.js";

/** Short clock for the final-answer footer: `2.5s`, `1m 30s`, `2h 3m`. */
function formatRunElapsed(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${(Math.max(0, elapsedMs) / 1000).toFixed(1)}s`;
}

export interface AssistantRunFooterFallback {
  agentName?: string;
  modelID?: string;
}

/**
 * Marks the message as the final answer: `Build · opus-4-6 · 1m 30s`.
 * Falls back to the scope's stored agent/model (without duration) when the
 * run record is gone, so the final message never goes out naked.
 */
export function formatAssistantRunFooter(
  run: AssistantRunInfo | null,
  fallback: AssistantRunFooterFallback = {},
  finishedAt = Date.now(),
): string {
  const agentName = run?.configuredAgent ?? fallback.agentName;
  const agent = agentName ? getAgentDisplayName(agentName) : "🤖 Assistant";
  const model = run?.configuredModelID ?? fallback.modelID ?? "unknown";
  if (!run) {
    return `${agent} · ${model}`;
  }
  return `${agent} · ${model} · ${formatRunElapsed(finishedAt - run.startedAt)}`;
}
