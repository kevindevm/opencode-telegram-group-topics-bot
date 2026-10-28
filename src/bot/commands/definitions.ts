import type { I18nKey } from "../../i18n/en.js";
import { t } from "../../i18n/index.js";
import { BOT_COMMAND, DM_ALLOWED_COMMANDS } from "./constants.js";

/**
 * Centralized bot commands definitions
 * Used for both Telegram API setMyCommands and command handler registration
 */

export interface BotCommandDefinition {
  command: string;
  description: string;
}

interface BotCommandI18nDefinition {
  command: string;
  descriptionKey: I18nKey;
}

/**
 * List of all bot commands
 * Update this array when adding new commands
 */
const COMMAND_DEFINITIONS: BotCommandI18nDefinition[] = [
  { command: BOT_COMMAND.STATUS, descriptionKey: "cmd.description.status" },
  { command: BOT_COMMAND.NEW, descriptionKey: "cmd.description.new" },
  { command: BOT_COMMAND.ABORT, descriptionKey: "cmd.description.abort" },
  { command: BOT_COMMAND.SESSIONS, descriptionKey: "cmd.description.sessions" },
  { command: BOT_COMMAND.RECENT, descriptionKey: "cmd.description.recent" },
  { command: BOT_COMMAND.LAST, descriptionKey: "cmd.description.last" },
  { command: BOT_COMMAND.TTS, descriptionKey: "cmd.description.tts" },
  { command: BOT_COMMAND.PROJECTS, descriptionKey: "cmd.description.projects" },
  { command: BOT_COMMAND.OPEN, descriptionKey: "cmd.description.open" },
  { command: BOT_COMMAND.TASK, descriptionKey: "cmd.description.task" },
  { command: BOT_COMMAND.TASKLIST, descriptionKey: "cmd.description.tasklist" },
  { command: BOT_COMMAND.QUEUE, descriptionKey: "cmd.description.queue" },
  { command: BOT_COMMAND.TRUST, descriptionKey: "cmd.description.trust" },
  { command: BOT_COMMAND.RETRY, descriptionKey: "cmd.description.retry" },
  { command: BOT_COMMAND.DIFF, descriptionKey: "cmd.description.diff" },
  { command: BOT_COMMAND.COMMIT, descriptionKey: "cmd.description.commit" },
  { command: BOT_COMMAND.COST, descriptionKey: "cmd.description.cost" },
  { command: BOT_COMMAND.CLOSE, descriptionKey: "cmd.description.close" },
  { command: BOT_COMMAND.CLEANUP, descriptionKey: "cmd.description.cleanup" },
  { command: BOT_COMMAND.FORK, descriptionKey: "cmd.description.fork" },
  { command: BOT_COMMAND.SHARE, descriptionKey: "cmd.description.share" },
  { command: BOT_COMMAND.SAVED, descriptionKey: "cmd.description.saved" },
  { command: BOT_COMMAND.RENAME, descriptionKey: "cmd.description.rename" },
  { command: BOT_COMMAND.COMMANDS, descriptionKey: "cmd.description.commands" },
  { command: BOT_COMMAND.SKILLS, descriptionKey: "cmd.description.skills" },
  { command: BOT_COMMAND.OPENCODE_START, descriptionKey: "cmd.description.opencode_start" },
  { command: BOT_COMMAND.OPENCODE_STOP, descriptionKey: "cmd.description.opencode_stop" },
  { command: BOT_COMMAND.RELOAD, descriptionKey: "cmd.description.reload" },
  { command: BOT_COMMAND.REFRESH, descriptionKey: "cmd.description.refresh" },
  { command: BOT_COMMAND.DISPLAY, descriptionKey: "cmd.description.display" },
  { command: BOT_COMMAND.HELP, descriptionKey: "cmd.description.help" },
];

export function getLocalizedBotCommands(): BotCommandDefinition[] {
  return COMMAND_DEFINITIONS.map(({ command, descriptionKey }) => ({
    command,
    description: t(descriptionKey),
  }));
}

export function getLocalizedDmBotCommands(): BotCommandDefinition[] {
  const allowedCommands = new Set<string>(DM_ALLOWED_COMMANDS);
  const commands = getLocalizedBotCommands().filter((command) =>
    allowedCommands.has(command.command),
  );

  return [
    {
      command: BOT_COMMAND.START,
      description: t("help.dm.command_start"),
    },
    ...commands,
  ];
}

export const BOT_COMMANDS: BotCommandDefinition[] = getLocalizedBotCommands();
