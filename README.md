# OpenCode Telegram Group Topics Bot

[![CI](https://github.com/shanekunz/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/shanekunz/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/shanekunz/opencode-telegram-group-topics-bot)](https://github.com/shanekunz/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/opencode-telegram-group-topics-bot)](https://www.npmjs.com/package/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/opencode-telegram-group-topics-bot)](https://www.npmjs.com/package/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: English (`en`), Deutsch (`de`), Español (`es`), Français (`fr`), Bahasa Indonesia (`id`), Русский (`ru`), Türkçe (`tr`), [简体中文 (`zh-CN`)](./README.zh-CN.md)

A Telegram bot ([grammy](https://grammy.dev/), Node.js 20+) that turns one Telegram supergroup into a **multi-session mobile client for [OpenCode](https://opencode.ai)**: the **General** topic is the control lane, and each OpenCode session gets its own forum topic with live streaming, a pinned status dashboard, a prompt queue, permission/question flows, and a ⏪ send-to-background button for long shell commands.

This project is a fork of [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) by Ruslan Grinev. Use upstream for the simpler single-chat workflow; use this fork for parallel sessions in forum topics, controllable from your phone.

No open ports, no exposed web UI. The bot talks only to your local OpenCode server and the Telegram Bot API. OpenCode V1 and V2 servers are supported. One group usually maps to one repo; many session topics can run in parallel in one group, and many groups can stay active at the same time.

Fork sync notes: [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Contents

- [At a Glance](#at-a-glance)
- [Screenshots](#screenshots)
- [Features](#features)
- [Quick Start](#quick-start)
- [Daily Workflow](#daily-workflow)
- [Parallel Workloads and Telegram Rate Limits](#parallel-workloads-and-telegram-rate-limits)
- [Commands](#commands)
- [Background Button](#background-button)
- [Subagent Transcript Topics](#subagent-transcript-topics)
- [Display Menu](#display-menu)
- [Configuration](#configuration)
- [Releases](#releases)
- [Security](#security)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [Credits](#credits)
- [License](#license)

## At a Glance

- One Telegram group maps to one repo / project workspace.
- **General** is the control lane: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, status checks.
- Each new OpenCode session gets its own forum topic with its own session, model, agent, and display state.
- Long shell commands offer a ⏪ button that sends the session to the background so you can keep chatting.
- Each subagent streams into its own read-only transcript topic plus a live status card in the parent topic.
- Prompts typed on your PC are mirrored into the session topic as 🧑 messages, so both sides stay in sync.
- Optional TTS audio replies toggle globally with `/tts` and persist across restarts.
- DMs are for light control and status usage, not the main multi-session workflow.

## Screenshots

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Session topic with live assistant streaming" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Pinned status dashboard and reply keyboard" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Model picker with favorites" />
</p>

## Features

- **Topic-scoped sessions** — one forum topic per OpenCode session; General stays the control lane and never pins anything.
- **Live streaming** — assistant responses stream with thread-aware edits and fallback completion delivery.
- **⏪ Send to background** — long `bash`/`execute` commands offer a button that backgrounds the session via `session.background`.
- **🧩 Subagent transcript topics** — each subagent gets a read-only topic with the full live transcript; the parent keeps a compact status card.
- **Pinned dashboards** — per-topic pinned message with session, project, model, context usage, cost, and changed files.
- **Prompt queue** — prompts sent while a session is busy are queued, survive restarts, and support per-message cancel, move-to-front, and interrupt-and-run via `/queue`.
- **Permissions and questions** — interactive `allow once` / `always` / `reject` flows and question flows with buttons, custom text, and voice answers; per-session trust levels via `/trust ask|edits|all`.
- **Pickers and keyboard** — model, agent, variant, and context controls from the persistent keyboard, favorites first.
- **`/display` menu** — per-chat/topic show/hide toggles plus an agent shortcut and a Cancel button; overrides persist in `settings.json`.
- **Session management** — `/retry` the last prompt, `/diff`, `/commit`, `/cost` spend tracking with `BUDGET_ALERT_USD`, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, saved prompt shortcuts (`/saved`), custom commands (`/commands`), skills (`/skills`).
- **Scheduled tasks** — per-project scheduled topic via `/task` and `/tasklist` (pause/resume/run-now/logs).
- **Voice and files** — Whisper-compatible STT for voice/audio, optional global TTS (`/tts`), image/PDF/text attachments, diffs as files or inline code blocks.
- **Project browser** — `/open` and `/projects` with allowed-directory guards.
- **Server control** — OpenCode auto-start, remote `/opencode_start` / `/opencode_stop`, V2 config `/reload`.
- **Single-user access control**, no public ports (health endpoint binds to `127.0.0.1` only).
- **8 interface languages** with fallback to English.

## Quick Start

### 1. Prerequisites

- Node.js 20+
- OpenCode from [opencode.ai](https://opencode.ai) or [GitHub](https://github.com/sst/opencode)
- A Telegram bot from [@BotFather](https://t.me/BotFather)
- Your numeric Telegram user ID from [@userinfobot](https://t.me/userinfobot)

### 2. Create and Prepare the Telegram Group

1. Create a new Telegram **supergroup** for one OpenCode project/repository.
2. Add your bot to the group and make it an admin with **Manage Topics** permission.
3. Enable **Topics** in the group settings.
4. In [@BotFather](https://t.me/BotFather), run `/setprivacy` for the bot and choose **Disable**.
5. Keep the default **General** topic — that is the control lane.

### 3. Start OpenCode

Run OpenCode on the machine where the bot will live:

```bash
opencode serve
```

Default API URL: `http://localhost:4096` (V1) or `http://127.0.0.1:49374` (V2, set `OPENCODE_SERVER_VERSION=v2`).

### 4. Install the Bot

#### Option A: `npx`

```bash
npx opencode-telegram-group-topics-bot
```

#### Option B: Global install

```bash
npm install -g opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Option C: Run from source

```bash
git clone https://github.com/shanekunz/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` is the compiled CLI entrypoint produced by `npm run build`.

#### Option D: Docker

```bash
git clone https://github.com/shanekunz/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID
docker compose up -d --build
```

`.env` stays on the host. It is injected at runtime and is not copied into the image.

Config and runtime state live in the `opencode-group-topics-bot-data` volume (`OPENCODE_TELEGRAM_HOME=/app/data` inside the container).

**Linux** (OpenCode on the host at `127.0.0.1:4096`): the default compose file uses `network_mode: host`, so the container reaches your host OpenCode server and sees the same project paths.

**Docker Desktop** (macOS/Windows): host networking is unavailable, so use the override file, which reaches OpenCode through `host.docker.internal`:

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

On Docker Desktop the container cannot see host project paths or spawn `opencode` itself: run `opencode serve` on the host and prefer `/projects` paths that resolve inside the container (mount repos with an extra `volumes` entry if needed). `/opencode_start` and `/opencode_stop` are host-only features.

Stable releases are published to `ghcr.io/shanekunz/opencode-telegram-group-topics-bot:<version>` and `ghcr.io/shanekunz/opencode-telegram-group-topics-bot:latest` for `linux/amd64` and `linux/arm64`. Release candidates receive only their exact version tag.

#### Option E: Windows Service (NSSM, always-on)

For a 24/7 setup on Windows, run the bot as a native service with [NSSM](https://nssm.cc):

```powershell
# 1. Build once
npm install
npm run build

# 2. Register the service (elevated PowerShell, adjust paths)
nssm install OpenCodeTelegramBot "C:\Program Files\nodejs\node.exe" "E:\path\to\repo\dist\cli.js start --mode installed"
nssm set OpenCodeTelegramBot AppDirectory "E:\path\to\repo"
nssm set OpenCodeTelegramBot AppEnvironmentExtra "OPENCODE_TELEGRAM_HOME=C:\Users\<you>\AppData\Roaming\opencode-telegram-group-topics-bot"
nssm set OpenCodeTelegramBot Start SERVICE_AUTO_START

# 3. Start it
nssm start OpenCodeTelegramBot
```

Config then lives in `%APPDATA%\opencode-telegram-group-topics-bot\.env` (or wherever `OPENCODE_TELEGRAM_HOME` points). A scheduled task that runs `opencode pair` at logon keeps the CLI paired; the service itself manages the bot process and restarts it on failure.

### 5. Complete the Setup Wizard

The wizard asks for:

- interface language
- Telegram bot token
- allowed Telegram user ID
- OpenCode API URL
- optional OpenCode server username/password

### 6. First-Time Verification

1. DM the bot and run `/start`; confirm it replies.
2. In the group **General** topic, run `/start`, then `/status` to confirm OpenCode reachability.
3. Run `/projects` in **General** and pick the repo for this group.
4. Run `/new` in **General** to create a session topic.
5. Open the new topic and send a prompt.

If that works, the group workspace is ready.

## Daily Workflow

1. Start OpenCode with `opencode serve`, then start the bot.
2. Open the Telegram group and go to **General**.
3. Use `/projects` to confirm the selected repo.
4. Use `/new` to create a new session topic.
5. Work inside the topic thread; if a shell command runs long, tap ⏪ to send it to the background.
6. Use `/sessions` in **General** to revisit older session lanes.

## Parallel Workloads and Telegram Rate Limits

- This fork is designed for parallel work: many topic threads in one group, and many groups across projects.
- Telegram enforces message rate limits, especially when many topics receive updates at once.
- The bot slows or staggers Telegram updates when needed (see `SERVICE_MESSAGES_INTERVAL_SEC`, keep `>= 2`).
- OpenCode sessions keep running even if Telegram updates become less frequent — expect less real-time chatter per topic under heavy load, not lost work.

## Commands

Any plain text message in a session topic is treated as a prompt when no blocking interaction is active. Model, agent, variant, and context actions are available from the persistent bottom keyboard.

| Command           | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `/status`         | Server and session status                                                |
| `/new`            | Create a new session                                                     |
| `/abort`          | Abort current action                                                     |
| `/sessions`       | List sessions                                                            |
| `/recent`         | Browse recent sessions across projects                                   |
| `/last`           | Show latest session message                                              |
| `/tts`            | Toggle audio replies                                                     |
| `/projects`       | List projects                                                            |
| `/open`           | Add a project by browsing directories                                    |
| `/task`           | Create a scheduled task                                                  |
| `/tasklist`       | List scheduled tasks                                                     |
| `/queue`          | Show and manage the queued messages                                      |
| `/trust`          | Trust level for auto-approving permissions                               |
| `/retry`          | Resend the last prompt                                                   |
| `/diff`           | Show changed files in this session                                       |
| `/commit`         | Commit session changes with a message                                    |
| `/cost`           | Show session and daily spend                                             |
| `/close`          | Close this session topic                                                 |
| `/fork`           | Clone this session into a new topic                                      |
| `/share`          | Export this session transcript as a file                                 |
| `/saved`          | Saved prompt shortcuts                                                   |
| `/rename`         | Rename current session                                                   |
| `/commands`       | Custom commands                                                          |
| `/skills`         | Skills catalog                                                           |
| `/opencode_start` | Start OpenCode server                                                    |
| `/opencode_stop`  | Stop OpenCode server                                                     |
| `/reload`         | Reload the OpenCode server configuration (V2 only)                       |
| `/refresh`        | Refresh session information                                              |
| `/display`        | Display options for this chat (toggles + agent)                          |
| `/help`           | Help                                                                     |

`/start` is DM-only (bot handshake). Model/agent pickers are keyboard buttons rather than slash commands.

## Background Button

When a `bash`/`execute` tool keeps running longer than `BACKGROUND_OFFER_AFTER_SEC` (default 30s), the bot posts a ⏪ **Send to background** button in the session topic. Tapping it calls OpenCode's `session.background`: the command keeps running on the server while you keep chatting, and the normal completion flow delivers the result when it finishes.

- One offer per running session; it disappears if the command finishes first.
- Tune the delay with `BACKGROUND_OFFER_AFTER_SEC`.

## Subagent Transcript Topics

When the agent spawns subagents, each one gets its own read-only transcript topic (`🧩 <description>`) with the full live transcript, while the parent topic keeps a compact 🧩 status card. When the subagent finishes, its topic is renamed (✅/❌) and closed. Poll answers still work inside transcript topics; new prompts are redirected to the parent topic with a notice.

## Display Menu

`/display` opens a per-chat menu: it always applies to the chat/topic where you ran it (look for the "Scope: this chat/topic only" note in the menu title), never globally. It contains:

- Show/hide toggles for thinking, tool calls, tool files, code blocks, background notices, PC prompt mirror, and link previews.
- An agent shortcut row (`🤖 Agent: <name>`) that swaps the menu to the agent picker for the same chat/topic.
- A `❌ Cancel` button that closes the menu without changing anything.

Overrides persist per chat/topic in `settings.json`, so each session topic keeps its own display setup.

## Configuration

### Config Location

- Source mode stores config in the repository root.
- Installed mode stores config in the platform app-data directory.
- `OPENCODE_TELEGRAM_HOME` overrides both and forces a custom config directory.

Installed-mode config paths:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Environment Variables

| Variable | Description | Required | Default |
| -------- | ----------- | :------: | ------- |
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather | Yes | - |
| `TELEGRAM_ALLOWED_USER_ID` | Your numeric Telegram user ID | Yes | - |
| `TELEGRAM_PROXY_URL` | Proxy URL for Telegram API (SOCKS5/HTTP) | No | - |
| `OPENCODE_API_URL` | OpenCode server URL | No | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Server API version: `v1` or `v2` | No | `v1` |
| `OPENCODE_SERVER_USERNAME` | Server auth username | No | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Server auth password | No | - |
| `OPENCODE_MODEL_PROVIDER` | Default model provider | Yes | - |
| `OPENCODE_MODEL_ID` | Default model ID | Yes | - |
| `OPENCODE_AUTO_START` | Start a managed OpenCode server at bot startup when none is reachable | No | `true` |
| `BOT_LOCALE` | Bot UI language (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | No | `en` |
| `SESSIONS_LIST_LIMIT` | Sessions per page in `/sessions` | No | `10` |
| `PROJECTS_LIST_LIMIT` | Projects per page in `/projects` | No | `10` |
| `COMMANDS_LIST_LIMIT` | Commands per page in `/commands` | No | `10` |
| `OPEN_BROWSER_ROOTS` | Allowed root directories for `/open`, comma-separated | No | home directory |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Max execution time for a scheduled task, in minutes | No | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Scheduled task poll interval, in seconds | No | `30` |
| `BUDGET_ALERT_USD` | Daily spend alert in USD (`0` = off) | No | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Service message interval; keep `>= 2`, `0` = immediate (`TOOL_MESSAGES_INTERVAL_SEC` still works as a legacy alias) | No | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | Seconds of shell runtime before offering ⏪ send-to-background | No | `30` |
| `HIDE_THINKING_MESSAGES` | Hide `Thinking...` service messages | No | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Hide tool-call service messages | No | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Hide tool file messages sent as documents | No | `false` |
| `CODE_BLOCKS_IN_TEXT` | Show code diffs as text code blocks instead of `.txt` documents | No | `true` |
| `TRACK_BACKGROUND_SESSIONS` | Track background sessions started from PC and notify in Telegram | No | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Show background session notices (also flippable via `/display`) | No | `true` |
| `SHOW_PC_USER_MIRROR` | Mirror prompts typed on PC into the topic (also flippable via `/display`) | No | `true` |
| `SHOW_LINK_PREVIEWS` | Show link previews under assistant messages (also flippable via `/display`) | No | `true` |
| `MESSAGE_FORMAT_MODE` | Assistant reply formatting mode: `markdown` or `raw` | No | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Delay between streamed assistant updates, in ms | No | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Max displayed length for `bash`/`execute` code in summaries | No | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Max file size (KB) to send as a document | No | `100` |
| `STT_API_URL` | Whisper-compatible API base URL | No | - |
| `STT_API_KEY` | API key for your STT provider | No | - |
| `STT_MODEL` | STT model name passed to `/audio/transcriptions` | No | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Optional language hint | No | - |
| `STT_NOTE_PROMPT` | Optional extra prompt/note sent with transcription requests | No | - |
| `TTS_API_URL` | TTS API base URL | No | - |
| `TTS_API_KEY` | TTS API key | No | - |
| `TTS_MODEL` | TTS model name passed to `/audio/speech` | No | `gpt-4o-mini-tts` |
| `TTS_VOICE` | OpenAI-compatible TTS voice name | No | `alloy` |
| `LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | No | `info` |
| `BOT_HEALTH_PORT` | Port of the internal health endpoint (`/health`, `/health/live`, `/health/ready`) on `127.0.0.1`; `0` disables it | No | off; `3100` in Docker |

Keep your `.env` private — it contains your bot token. All `/display` flags apply per chat/topic (run `/display` where you want the change); overrides persist in `settings.json`.

### Optional: Voice and Audio Transcription

If `STT_API_URL` and `STT_API_KEY` are set, the bot transcribes Telegram voice/audio messages before sending them to OpenCode.

If TTS credentials are configured, `/tts` toggles spoken replies globally. The preference is stored in `settings.json` and persists across restarts.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Whisper-compatible examples:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Together: `https://api.together.xyz/v1`

### Model Picker Notes

- Favorites are shown before recent models.
- The current model is marked with `✅`.
- The default model from `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` is always included.

To add favorites, open the OpenCode TUI and press `Cmd+F` / `Ctrl+F` on a model.

## Releases

Releases are fully automated from version bumps — no manual tagging:

1. Bump the version in `package.json` (`npm version patch|minor|major`, or edit it by hand).
   - Use an `-rc.N` suffix for release candidates: `1.2.3-rc.1` (preview with `npm run release:rc`, notes with `npm run release:notes:preview`).
2. Push to `main`. The **Publish** workflow detects the missing tag and then, in order: lint → build → test → generate release notes → publish to npm (`latest`, or `next` for `-rc`) → push the `vX.Y.Z` tag → create the GitHub Release → publish the multi-arch container image to GHCR.
3. Nothing happens on pushes without a version bump — CI still runs lint/build/test on every push and PR.

So: **release by commit** — any `main` push carrying a version bump ships. Pre-releases never touch the `latest` npm tag or container tag.

## Security

Only the Telegram user whose ID matches `TELEGRAM_ALLOWED_USER_ID` can use the bot.

Since the bot runs locally and connects to your local OpenCode server, there is no exposed public service beyond Telegram itself. The optional health endpoint (`BOT_HEALTH_PORT`) binds to `127.0.0.1` only and serves read-only status.

Never commit your `.env` (ignored by default) or `settings.json` (runtime state with session IDs); both stay on the machine that runs the bot.

## Development

### Run from source

```bash
git clone https://github.com/shanekunz/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Build and start |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled code |
| `npm run release:prepare` | Bump version for a stable release |
| `npm run release:rc` | Bump version for a release candidate |
| `npm run release:notes:preview` | Preview release notes |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm test` | Run tests |
| `npm run test:coverage` | Run tests with coverage |

No watcher is used because the bot maintains persistent SSE and polling connections.

### Checks before every change

```bash
npm run build && npm run lint && npm test
```

## Troubleshooting

**Bot does not respond**

- Confirm `TELEGRAM_ALLOWED_USER_ID` matches your real Telegram user ID.
- Confirm the bot token is correct.
- For group usage, make sure privacy mode is disabled in BotFather (`/setprivacy` → Disable).

**OpenCode server is unavailable**

- Make sure `opencode serve` is running.
- Confirm `OPENCODE_API_URL` (and `OPENCODE_SERVER_VERSION` for V2) points to the correct address.

**Cannot create new session topics**

- Confirm the group is a supergroup with Topics enabled.
- Confirm the bot is an admin with **Manage Topics** permission.

**The ⏪ button never appears**

- It only shows for `bash`/`execute` tools still running after `BACKGROUND_OFFER_AFTER_SEC` (default 30s).
- Lower the threshold, and check the session topic — the offer is posted there.

## Credits

Created and maintained by the repository owner, with contributions from the community.

Co-authored with **OpenCode (Muse Spark)** — AI pair-programmer used for architecture, implementation, and review throughout this fork.

Upstream project: [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) by Ruslan Grinev.

## License

[MIT](LICENSE)
