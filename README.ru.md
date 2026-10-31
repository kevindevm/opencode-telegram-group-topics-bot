# OpenCode Telegram Group Topics Bot

[README на английском](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Примечание: английская версия [`README.md`](./README.md) остается основной документацией. Если содержимое версий различается, приоритет имеет английская версия.

Telegram-бот ([grammy](https://grammy.dev/), Node.js 20+), который превращает одну супергруппу Telegram в **многосессийный мобильный клиент для [OpenCode](https://opencode.ai)**: тема **General** служит управляющим каналом, а каждая сессия OpenCode получает собственную тему форума с живым стримингом, закрепленной статусной панелью, очередью промптов, потоками разрешений и вопросов, а также кнопкой ⏪ «отправить в фон» для долгих shell-команд.

Этот проект является форком [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) от Ruslan Grinev. Используйте upstream для более простого сценария с одним чатом; используйте этот форк для параллельных сессий в темах форума, управляемых с телефона.

Без открытых портов и без общедоступного веб-интерфейса. Бот общается только с вашим локальным сервером OpenCode и Telegram Bot API. Поддерживаются серверы OpenCode V1 и V2. Одна группа обычно соответствует одному репозиторию; в одной группе параллельно может работать множество тем-сессий, и одновременно могут быть активны несколько групп.

Заметки о синхронизации форка: [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Содержание

- [Краткий обзор](#краткий-обзор)
- [Скриншоты](#скриншоты)
- [Возможности](#возможности)
- [Быстрый старт](#быстрый-старт)
- [Ежедневный рабочий процесс](#ежедневный-рабочий-процесс)
- [Параллельная работа и лимиты Telegram](#параллельная-работа-и-лимиты-telegram)
- [Команды](#команды)
- [Кнопка фонового запуска](#кнопка-фонового-запуска)
- [Темы транскриптов подагентов](#темы-транскриптов-подагентов)
- [Меню отображения](#меню-отображения)
- [Конфигурация](#конфигурация)
- [Релизы](#релизы)
- [Безопасность](#безопасность)
- [Разработка](#разработка)
- [Устранение неполадок](#устранение-неполадок)
- [Авторы](#авторы)
- [Лицензия](#лицензия)

## Краткий обзор

- Одна группа Telegram соответствует одному репозиторию / рабочему пространству проекта.
- **General** это управляющий канал: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, проверки статуса.
- Каждая новая сессия OpenCode получает собственную тему форума со своей сессией, моделью, агентом и состоянием отображения.
- Для долгих shell-команд предлагается кнопка ⏪, отправляющая сессию в фон, чтобы вы могли продолжать общение.
- Каждый подагент стримит свои сообщения в собственную read-only тему с транскриптом, плюс в родительской теме показывается живая статус-карточка.
- Промпты, набранные на ПК, дублируются в тему сессии как сообщения 🧑, чтобы обе стороны оставались синхронизированы.
- Опциональные аудиоответы TTS переключаются глобально командой `/tts` и сохраняются между перезапусками.
- Личные сообщения подходят для легкого управления и проверки статуса, а не для основного многосессийного рабочего процесса.

## Скриншоты

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Session topic with live assistant streaming" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Pinned status dashboard and reply keyboard" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Model picker with favorites" />
</p>

## Возможности

- **Сессии в рамках тем** - одна тема форума на каждую сессию OpenCode; General остается управляющим каналом и ничего не закрепляет.
- **Живой стриминг** - ответы ассистента транслируются с учетом веток обсуждения при редактировании и с резервной доставкой по завершении.
- **⏪ Отправить в фон** - для долгих команд `bash`/`execute` предлагается кнопка, переводящая сессию в фон через `session.background`.
- **🧩 Темы транскриптов подагентов** - каждый подагент получает read-only тему с полным живым транскриптом; в родительской теме хранится компактная статус-карточка.
- **Закрепленные панели** - закрепленное сообщение в каждой теме с сессией, проектом, моделью, использованием контекста, расходом и измененными файлами.
- **Очередь промптов** - промпты, отправленные во время занятости сессии, ставятся в очередь, переживают перезапуски и поддерживают отмену по каждому сообщению, перенос в начало и «прервать и запустить» через `/queue`.
- **Разрешения и вопросы** - интерактивные сценарии `allow once` / `always` / `reject` и опросы с вопросами, содержащие полные пронумерованные варианты в тексте сообщения плюс короткие нумерованные кнопки, произвольный текст и голосовые ответы; уровни доверия на каждую сессию через `/trust ask|edits|all`.
- **Подпись итогового ответа** - только последнее сообщение хода несет подпись `agent · model · elapsed` (`🛠️ Build · opus · 1m 30s`), так что конец ответа всегда узнаваем. Более ранние сообщения отправляются без подписи.
- **Выбор моделей и клавиатура** - управление моделью, агентом, вариантом и контекстом с постоянной клавиатуры; избранные показываются первыми.
- **Меню `/display`** - переключатели показа/скрытия для чата/темы, ярлык агента и кнопка Cancel; переопределения сохраняются в `settings.json`.
- **Управление сессиями** - `/retry` последнего промпта, `/diff`, `/commit`, `/cost` отслеживание расхода с `BUDGET_ALERT_USD`, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, сохраненные промпты (`/saved`), пользовательские команды (`/commands`), skills (`/skills`).
- **Запланированные задачи** - отдельная тема с расписанием на проект через `/task` и `/tasklist` (пауза/возобновление/запуск сейчас/логи).
- **Голос и файлы** - Whisper-совместимый STT для голосовых/аудио сообщений, опциональный глобальный TTS (`/tts`), вложения изображений/PDF/текста, диффы в виде файлов или inline-блоков кода.
- **Обзор проектов** - `/open` и `/projects` с проверкой разрешенных каталогов.
- **Управление сервером** - автозапуск OpenCode, удаленные `/opencode_start` / `/opencode_stop`, `/reload` конфигурации V2.
- **Однопользовательский контроль доступа**, без публичных портов (health endpoint привязывается только к `127.0.0.1`).
- **8 языков интерфейса** с fallback на английский.

## Быстрый старт

### 1. Требования

- Node.js 20+
- OpenCode из [opencode.ai](https://opencode.ai) или [GitHub](https://github.com/sst/opencode)
- Telegram-бот от [@BotFather](https://t.me/BotFather)
- Ваш числовой Telegram user ID от [@userinfobot](https://t.me/userinfobot)

### 2. Создание и подготовка группы Telegram

1. Создайте новую супергруппу Telegram для одного проекта/репозитория OpenCode.
2. Добавьте бота в группу и сделайте его админом с правом **Manage Topics**.
3. Включите **Topics** в настройках группы.
4. В [@BotFather](https://t.me/BotFather) выполните `/setprivacy` для бота и выберите **Disable**.
5. Оставьте стандартную тему **General** - это управляющий канал.

### 3. Запуск OpenCode

Запустите OpenCode на той машине, где будет жить бот:

```bash
# V1
opencode serve
# V2: use the background service (stable port + credentials).
# A bare `opencode serve` binds a random port with a random password,
# so the bot could never reach it.
opencode service start
```

Адрес API по умолчанию: `http://localhost:4096` (V1) или `http://127.0.0.1:49374` (V2, установите `OPENCODE_SERVER_VERSION=v2`).

### 4. Установка бота

#### Вариант A: `npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### Вариант B: глобальная установка

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Вариант C: запуск из исходников

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` - это скомпилированная точка входа CLI, которую производит `npm run build`.

#### Вариант D: Docker

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID
docker compose up -d --build
```

Файл `.env` остается на хосте. Он подставляется во время работы и не копируется в образ.

Конфигурация и состояние рантайма живут в volume `opencode-group-topics-bot-data` (`OPENCODE_TELEGRAM_HOME=/app/data` внутри контейнера).

**Linux** (OpenCode на хосте на `127.0.0.1:4096`): файл compose по умолчанию использует `network_mode: host`, поэтому контейнер достигает вашего OpenCode-сервера на хосте и видит те же пути к проектам.

**Docker Desktop** (macOS/Windows): сеть хоста недоступна, поэтому используйте файл-оверлей, который обращается к OpenCode через `host.docker.internal`:

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

На Docker Desktop контейнер не видит пути к проектам на хосте и не может запустить сам `opencode`: запустите `opencode serve` (V1) или `opencode service start` (V2) на хосте и выбирайте в `/projects` пути, которые разрешаются внутри контейнера (при необходимости смонтируйте репозитории дополнительной записью `volumes`). `/opencode_start` и `/opencode_stop` работают только на хосте.

Стабильные релизы публикуются в `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` и `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest` для `linux/amd64` и `linux/arm64`. Release-кандидаты получают только свои точные версии-теги.

#### Вариант E: Windows Service (NSSM, постоянно включенный)

Для работы 24/7 в Windows запустите бота как нативную службу с помощью [NSSM](https://nssm.cc):

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

Конфигурация тогда лежит в `%APPDATA%\opencode-telegram-group-topics-bot\.env` (или там, куда указывает `OPENCODE_TELEGRAM_HOME`): служба читает именно этот файл, а не `.env` репозитория. Планировщик задач, запускающий `opencode pair` при входе в систему, поддерживает сопряжение CLI; сама служба управляет процессом бота и перезапускает его при сбое.

### 5. Завершение мастера настройки

Мастер запрашивает:

- язык интерфейса
- токен Telegram-бота
- разрешенный Telegram user ID
- URL OpenCode API
- опциональные имя пользователя/пароль сервера OpenCode

### 6. Первичная проверка

1. Напишите боту в личные сообщения и выполните `/start`; убедитесь, что он отвечает.
2. В теме **General** в группе выполните `/start`, затем `/status`, чтобы проверить доступность OpenCode.
3. Выполните `/projects` в **General** и выберите репозиторий для этой группы.
4. Выполните `/new` в **General**, чтобы создать тему-сессию.
5. Откройте новую тему и отправьте промпт.

Если это сработало, групповое рабочее пространство готово.

## Ежедневный рабочий процесс

1. Запустите OpenCode (`opencode serve` на V1, `opencode service start` на V2), затем запустите бота.
2. Откройте Telegram-группу и перейдите в **General**.
3. Используйте `/projects`, чтобы подтвердить выбранный репозиторий.
4. Используйте `/new`, чтобы создать новую тему-сессию.
5. Работайте внутри ветки темы; если shell-команда выполняется долго, нажмите ⏪, чтобы отправить сессию в фон.
6. Используйте `/sessions` в **General**, чтобы вернуться к более старым сессиям.

## Параллельная работа и лимиты Telegram

- Этот форк рассчитан на параллельную работу: много тематических веток в одной группе и много групп по разным проектам.
- Telegram ограничивает скорость отправки сообщений, особенно когда обновления приходят сразу в несколько тем.
- Бот при необходимости замедляет или распределяет по времени обновления Telegram (см. `SERVICE_MESSAGES_INTERVAL_SEC`, держите значение `>= 2`).
- Сессии OpenCode продолжают работать, даже если обновления Telegram становятся реже: при высокой нагрузке ожидайте меньше живой переписки в каждой теме, а не потерянную работу.

## Команды

Любое обычное текстовое сообщение в теме-сессии считается промптом, когда нет активного блокирующего взаимодействия. Действия с моделью, агентом, вариантом и контекстом доступны с постоянной нижней клавиатуры.

| Команда           | Описание                                                 |
| ----------------- | -------------------------------------------------------- |
| `/status`         | Статус сервера и сессии                                  |
| `/new`            | Создать новую сессию                                     |
| `/abort`          | Прервать текущее действие                                |
| `/sessions`       | Список сессий                                            |
| `/recent`         | Просмотр недавних сессий по всем проектам                |
| `/last`           | Показать последнее сообщение сессии                      |
| `/tts`            | Переключить аудиоответы                                  |
| `/projects`       | Список проектов                                          |
| `/open`           | Добавить проект, просматривая каталоги                   |
| `/task`           | Создать запланированную задачу                           |
| `/tasklist`       | Список запланированных задач                             |
| `/queue`          | Показать очередь сообщений и управлять ею                |
| `/trust`          | Уровень доверия для автоодобрения разрешений             |
| `/retry`          | Повторно отправить последний промпт                      |
| `/diff`           | Показать измененные файлы этой сессии                    |
| `/commit`         | Закоммитить изменения сессии с сообщением                |
| `/compact`        | Сжать контекст сессии (клавиатура не нужна)              |
| `/cost`           | Показать расход по сессии (включая подагентов) и за день |
| `/close`          | Закрыть тему этой сессии                                 |
| `/cleanup`        | Удалить темы транскриптов подагентов                     |
| `/fork`           | Клонировать эту сессию в новую тему                      |
| `/share`          | Экспортировать транскрипт сессии в файл                  |
| `/saved`          | Сохраненные быстрые промпты                              |
| `/rename`         | Переименовать текущую сессию                             |
| `/commands`       | Пользовательские команды                                 |
| `/skills`         | Каталог skills                                           |
| `/opencode_start` | Запустить сервер OpenCode                                |
| `/opencode_stop`  | Остановить сервер OpenCode                               |
| `/reload`         | Перезагрузить конфигурацию сервера OpenCode (только V2)  |
| `/refresh`        | Обновить информацию о сессии                             |
| `/display`        | Параметры отображения для этого чата (переключатели + агент) |
| `/help`           | Справка                                                  |

`/start` работает только в личных сообщениях (рукопожатие с ботом). Выбор модели/агента идет через кнопки клавиатуры, а не через slash-команды.

## Кнопка фонового запуска

Когда инструмент shell (`bash`/`execute`) или подагента (`task`) продолжает работать дольше `BACKGROUND_OFFER_AFTER_SEC` (по умолчанию 3 с, как в подсказке TUI), бот публикует в теме-сессии кнопку ⏪ **Отправить в фон**. Нажатие вызывает `session.background` в OpenCode: команда продолжает выполняться на сервере, пока вы продолжаете общаться, и обычный сценарий завершения доставит результат, когда она закончится.

- Одно предложение на каждую работающую сессию; оно исчезает, если команда завершится раньше.
- Настраивайте задержку через `BACKGROUND_OFFER_AFTER_SEC`.

## Темы транскриптов подагентов

Когда агент порождает подагентов, каждый из них получает собственную read-only тему транскрипта (`🧩 <description>`) с полным живым транскриптом, а в родительской теме хранится компактная статус-карточка 🧩. Когда подагент завершается, его тема переименовывается (✅/❌) и закрывается. Ответы на опросы внутри тем транскриптов продолжают работать; новые промпты перенаправляются в родительскую тему с уведомлением.

## Меню отображения

`/display` открывает меню для конкретного чата: оно всегда применяется к чату/теме, где вы его вызвали (обратите внимание на надпись «Scope: this chat/topic only» в заголовке меню), но не глобально. Оно содержит:

- Переключатели показа/скрытия для thinking, вызовов инструментов, файлов инструментов, блоков кода, уведомлений о фоновых задачах, зеркала промптов с ПК и превью ссылок.
- Строку ярлыка агента (`🤖 Agent: <name>`), которая переводит меню в выбор агента для того же чата/темы.
- Кнопку `❌ Cancel`, которая закрывает меню без каких-либо изменений.

Переопределения сохраняются для каждого чата/темы в `settings.json`, поэтому каждая тема-сессия держит собственную настройку отображения.

## Конфигурация

### Расположение конфигурации

- В режиме исходников (source mode) конфигурация хранится в корне репозитория.
- В установленном режиме (installed mode) конфигурация хранится в каталоге app-data платформы.
- `OPENCODE_TELEGRAM_HOME` переопределяет оба варианта и задает собственный каталог конфигурации.

Пути конфигурации в установленном режиме:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Переменные окружения

| Переменная | Описание | Обязательно | По умолчанию |
| ---------- | -------- | :---------: | ------------ |
| `TELEGRAM_BOT_TOKEN` | Токен бота от @BotFather | Да | - |
| `TELEGRAM_ALLOWED_USER_ID` | Ваш числовой Telegram user ID | Да | - |
| `TELEGRAM_PROXY_URL` | URL прокси для Telegram API (SOCKS5/HTTP) | Нет | - |
| `OPENCODE_API_URL` | URL сервера OpenCode | Нет | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Версия API сервера: `v1` или `v2` | Нет | `v1` |
| `OPENCODE_SERVER_USERNAME` | Имя пользователя для авторизации на сервере | Нет | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Пароль для авторизации на сервере | Нет | - |
| `OPENCODE_MODEL_PROVIDER` | Провайдер модели по умолчанию | Да | - |
| `OPENCODE_MODEL_ID` | ID модели по умолчанию | Да | - |
| `OPENCODE_AUTO_START` | Запускать управляемый сервер OpenCode при старте бота, если ни один недоступен | Нет | `true` |
| `BOT_LOCALE` | Язык интерфейса бота (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | Нет | `en` |
| `SESSIONS_LIST_LIMIT` | Сессий на странице в `/sessions` | Нет | `10` |
| `PROJECTS_LIST_LIMIT` | Проектов на странице в `/projects` | Нет | `10` |
| `COMMANDS_LIST_LIMIT` | Команд на странице в `/commands` | Нет | `10` |
| `OPEN_BROWSER_ROOTS` | Разрешенные корневые каталоги для `/open`, через запятую | Нет | домашний каталог |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Максимальное время выполнения запланированной задачи, в минутах | Нет | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Интервал опроса запланированных задач, в секундах | Нет | `30` |
| `BUDGET_ALERT_USD` | Предупреждение о дневном расходе в USD (`0` = выключено) | Нет | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Интервал сервисных сообщений; держите `>= 2`, `0` = мгновенно (`TOOL_MESSAGES_INTERVAL_SEC` работает как устаревший алиас) | Нет | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | Сколько секунд должна выполняться shell-команда/подагент, прежде чем появится кнопка ⏪ отправки в фон | Нет | `3` |
| `HIDE_THINKING_MESSAGES` | Скрывать сервисные сообщения `Thinking...` | Нет | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Скрывать сервисные сообщения о вызовах инструментов | Нет | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Скрывать сообщения с файлами инструментов, отправляемые документами | Нет | `false` |
| `CODE_BLOCKS_IN_TEXT` | Показывать диффы кода текстовыми блоками кода вместо документов `.txt` | Нет | `true` |
| `TRACK_BACKGROUND_SESSIONS` | Отслеживать фоновые сессии, запущенные с ПК, и уведомлять в Telegram | Нет | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Показывать уведомления о фоновых сессиях (также переключается через `/display`) | Нет | `true` |
| `SHOW_PC_USER_MIRROR` | Дублировать промпты, набранные на ПК, в тему (также переключается через `/display`) | Нет | `true` |
| `SHOW_LINK_PREVIEWS` | Показывать превью ссылок под сообщениями ассистента (также переключается через `/display`) | Нет | `true` |
| `MESSAGE_FORMAT_MODE` | Режим форматирования ответов ассистента: `markdown` или `raw` | Нет | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Задержка между обновлениями стриминга ответов, в мс | Нет | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Максимальная длина показа кода `bash`/`execute` в сводках | Нет | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Максимальный размер файла (КБ) для отправки документом | Нет | `100` |
| `STT_API_URL` | Базовый URL Whisper-совместимого API (или полный endpoint для `plain`) | Нет | - |
| `STT_API_KEY` | API-ключ вашего STT-провайдера (не нужен для `plain`) | Нет | - |
| `STT_PROTOCOL` | `openai` (POST `{URL}/audio/transcriptions` с ключом) или `plain` (POST на URL как есть с полем `audio` в формате wav, без авторизации; конвертация через ffmpeg) | Нет | `openai` |
| `STT_AUDIO_FIELD` | Multipart-поле с аудио (по умолчанию: `file` для openai, `audio` для plain) | Нет | - |
| `STT_TIMEOUT_SEC` | Тайм-аут каждой расшифровки в секундах | Нет | `60` |
| `STT_FFMPEG_PATH` | Абсолютный путь к ffmpeg (конвертация в wav в режиме plain; нужен только когда ffmpeg нет в PATH) | Нет | - |
| `STT_MODEL` | Имя STT-модели, передаваемое в `/audio/transcriptions` | Нет | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Необязательная подсказка языка | Нет | - |
| `STT_NOTE_PROMPT` | Необязательный дополнительный промпт/примечание, отправляемый с запросами расшифровки | Нет | - |
| `TTS_API_URL` | Базовый URL TTS API | Нет | - |
| `TTS_API_KEY` | Ключ TTS API | Нет | - |
| `TTS_MODEL` | Имя TTS-модели, передаваемое в `/audio/speech` | Нет | `gpt-4o-mini-tts` |
| `TTS_VOICE` | Имя голоса TTS, совместимого с OpenAI | Нет | `alloy` |
| `LOG_LEVEL` | Уровень логирования (`debug`, `info`, `warn`, `error`) | Нет | `info` |
| `BOT_HEALTH_PORT` | Порт внутреннего health endpoint (`/health`, `/health/live`, `/health/ready`) на `127.0.0.1`; `0` отключает его | Нет | выключен; `3100` в Docker |

Храните файл `.env` в секрете: в нем лежит токен вашего бота. Все флаги `/display` применяются к конкретному чату/теме (запускайте `/display` там, где хотите изменить); переопределения сохраняются в `settings.json`.

### Опционально: голос и расшифровка аудио

Если задан `STT_API_URL`, бот расшифровывает голосовые/аудио сообщения Telegram перед отправкой в OpenCode (для серверов с протоколом `openai` дополнительно требуется `STT_API_KEY`).

Минимальные собственные воркеры поддерживаются через `STT_PROTOCOL=plain`: бот отправляет POST на URL как есть с полем `audio` в формате wav и без авторизации (не-wav вход конвертируется через ffmpeg, поэтому он должен быть в PATH). Запросы сериализуются, потому что эталонные воркеры являются однопроцессорными инстансами.

Если настроены учетные данные TTS, `/tts` глобально переключает озвученные ответы. Предпочтение хранится в `settings.json` и сохраняется между перезапусками.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Whisper-совместимые примеры:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Together: `https://api.together.xyz/v1`

### Заметки о выборе моделей

- Избранные показываются перед недавними моделями.
- Текущая модель отмечена значком `✅`.
- Модель по умолчанию из `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` всегда присутствует.

Чтобы добавить избранное, откройте TUI OpenCode и нажмите `Cmd+F` / `Ctrl+F` на модели.

## Релизы

Релизы полностью автоматизированы на основе поднятия версии, без ручного тегирования:

1. Поднимите версию в `package.json` (`npm version patch|minor|major` или отредактируйте вручную).
   - Используйте суффикс `-rc.N` для release-кандидатов: `1.2.3-rc.1` (превью с `npm run release:rc`, заметки с `npm run release:notes:preview`).
2. Отправьте изменения в `main`. Workflow **Publish** обнаруживает отсутствующий тег и затем, по порядку: lint → build → test → генерация заметок релиза → публикация в npm (`latest`, или `next` для `-rc`) → пуш тега `vX.Y.Z` → создание GitHub Release → публикация мульти-архитектурного образа контейнера в GHCR.
3. Ничего не происходит на пушах без поднятия версии: CI все равно запускает lint/build/test на каждый пуш и PR.

Итог: **релиз коммитом** - любой пуш в `main` с поднятием версии уходит в релиз. Пре-релизы никогда не трогают npm-тег `latest` или тег контейнера.

## Безопасность

Ботом может пользоваться только Telegram-пользователь, чей ID совпадает с `TELEGRAM_ALLOWED_USER_ID`.

Поскольку бот работает локально и подключается к вашему локальному серверу OpenCode, публичный сервис кроме самого Telegram не открывается. Опциональный health endpoint (`BOT_HEALTH_PORT`) привязывается только к `127.0.0.1` и отдает read-only статус.

Никогда не коммитьте `.env` (игнорируется по умолчанию) или `settings.json` (состояние рантайма с ID сессий); оба файла остаются на машине, где работает бот.

## Разработка

### Запуск из исходников

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Скрипты

| Скрипт | Описание |
| ------ | -------- |
| `npm run dev` | Сборка и запуск |
| `npm run build` | Компиляция TypeScript |
| `npm start` | Запуск скомпилированного кода |
| `npm run release:prepare` | Поднять версию для стабильного релиза |
| `npm run release:rc` | Поднять версию для release-кандидата |
| `npm run release:notes:preview` | Превью заметок релиза |
| `npm run lint` | Запуск ESLint |
| `npm run format` | Запуск Prettier |
| `npm test` | Запуск тестов |
| `npm run test:coverage` | Запуск тестов с покрытием |

Watcher не используется, потому что бот поддерживает постоянные соединения SSE и polling.

### Проверки перед каждым изменением

```bash
npm run build && npm run lint && npm test
```

## Устранение неполадок

**Бот не отвечает**

- Убедитесь, что `TELEGRAM_ALLOWED_USER_ID` совпадает с вашим реальным Telegram user ID.
- Убедитесь, что токен бота корректный.
- Для работы в группе убедитесь, что privacy mode отключен в BotFather (`/setprivacy` → Disable).

**Сервер OpenCode недоступен**

- Убедитесь, что сервер OpenCode запущен (`opencode serve` на V1, `opencode service start` на V2; если он запрашивает учетные данные, один раз выполните `opencode pair`).
- Убедитесь, что `OPENCODE_API_URL` (и `OPENCODE_SERVER_VERSION` для V2) указывают на правильный адрес.

**Не удается создать новые темы-сессии**

- Убедитесь, что группа является супергруппой с включенными **Topics**.
- Убедитесь, что бот является админом с правом **Manage Topics**.

**Кнопка ⏪ никогда не появляется**

- Она показывается только для инструментов `bash`/`execute`/`task`, все еще выполняющихся спустя `BACKGROUND_OFFER_AFTER_SEC` (по умолчанию 3 с).
- Уменьшите порог и проверьте тему-сессию: предложение публикуется именно там.

## Авторы

Создан и поддерживается владельцем репозитория, при участии сообщества.

Написан в соавторстве с **OpenCode (Muse Spark)**, ИИ-программистом, использовавшимся для архитектуры, реализации и ревью во всем этом форке.

Upstream-проект: [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) от Ruslan Grinev.

## Лицензия

[MIT](LICENSE)
