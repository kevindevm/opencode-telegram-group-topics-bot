import { t } from "../i18n/index.js";
import type { SubagentInfo, ToolInfo } from "./aggregator.js";
import { formatCompactToolInfo } from "./formatter.js";

/**
 * Parent cards and transcript lines render as plain text: model-written
 * fields (descriptions, tool titles) often carry `**bold**` or other
 * markdown that would show literally, so it is stripped before display.
 */
function stripCardMarkdown(text: string): string {
  let result = text.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  result = result.replace(/(\*\*|__)(.*?)\1/g, "$2");
  result = result.replace(/(^|[\s([{*])\*([^*\n]+?)\*(?=[\s).,\]}!?:;]|$)/g, "$1$2");
  result = result.replace(/(^|[\s([{])_([^_\n]+?)_(?=[\s).,\]}!?:;]|$)/g, "$1$2");
  result = result.replace(/~~(.+?)~~/g, "$1");
  result = result.replace(/`{1,3}([^`\n]*)`{1,3}/g, "$1");
  return result.replace(/\s+/g, " ").trim();
}

function formatModelDisplayName(providerID?: string, modelID?: string): string {
  if (providerID && modelID) {
    return `${providerID}/${modelID}`;
  }

  return t("pinned.unknown");
}

function formatToolStep(subagent: SubagentInfo): string {
  if (!subagent.currentTool) {
    return "";
  }

  const toolInfo: ToolInfo = {
    sessionId: subagent.sessionId ?? subagent.parentSessionId,
    messageId: subagent.cardId,
    callId: subagent.cardId,
    tool: subagent.currentTool,
    state: {
      status: "running",
      input: subagent.currentToolInput ?? {},
      title: subagent.currentToolTitle,
      metadata: {},
      time: { start: subagent.updatedAt },
    },
    input: subagent.currentToolInput,
    title: subagent.currentToolTitle,
    metadata: {},
    hasFileAttachment: false,
  };

  const formatted = formatCompactToolInfo(toolInfo, 128, "").trim();
  const firstSpaceIndex = formatted.indexOf(" ");
  if (firstSpaceIndex >= 0 && formatted.slice(firstSpaceIndex + 1) === subagent.currentTool) {
    return "";
  }

  return stripCardMarkdown(formatted);
}

function formatSubagentActivity(subagent: SubagentInfo): string {
  if (subagent.status === "completed") {
    return `✅ ${t("subagent.completed")}`;
  }

  if (subagent.status === "error") {
    const message = subagent.terminalMessage?.trim() || t("subagent.failed");
    return `❌ ${stripCardMarkdown(message)}`;
  }

  const toolStep = formatToolStep(subagent);
  if (toolStep) {
    return toolStep;
  }

  return `⚙️ ${t("subagent.working")}`;
}

function formatSubagentCard(subagent: SubagentInfo): string {
  const modelName = formatModelDisplayName(subagent.providerID, subagent.modelID);
  const lines = [
    `🧩 ${t("subagent.line.task", { task: stripCardMarkdown(subagent.description) })}`,
    t("subagent.line.agent", { agent: stripCardMarkdown(subagent.agent) || t("pinned.unknown") }),
    t("pinned.line.model", { model: modelName }),
    "",
    formatSubagentActivity(subagent),
  ];

  return lines.join("\n");
}

export function renderSubagentCards(subagents: SubagentInfo[]): string {
  if (subagents.length === 0) {
    return "";
  }

  return subagents.map((subagent) => formatSubagentCard(subagent)).join("\n\n");
}
