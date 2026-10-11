export const BOT_COMMAND = {
  START: "start",
  HELP: "help",
  STATUS: "status",
  NEW: "new",
  ABORT: "abort",
  SESSIONS: "sessions",
  RECENT: "recent",
  LAST: "last",
  TTS: "tts",
  PROJECTS: "projects",
  OPEN: "open",
  TASK: "task",
  TASKLIST: "tasklist",
  RENAME: "rename",
  COMMANDS: "commands",
  SKILLS: "skills",
  OPENCODE_START: "opencode_start",
  OPENCODE_STOP: "opencode_stop",
  RELOAD: "reload",
} as const;

export type BotCommandName = (typeof BOT_COMMAND)[keyof typeof BOT_COMMAND];

export const DM_ALLOWED_COMMANDS: readonly BotCommandName[] = [
  BOT_COMMAND.START,
  BOT_COMMAND.HELP,
  BOT_COMMAND.STATUS,
  BOT_COMMAND.RECENT,
  BOT_COMMAND.OPENCODE_START,
  BOT_COMMAND.OPENCODE_STOP,
];
