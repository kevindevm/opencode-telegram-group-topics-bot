# OpenCode Telegram Group Topics Bot

[English README](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> 说明：英文版 [`README.md`](./README.md) 始终是权威文档。如中英文内容存在差异，以英文版为准。

这是一个 Telegram 机器人（基于 [grammy](https://grammy.dev/)，需要 Node.js 20+），它可以把一个 Telegram 超级群组变成 [OpenCode](https://opencode.ai) 的**多会话移动客户端**：**General** 话题是控制通道，每个 OpenCode 会话都有自己的 forum topic，支持实时流式输出、置顶状态面板、prompt 队列、权限/提问流程，以及长 shell 命令的 ⏪ 转入后台按钮。

本项目是 Ruslan Grinev 的 [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) 的 fork。如果只需要更简单的单聊天工作流，请使用上游项目；如果需要在 forum topic 中并行运行多个会话并从手机上控制，请使用这个 fork。

无需开放端口，也无需暴露 Web UI。机器人只与本地 OpenCode 服务器和 Telegram Bot API 通信。同时支持 OpenCode V1 和 V2 服务器。通常一个群对应一个仓库；一个群内可以并行运行多个会话 topic，多个群也可以同时保持活跃。

Fork 同步说明：[`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## 目录

- [快速了解](#快速了解)
- [截图](#截图)
- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [日常使用流程](#日常使用流程)
- [并行工作负载与 Telegram 速率限制](#并行工作负载与-telegram-速率限制)
- [命令](#命令)
- [后台运行按钮](#后台运行按钮)
- [子代理转录话题](#子代理转录话题)
- [显示菜单](#显示菜单)
- [配置](#配置)
- [发布流程](#发布流程)
- [安全](#安全)
- [开发](#开发)
- [故障排除](#故障排除)
- [致谢](#致谢)
- [许可证](#许可证)

## 快速了解

- 一个 Telegram 群对应一个仓库 / 项目工作区。
- **General** 是控制通道：`/projects`、`/sessions`、`/recent`、`/new`、`/task` 以及状态检查都在这里执行。
- 每个新建的 OpenCode 会话都有自己的 forum topic，并维护自己的 session、model、agent 和 display 状态。
- 较长的 shell 命令会出现一个 ⏪ 按钮，把会话转入后台，你可以继续聊天。
- 每个子代理会流式输出到自己的只读转录话题，同时父话题中保留一张实时状态卡片。
- 在电脑上输入的 prompt 会以 🧑 消息的形式镜像到会话话题中，两端保持同步。
- 可选的 TTS 语音回复可以通过 `/tts` 全局开关，并在重启后保持设置。
- 私聊适合轻量控制和查看状态，不是主要的多会话工作流入口。

## 截图

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Session topic with live assistant streaming" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Pinned status dashboard and reply keyboard" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Model picker with favorites" />
</p>

## 功能特性

- **话题级别的会话**：每个 OpenCode 会话对应一个 forum topic；**General** 始终是控制通道，永远不置顶任何内容。
- **实时流式输出**：助手回复实时流式输出，编辑时感知所在话题线程，并在失败时回退为一次性完整投递。
- **⏪ 转入后台**：较长的 `bash`/`execute` 命令会出现一个按钮，通过 `session.background` 把会话转入后台。
- **🧩 子代理转录话题**：每个子代理都有自己的只读话题，包含完整的实时转录；父话题保留一张紧凑的状态卡片。
- **置顶面板**：每个话题有置顶消息，显示 session、project、model、上下文用量、cost 和变更文件。
- **Prompt 队列**：会话忙碌时发送的 prompt 会进入队列，重启后仍然保留，并支持单条取消、移到队首、以及通过 `/queue` 中断当前任务并立即运行新 prompt。
- **权限与提问**：交互式的 `allow once` / `always` / `reject` 流程，以及带完整编号选项文本、短编号按钮、自定义文本和语音回答的提问投票；每个会话的信任级别用 `/trust ask|edits|all` 控制。
- **最终回复页脚**：只有一轮回复的最后一条消息会带 `agent · model · elapsed` 页脚（`🛠️ Build · opus · 1m 30s`），因此总是能一眼认出回答结束的位置。更早的消息保持普通样式。
- **选择器与键盘**：通过常驻底部键盘控制 model、agent、variant 和 context 设置，收藏项排在最前。
- **`/display` 菜单**：按聊天/话题设置显示/隐藏开关，外加 agent 快捷入口和 Cancel 按钮；设置持久保存在 `settings.json` 中。
- **会话管理**：`/retry` 重发上一条 prompt、`/diff`、`/commit`、`/cost` 花费跟踪（配合 `BUDGET_ALERT_USD`）、`/close`、`/fork`、`/share`、`/rename`、`/refresh`、保存的 prompt 快捷方式（`/saved`）、自定义命令（`/commands`）、skills（`/skills`）。
- **定时任务**：通过 `/task` 和 `/tasklist`（pause/resume/run-now/logs）管理每个项目的定时任务话题。
- **语音与文件**：兼容 Whisper 的 STT 处理语音/音频，可选全局 TTS（`/tts`），支持图片/PDF/文本附件，diff 可以作为文件或内联代码块发送。
- **项目浏览器**：`/open` 和 `/projects` 带允许目录守卫。
- **服务器控制**：OpenCode 自动启动，远程 `/opencode_start` / `/opencode_stop`，V2 配置 `/reload`。
- **单用户访问控制**，不开放任何公网端口（health 端点只绑定 `127.0.0.1`）。
- **8 种界面语言**，缺失时回退到英语。

## 快速开始

### 1. 准备条件

- Node.js 20+
- 来自 [opencode.ai](https://opencode.ai) 或 [GitHub](https://github.com/sst/opencode) 的 OpenCode
- 来自 [@BotFather](https://t.me/BotFather) 的 Telegram bot
- 来自 [@userinfobot](https://t.me/userinfobot) 的 Telegram 数字用户 ID

### 2. 创建并准备 Telegram 群组

1. 为一个 OpenCode 项目 / 仓库创建一个新的 Telegram **supergroup**。
2. 把 bot 拉进群，并让它成为管理员，赋予 **Manage Topics** 权限。
3. 在群设置中启用 **Topics**。
4. 在 [@BotFather](https://t.me/BotFather) 中对 bot 执行 `/setprivacy`，选择 **Disable**。
5. 保留默认的 **General** 话题：它就是控制通道。

### 3. 启动 OpenCode

在机器人所在的那台机器上运行 OpenCode：

```bash
# V1
opencode serve
# V2：请使用后台服务（稳定端口 + 凭据）。
# 纯粹的 `opencode serve` 会绑定随机端口和随机密码，
# 机器人永远连不上它。
opencode service start
```

默认 API 地址：`http://localhost:4096`（V1）或 `http://127.0.0.1:49374`（V2，需设置 `OPENCODE_SERVER_VERSION=v2`）。

### 4. 安装机器人

#### 方式 A：`npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### 方式 B：全局安装

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### 方式 C：从源码运行

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` 是由 `npm run build` 编译出的 CLI 入口。

#### 方式 D：Docker

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# 填写 TELEGRAM_BOT_TOKEN、TELEGRAM_ALLOWED_USER_ID、OPENCODE_MODEL_PROVIDER、OPENCODE_MODEL_ID
docker compose up -d --build
```

`.env` 保留在宿主机上。它在运行时注入，不会复制进镜像。

配置和运行时状态存放在 `opencode-group-topics-bot-data` 卷中（容器内为 `OPENCODE_TELEGRAM_HOME=/app/data`）。

**Linux**（OpenCode 在宿主机 `127.0.0.1:4096` 上运行）：默认 compose 文件使用 `network_mode: host`，因此容器可以直接访问宿主机的 OpenCode 服务器，并看到相同的项目路径。

**Docker Desktop**（macOS/Windows）：无法使用宿主机网络，请使用 override 文件，它通过 `host.docker.internal` 访问 OpenCode：

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

在 Docker Desktop 上，容器看不到宿主机的项目路径，也无法自行启动 `opencode`：请在宿主机上运行 `opencode serve`（V1）或 `opencode service start`（V2），并优先选择能在容器内解析的 `/projects` 路径（如有需要，可以通过额外的 `volumes` 条目挂载仓库）。`/opencode_start` 和 `/opencode_stop` 是仅限宿主机环境的功能。

稳定版本以 `linux/amd64` 和 `linux/arm64` 架构发布到 `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` 和 `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest`。发布候选版本只会有自己精确的版本标签。

#### 方式 E：Windows 服务（NSSM，常驻运行）

如果要在 Windows 上 24/7 运行，可以用 [NSSM](https://nssm.cc) 把 bot 作为原生服务运行：

```powershell
# 1. 先构建一次
npm install
npm run build

# 2. 注册服务（需要管理员 PowerShell，自行调整路径）
nssm install OpenCodeTelegramBot "C:\Program Files\nodejs\node.exe" "E:\path\to\repo\dist\cli.js start --mode installed"
nssm set OpenCodeTelegramBot AppDirectory "E:\path\to\repo"
nssm set OpenCodeTelegramBot AppEnvironmentExtra "OPENCODE_TELEGRAM_HOME=C:\Users\<you>\AppData\Roaming\opencode-telegram-group-topics-bot"
nssm set OpenCodeTelegramBot Start SERVICE_AUTO_START

# 3. 启动服务
nssm start OpenCodeTelegramBot
```

之后配置位于 `%APPDATA%\opencode-telegram-group-topics-bot\.env`（即 `OPENCODE_TELEGRAM_HOME` 指向的目录），服务读取的是这个文件，而不是仓库里的 `.env`。可以设置一个在登录时运行 `opencode pair` 的计划任务来保持 CLI 配对；服务本身会管理 bot 进程，并在失败时重启它。

### 5. 完成配置向导

向导会询问：

- 界面语言
- Telegram bot token
- 允许访问的 Telegram 用户 ID
- OpenCode API URL
- 可选的 OpenCode 服务器用户名/密码

### 6. 首次验证

1. 私聊 bot 并运行 `/start`，确认它有回复。
2. 在群组的 **General** 话题中运行 `/start`，然后运行 `/status`，确认 OpenCode 可达。
3. 在 **General** 中运行 `/projects`，为这个群选择仓库。
4. 在 **General** 中运行 `/new` 创建一个会话话题。
5. 打开新话题，发送一条 prompt。

如果一切正常，这个群组工作区就准备好了。

## 日常使用流程

1. 启动 OpenCode（V1 用 `opencode serve`，V2 用 `opencode service start`），然后启动 bot。
2. 打开 Telegram 群，进入 **General**。
3. 用 `/projects` 确认当前选中的仓库。
4. 用 `/new` 创建新的会话话题。
5. 在话题线程内工作；如果某个 shell 命令运行很久，点击 ⏪ 把它转入后台。
6. 回看旧的会话通道时，在 **General** 中使用 `/sessions`。

## 并行工作负载与 Telegram 速率限制

- 这个 fork 专为并行工作设计：一个群内可以有多个话题线程，多个群还可以跨项目并行。
- Telegram 会强制执行消息速率限制，当许多话题同时收到更新时尤其明显。
- 机器人会在必要时放慢或错开 Telegram 更新（参考 `SERVICE_MESSAGES_INTERVAL_SEC`，请保持 `>= 2`）。
- 即使 Telegram 更新频率下降，OpenCode 会话仍在继续运行：高负载下每个话题的实时消息会变少，但工作不会丢失。

## 命令

当没有阻塞性的交互流程时，会话话题中的普通文本消息都会被当作 prompt 处理。Model、agent、variant 和 context 操作可以从常驻底部键盘完成。

| 命令              | 说明                                                             |
| ----------------- | ---------------------------------------------------------------- |
| `/status`         | 服务器和会话状态                                                 |
| `/new`            | 创建新会话                                                       |
| `/abort`          | 中止当前操作                                                     |
| `/sessions`       | 列出会话                                                         |
| `/recent`         | 浏览所有项目中最近的会话                                         |
| `/last`           | 显示最新会话的消息                                               |
| `/tts`            | 开关语音回复                                                     |
| `/projects`       | 列出项目                                                         |
| `/open`           | 通过浏览目录添加项目                                             |
| `/task`           | 创建定时任务                                                     |
| `/tasklist`       | 列出定时任务                                                     |
| `/queue`          | 查看并管理排队的消息                                             |
| `/trust`          | 权限自动批准的信任级别                                           |
| `/retry`          | 重发上一条 prompt                                                |
| `/diff`           | 显示本会话中变更的文件                                           |
| `/commit`         | 带提交信息提交会话变更                                           |
| `/compact`        | 压缩会话上下文（无需键盘）                                       |
| `/cost`           | 显示会话（含子代理）和每日花费                                   |
| `/close`          | 关闭本会话话题                                                   |
| `/cleanup`        | 删除子代理转录话题                                               |
| `/fork`           | 将本会话克隆到一个新话题                                         |
| `/share`          | 将本会话转录导出为文件                                           |
| `/saved`          | 保存的 prompt 快捷方式                                           |
| `/rename`         | 重命名当前会话                                                   |
| `/commands`       | 自定义命令                                                       |
| `/skills`         | Skills 目录                                                      |
| `/opencode_start` | 启动 OpenCode 服务器                                             |
| `/opencode_stop`  | 停止 OpenCode 服务器                                             |
| `/reload`         | 重新加载 OpenCode 服务器配置（仅 V2）                            |
| `/refresh`        | 刷新会话信息                                                     |
| `/display`        | 此聊天的显示选项（显示/隐藏开关 + agent）                        |
| `/help`           | 帮助                                                             |

`/start` 仅限私聊使用（bot 握手）。Model/agent 选择器是键盘按钮，而不是斜杠命令。

## 后台运行按钮

当某个 shell（`bash`/`execute`）或子代理（`task`）工具持续运行超过 `BACKGROUND_OFFER_AFTER_SEC`（默认 3 秒，与 TUI 提示一致）时，bot 会在会话话题中发布一个 ⏪ **转入后台** 按钮。点击它会调用 OpenCode 的 `session.background`：命令在服务器上继续运行，你可以继续聊天，正常的完成流程会在它结束时投递结果。

- 每个正在运行的会话只有一次机会；如果命令先完成，按钮就会消失。
- 可以用 `BACKGROUND_OFFER_AFTER_SEC` 调整触发延迟。

## 子代理转录话题

当 agent 调度子代理时，每个子代理都会获得自己的只读转录话题（`🧩 <description>`），包含完整的实时转录，同时父话题保留一张紧凑的 🧩 状态卡片。当子代理结束时，它的话题会被重命名（✅/❌）并关闭。投票回答在转录话题中仍然有效；新的 prompt 会被重定向到父话题，并附带提示。

## 显示菜单

`/display` 打开一个按聊天划分的菜单：它始终只作用于你运行命令时所在的聊天/话题（注意菜单标题中的 "Scope: this chat/topic only" 提示），绝不全局生效。菜单包含：

- thinking、tool calls、tool files、code blocks、background notices、PC prompt mirror 和 link previews 的显示/隐藏开关。
- 一个 agent 快捷入口（`🤖 Agent: <name>`），点击后菜单切换为同一聊天/话题的 agent 选择器。
- 一个 `❌ Cancel` 按钮，点击后不做任何修改直接关闭菜单。

覆盖设置按聊天/话题持久保存在 `settings.json` 中，因此每个会话话题保留自己的显示配置。

## 配置

### 配置文件位置

- source 模式将配置存放在仓库根目录。
- installed 模式将配置存放在平台应用数据目录。
- `OPENCODE_TELEGRAM_HOME` 可以覆盖前两者，强制使用自定义配置目录。

installed 模式下的配置路径：

- macOS：`~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows：`%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux：`~/.config/opencode-telegram-group-topics-bot/.env`

### 环境变量

| 变量 | 说明 | 必须 | 默认值 |
| -------- | ----------- | :------: | ------- |
| `TELEGRAM_BOT_TOKEN` | 来自 @BotFather 的 bot token | 是 | - |
| `TELEGRAM_ALLOWED_USER_ID` | 你的 Telegram 数字用户 ID | 是 | - |
| `TELEGRAM_PROXY_URL` | Telegram API 代理地址（SOCKS5/HTTP） | 否 | - |
| `OPENCODE_API_URL` | OpenCode 服务器地址 | 否 | `http://localhost:4096`（V1）/ `http://127.0.0.1:49374`（V2） |
| `OPENCODE_SERVER_VERSION` | 服务器 API 版本：`v1` 或 `v2` | 否 | `v1` |
| `OPENCODE_SERVER_USERNAME` | 服务器认证用户名 | 否 | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | 服务器认证密码 | 否 | - |
| `OPENCODE_MODEL_PROVIDER` | 默认模型提供方 | 是 | - |
| `OPENCODE_MODEL_ID` | 默认模型 ID | 是 | - |
| `OPENCODE_AUTO_START` | 启动时如无可达的 OpenCode 服务器，自动启动一个受管理的服务器 | 否 | `true` |
| `BOT_LOCALE` | 机器人界面语言（`en`、`de`、`es`、`fr`、`id`、`ru`、`tr`、`zh`） | 否 | `en` |
| `SESSIONS_LIST_LIMIT` | `/sessions` 每页显示的会话数 | 否 | `10` |
| `PROJECTS_LIST_LIMIT` | `/projects` 每页显示的项目数 | 否 | `10` |
| `COMMANDS_LIST_LIMIT` | `/commands` 每页显示的命令数 | 否 | `10` |
| `OPEN_BROWSER_ROOTS` | `/open` 允许的根目录，用逗号分隔 | 否 | 主目录 |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | 定时任务的最长执行时间，单位为分钟 | 否 | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | 定时任务轮询间隔，单位为秒 | 否 | `30` |
| `BUDGET_ALERT_USD` | 每日花费告警，单位为美元（`0` 表示关闭） | 否 | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | 服务类消息的间隔；请保持 `>= 2`，`0` 表示立即发送（`TOOL_MESSAGES_INTERVAL_SEC` 仍作为旧别名有效） | 否 | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | shell/子代理运行多久后提供 ⏪ 转入后台按钮 | 否 | `3` |
| `HIDE_THINKING_MESSAGES` | 隐藏 `Thinking...` 类服务消息 | 否 | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | 隐藏工具调用类服务消息 | 否 | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | 隐藏以文档形式发送的工具文件消息 | 否 | `false` |
| `CODE_BLOCKS_IN_TEXT` | 用文本代码块而不是 `.txt` 文档展示代码 diff | 否 | `true` |
| `TRACK_BACKGROUND_SESSIONS` | 跟踪从电脑转入后台的会话并通知到 Telegram | 否 | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | 显示后台会话提醒（也可通过 `/display` 切换） | 否 | `true` |
| `SHOW_PC_USER_MIRROR` | 将电脑上输入的 prompt 镜像到话题中（也可通过 `/display` 切换） | 否 | `true` |
| `SHOW_LINK_PREVIEWS` | 在助手消息下方显示链接预览（也可通过 `/display` 切换） | 否 | `true` |
| `MESSAGE_FORMAT_MODE` | 助手回复的格式化模式：`markdown` 或 `raw` | 否 | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | 流式助手更新之间的延迟，单位为毫秒 | 否 | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | 摘要中 `bash`/`execute` 代码的最大展示长度 | 否 | `128` |
| `CODE_FILE_MAX_SIZE_KB` | 以文档形式发送的文件最大大小（KB） | 否 | `100` |
| `STT_API_URL` | 兼容 Whisper 的 API 基础地址（`plain` 模式则是完整端点） | 否 | - |
| `STT_API_KEY` | STT 提供方的 API key（`plain` 模式不需要） | 否 | - |
| `STT_PROTOCOL` | `openai`（POST `{URL}/audio/transcriptions`，带 key）或 `plain`（POST 请求原样发送 URL，附带 `audio` wav 字段，无鉴权；通过 ffmpeg 转换） | 否 | `openai` |
| `STT_AUDIO_FIELD` | 承载音频的 multipart 字段（默认：openai 用 `file`，plain 用 `audio`） | 否 | - |
| `STT_TIMEOUT_SEC` | 单次转录的超时时间，单位为秒 | 否 | `60` |
| `STT_FFMPEG_PATH` | ffmpeg 的绝对路径（plain 模式 wav 转换；仅当 PATH 中没有 ffmpeg 时需要） | 否 | - |
| `STT_MODEL` | 传递给 `/audio/transcriptions` 的 STT 模型名 | 否 | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | 可选的语言提示 | 否 | - |
| `STT_NOTE_PROMPT` | 转录请求附带的额外 prompt/note | 否 | - |
| `TTS_API_URL` | TTS API 基础地址 | 否 | - |
| `TTS_API_KEY` | TTS API key | 否 | - |
| `TTS_MODEL` | 传递给 `/audio/speech` 的 TTS 模型名 | 否 | `gpt-4o-mini-tts` |
| `TTS_VOICE` | 兼容 OpenAI 的 TTS 音色名称 | 否 | `alloy` |
| `LOG_LEVEL` | 日志级别（`debug`、`info`、`warn`、`error`） | 否 | `info` |
| `BOT_HEALTH_PORT` | 内部 Health 端点（`/health`、`/health/live`、`/health/ready`）在 `127.0.0.1` 上监听的端口；`0` 表示禁用 | 否 | 关闭；Docker 中为 `3100` |

请妥善保管 `.env`，其中包含你的 bot token。所有 `/display` 开关都按聊天/话题生效（在你想修改的地方运行 `/display`）；覆盖设置持久保存在 `settings.json` 中。

### 可选：语音与音频转录

如果设置了 `STT_API_URL`，bot 会先转录 Telegram 的语音/音频消息，再发送给 OpenCode（对于 `openai` 协议的服务器，还需要额外设置 `STT_API_KEY`）。

通过 `STT_PROTOCOL=plain` 支持极简的自定义 worker：bot 将 URL 原样 POST，附带 `audio` wav 字段且无鉴权（非 wav 输入会先用 ffmpeg 转换，因此 ffmpeg 必须在 PATH 中）。请求会串行发送，因为参考 worker 是单 CPU 实例。

如果配置了 TTS 凭据，`/tts` 可以全局开关语音回复。偏好保存在 `settings.json` 中，重启后保持。

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

兼容 Whisper 的例子：

- OpenAI：`https://api.openai.com/v1`
- Groq：`https://api.groq.com/openai/v1`
- Together：`https://api.together.xyz/v1`

### 模型选择器说明

- 收藏项显示在最近使用过的模型之前。
- 当前模型用 `✅` 标记。
- 由 `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` 指定的默认模型始终包含在列表中。

要添加收藏，打开 OpenCode TUI，在某个模型上按 `Cmd+F` / `Ctrl+F`。

## 发布流程

发布完全由版本号变更自动触发，无需手动打标签：

1. 在 `package.json` 中提升版本号（`npm version patch|minor|major`，或手动编辑）。
   - 发布候选版本使用 `-rc.N` 后缀：`1.2.3-rc.1`（用 `npm run release:rc` 预览，用 `npm run release:notes:preview` 预览说明）。
2. 推送到 `main`。**Publish** 工作流会检测缺失的标签，随后按以下顺序执行：lint → build → test → 生成发布说明 → 发布到 npm（`latest`，`-rc` 版本则发到 `next`）→ 推送 `vX.Y.Z` 标签 → 创建 GitHub Release → 发布多架构容器镜像到 GHCR。
3. 没有版本变更的推送不会触发任何发布：CI 仍然会在每次推送和 PR 上运行 lint/build/test。

总之：**通过提交来发布**：任何携带版本变更的 `main` 推送都会正式发布。预发布版本永远不会触碰 npm 的 `latest` 标签或容器标签。

## 安全

只有 ID 与 `TELEGRAM_ALLOWED_USER_ID` 匹配的 Telegram 用户可以使用这个 bot。

由于 bot 在本地运行并连接你的本地 OpenCode 服务器，除 Telegram 本身外没有任何暴露的公网服务。可选的 Health 端点（`BOT_HEALTH_PORT`）只绑定 `127.0.0.1`，且只提供只读状态。

千万不要提交你的 `.env`（默认被忽略）或 `settings.json`（包含 session ID 的运行时状态）；两者都应留在运行 bot 的那台机器上。

## 开发

### 从源码运行

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### 脚本

| 脚本 | 说明 |
| ------ | ----------- |
| `npm run dev` | 编译并启动 |
| `npm run build` | 编译 TypeScript |
| `npm start` | 运行编译后的代码 |
| `npm run release:prepare` | 为稳定版本提升版本号 |
| `npm run release:rc` | 为发布候选版本提升版本号 |
| `npm run release:notes:preview` | 预览发布说明 |
| `npm run lint` | 运行 ESLint |
| `npm run format` | 运行 Prettier |
| `npm test` | 运行测试 |
| `npm run test:coverage` | 运行测试并统计覆盖率 |

项目不使用文件监视器，因为 bot 需要维持持久的 SSE 和轮询连接。

### 每次修改前的检查

```bash
npm run build && npm run lint && npm test
```

## 故障排除

**Bot 没有响应**

- 确认 `TELEGRAM_ALLOWED_USER_ID` 与你真实的 Telegram 用户 ID 匹配。
- 确认 bot token 正确。
- 在群组中使用时，确保已在 BotFather 中禁用隐私模式（`/setprivacy` → Disable）。

**OpenCode 服务器不可用**

- 确保 OpenCode 服务器正在运行（V1 使用 `opencode serve`，V2 使用 `opencode service start`；如需凭据，先运行一次 `opencode pair` 配对）。
- 确认 `OPENCODE_API_URL`（V2 还需 `OPENCODE_SERVER_VERSION`）指向正确的地址。

**无法创建新的会话话题**

- 确认群组是启用了 Topics 的 supergroup。
- 确认 bot 是管理员并被赋予 **Manage Topics** 权限。

**⏪ 按钮从未出现**

- 它只针对运行超过 `BACKGROUND_OFFER_AFTER_SEC`（默认 3 秒）后仍在运行的 `bash`/`execute`/`task` 工具显示。
- 降低阈值，并检查会话话题：按钮发布在那里。

## 致谢

由仓库所有者创建并维护，同时感谢社区的贡献。

与 **OpenCode (Muse Spark)** 共同开发：一个 AI 结对程序员，在本 fork 的架构、实现和评审中全程参与。

本仓库是由 [kevindevm](https://github.com/kevindevm) 维护的分支，在上游项目的基础上增加了群组话题支持。

上游项目：Ruslan Grinev 的 [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot)。

## 许可证

[MIT](LICENSE)
