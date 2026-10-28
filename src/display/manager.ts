import { InlineKeyboard } from "grammy";
import { config } from "../config.js";
import {
  getDisplayOverrides,
  getScopeDisplayOverride,
  setDisplayOverride,
  setScopeDisplayOverride,
} from "../settings/manager.js";
import { getScopeFromKey, GLOBAL_SCOPE_KEY, SCOPE_CONTEXT } from "../bot/scope.js";
import { t } from "../i18n/index.js";
import { logger } from "../utils/logger.js";

export const DISPLAY_FLAG = {
  THINKING: "thinking",
  TOOL_CALLS: "toolCalls",
  TOOL_FILES: "toolFiles",
  CODE_BLOCKS: "codeBlocks",
  BACKGROUND: "background",
  PC_MIRROR: "pcMirror",
  LINK_PREVIEWS: "linkPreviews",
} as const;

export type DisplayFlag = (typeof DISPLAY_FLAG)[keyof typeof DISPLAY_FLAG];

export const DISPLAY_CALLBACK_PREFIX = "display:toggle:";
export const DISPLAY_AGENTS_CALLBACK = "display:agents";

interface DisplayFlagDefinition {
  key: DisplayFlag;
  labelKey: Parameters<typeof t>[0];
  defaultVisible: () => boolean;
}

const DISPLAY_FLAG_DEFINITIONS: DisplayFlagDefinition[] = [
  {
    key: DISPLAY_FLAG.THINKING,
    labelKey: "display.flag.thinking",
    defaultVisible: () => !config.bot.hideThinkingMessages,
  },
  {
    key: DISPLAY_FLAG.TOOL_CALLS,
    labelKey: "display.flag.toolCalls",
    defaultVisible: () => !config.bot.hideToolCallMessages,
  },
  {
    key: DISPLAY_FLAG.TOOL_FILES,
    labelKey: "display.flag.toolFiles",
    defaultVisible: () => !config.bot.hideToolFileMessages,
  },
  {
    key: DISPLAY_FLAG.CODE_BLOCKS,
    labelKey: "display.flag.codeBlocks",
    defaultVisible: () => config.bot.codeBlocksInText,
  },
  {
    key: DISPLAY_FLAG.BACKGROUND,
    labelKey: "display.flag.background",
    defaultVisible: () => config.bot.showBackgroundNotifications,
  },
  {
    key: DISPLAY_FLAG.PC_MIRROR,
    labelKey: "display.flag.pcMirror",
    defaultVisible: () => config.bot.showPcUserMirror,
  },
  {
    key: DISPLAY_FLAG.LINK_PREVIEWS,
    labelKey: "display.flag.linkPreviews",
    defaultVisible: () => config.bot.showLinkPreviews,
  },
];

function findFlagDefinition(flag: string): DisplayFlagDefinition | undefined {
  return DISPLAY_FLAG_DEFINITIONS.find((definition) => definition.key === flag);
}

/**
 * Effective visibility: per-topic override wins, then the global /display
 * override, then the env default.
 */
export function isDisplayVisible(flag: DisplayFlag, scopeKey?: string): boolean {
  if (scopeKey) {
    const scoped = getScopeDisplayOverride(scopeKey, flag);
    if (scoped !== undefined) {
      return scoped;
    }
  }

  const overrides = getDisplayOverrides();
  if (flag in overrides) {
    return overrides[flag] === true;
  }

  const definition = findFlagDefinition(flag);
  if (!definition) {
    logger.warn(`[DisplayManager] Unknown display flag: ${flag}`);
    return true;
  }

  return definition.defaultVisible();
}

/**
 * Copies the parent topic's explicit display overrides onto a fresh child
 * scope (e.g. a subagent transcript topic), so the child renders like its
 * parent instead of falling back to globals. Later parent changes do not
 * propagate: each topic stays independently tunable via /display.
 */
export function inheritDisplayOverrides(parentScopeKey: string, childScopeKey: string): void {
  for (const definition of DISPLAY_FLAG_DEFINITIONS) {
    const value = getScopeDisplayOverride(parentScopeKey, definition.key);
    if (value !== undefined) {
      setScopeDisplayOverride(childScopeKey, definition.key, value);
    }
  }
}

/** Returns true when the flag was toggled, false for unknown flags. */
export function toggleDisplayFlag(flag: string, scopeKey?: string): boolean {
  const definition = findFlagDefinition(flag);
  if (!definition) {
    return false;
  }

  const next = !isDisplayVisible(definition.key, scopeKey);
  if (scopeKey) {
    setScopeDisplayOverride(scopeKey, definition.key, next);
  } else {
    setDisplayOverride(definition.key, next);
  }
  logger.info(
    `[DisplayManager] Display flag ${definition.key} set to visible=${next} (scope=${scopeKey ?? "global"})`,
  );
  return true;
}

export function parseDisplayCallback(data: string): string | null {
  if (!data.startsWith(DISPLAY_CALLBACK_PREFIX)) {
    return null;
  }

  const flag = data.slice(DISPLAY_CALLBACK_PREFIX.length);
  return findFlagDefinition(flag) ? flag : null;
}

export function buildDisplayKeyboard(scopeKey?: string, currentAgent?: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  DISPLAY_FLAG_DEFINITIONS.forEach((definition) => {
    const visible = isDisplayVisible(definition.key, scopeKey);
    keyboard.text(`${t(definition.labelKey)} ${visible ? "✅" : "❌"}`, `${DISPLAY_CALLBACK_PREFIX}${definition.key}`);
    keyboard.row();
  });

  // Agent shortcut: opens the agent picker for this same chat/topic.
  // The ❌/✅ Cancel button itself is appended by replyWithInlineMenu.
  const agentLabel = currentAgent
    ? t("display.button.agents", { name: currentAgent })
    : t("display.button.agents_fallback");
  keyboard.text(agentLabel, DISPLAY_AGENTS_CALLBACK);

  return keyboard;
}

export function formatDisplayMenu(scopeKey?: string): string {
  // Only real topic scopes get the topic title: "global" (and DM/general
  // keys) keep the chat-level title.
  const scope = scopeKey && scopeKey !== GLOBAL_SCOPE_KEY ? getScopeFromKey(scopeKey) : null;
  const isTopic = scope?.context === SCOPE_CONTEXT.GROUP_TOPIC;
  return isTopic ? t("display.title_topic") : t("display.title");
}
