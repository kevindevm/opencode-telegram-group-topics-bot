# OpenCode Telegram Group Topics Bot

[README на английском](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Telegram-бот ([grammy](https://grammy.dev/), Node.js 20+) для [OpenCode](https://opencode.ai), который превращает один супергруппу в мульти-сессийный мобильный клиент: тема **General** служит контрольным каналом, а каждая OpenCode-сессия получает собственную forum topic с живым стримингом, закрепленным статусным дашбордом, очередью промптов, потоками разрешений и вопросов и кнопкой ⏪ "отправить в фон" для долгих shell-команд.

Этот проект - fork проекта [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) от Ruslan Grinev.

- Если нужен более простой workflow с одним чатом - используйте upstream.
- Если нужен **General** как контрольный канал и параллельные OpenCode-сессии в отдельных forum topics, управляемые с телефона - используйте этот fork.

Без открытых портов и без доступного извне Web UI. Бот общается только с локальным сервером OpenCode и Telegram Bot API. Поддерживаются серверы OpenCode V1 и V2.

Одна группа обычно соответствует одному репозиторию; в одной группе параллельно может работать много session topics, и одновременно может быть активной несколько групп.

Интерфейс бота доступен на языках: English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Примечание: английская версия [`README.md`](./README.md) остается основной документацией. Если содержимое версий различается, приоритет имеет английская версия.

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Быстрый обзор

- Один Telegram-группа обычно соответствует одному репозиторию / рабочему пространству проекта.
- **General** - контрольный канал: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, проверки статуса.
- Каждая новая OpenCode-сессия получает свою forum topic.
- Каждый topic ведет собственное состояние session, model, agent и pinned status dashboard.
- Длинные shell-команды предлагают кнопку ⏪, отправляющую сессию в фон, чтобы можно было продолжать общение.
- Каждый подагент стримит в свою read-only transcript topic плюс живую статус-карточку в родительской теме.
- Промпты, набранные на ПК, отображаются в session topic как сообщения 🧑, так что обе стороны остаются синхронизированы.
- Можно одновременно работать в нескольких topics на несколько групп.
- Личные сообщения подходят для легкого управления и просмотра статуса, а не как основной многопоточный workflow.

## Быстрый старт

### 1. Подготовка

- Node.js 20+
- OpenCode с [opencode.ai](https://opencode.ai) или [GitHub](https://github.com/sst/opencode)
- Telegram-бот от [@BotFather](https://t.me/BotFather)
- Ваш числовой Telegram user ID от [@userinfobot](https://t.me/userinfobot)

### 2. Создание и подготовка группы Telegram

1. Создайте новый Telegram **supergroup** для одного OpenCode-проекта / репозитория.
2. Добавьте бота в группу и сделайте его админом с правом **Manage Topics**.
3. Включите **Topics** в настройках группы.
4. У бота в [@BotFather](https://t.me/BotFather) выполните `/setprivacy` и выберите **Disable**.
5. Оставьте стандартную тему **General** - это контрольный канал.

### 3. Запуск OpenCode

Запустите OpenCode на той машине, где будет жить бот:

```bash
# V1
opencode serve
# V2: используйте фоновый сервис (стабильный порт + credentials).
# Голый `opencode serve` привязывается к случайному порту со случайным паролем,
# поэтому бот не смог бы к нему подключиться.
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

`dist/cli.js` - скомпилированная точка входа CLI, которую дает `npm run build`.

#### Вариант D: Docker

Возможен также запуск в Docker (включая Docker Desktop с файлом-оверлеем). Подробности смотрите в разделе [Quick Start](./README.md#quick-start) английского README.

### 5. Завершение мастера настройки

Мастер спрашивает:

- язык интерфейса
- Telegram bot token
- разрешенный Telegram user ID
- OpenCode API URL
- опциональные username/password сервера OpenCode

### 6. Первичная проверка

1. Напишите боту в личные сообщения и выполните `/start`; убедитесь, что он отвечает.
2. В теме **General** в группе выполните `/start`, затем `/status`, чтобы проверить доступность OpenCode.
3. Выполните `/projects` в **General** и выберите репозиторий для этой группы.
4. Выполните `/new` в **General**, чтобы создать session topic.
5. Откройте новую тему и отправьте промпт.

Если все работает, групповое рабочее пространство готово.

## Ежедневный workflow

1. Запустите OpenCode (`opencode serve` на V1, `opencode service start` на V2), затем запустите бота.
2. Откройте группу Telegram и перейдите в **General**.
3. Командой `/projects` убедитесь, что выбран нужный репозиторий.
4. Командой `/new` создайте новый session topic.
5. Работайте внутри ветки темы; если shell-команда выполняется долго, нажмите ⏪, чтобы отправить сессию в фон.
6. Командой `/sessions` в **General** можно вернуться к более старым сессиям.

## Параллельная работа и лимиты Telegram

- Этот fork рассчитан на параллельную работу: много тем в одной группе и много групп по проектам.
- Telegram ограничивает скорость отправки сообщений, особенно когда несколько topics обновляются одновременно.
- Бот замедляет или распределяет по времени обновления Telegram при необходимости (см. `SERVICE_MESSAGES_INTERVAL_SEC`, держите значение `>= 2`).
- OpenCode-сессии продолжают работать, даже если обновления Telegram становятся реже: при высокой нагрузке в topics будет меньше "живого" чата, но не потерянная работа.

## Команды

Любое обычное текстовое сообщение в session topic считается промптом, когда нет активного блокирующего взаимодействия. Действия с model, agent, variant и context доступны с постоянной нижней клавиатуры.

| Команда           | Описание                                                          |
| ----------------- | ----------------------------------------------------------------- |
| `/status`         | Статус сервера и сессии                                           |
| `/new`            | Создать новую сессию                                              |
| `/abort`          | Прервать текущее действие                                         |
| `/sessions`       | Список сессий                                                     |
| `/recent`         | Просмотр недавних сессий по всем проектам                         |
| `/last`           | Показать последнее сообщение сессии                               |
| `/tts`            | Включить/выключить голосовые ответы                               |
| `/projects`       | Список проектов                                                   |
| `/open`           | Добавить проект, выбирая каталоги                                 |
| `/task`           | Создать запланированную задачу                                    |
| `/tasklist`       | Список запланированных задач                                      |
| `/queue`          | Показать и управлять очередью сообщений                           |
| `/trust`          | Уровень доверия для автоодобрения разрешений                      |
| `/retry`          | Повторно отправить последний промпт                               |
| `/diff`           | Показать измененные файлы этой сессии                             |
| `/commit`         | Закоммитить изменения сессии с сообщением                         |
| `/compact`        | Сжать контекст сессии (клавиатура не нужна)                       |
| `/cost`           | Показать расход по сессии (включая подагентов) и за день          |
| `/close`          | Закрыть этот session topic                                        |
| `/cleanup`        | Удалить transcript topics подагентов                              |
| `/fork`           | Клонировать эту сессию в новую тему                               |
| `/share`          | Экспортировать transcript сессии в файл                           |
| `/saved`          | Сохраненные быстрые промпты                                       |
| `/rename`         | Переименовать текущую сессию                                      |
| `/commands`       | Пользовательские команды                                          |
| `/skills`         | Каталог skills                                                    |
| `/opencode_start` | Запустить сервер OpenCode                                         |
| `/opencode_stop`  | Остановить сервер OpenCode                                        |
| `/reload`         | Перезагрузить конфигурацию сервера OpenCode (только V2)           |
| `/refresh`        | Обновить информацию по сессии                                     |
| `/display`        | Настройки отображения для этого чата (переключатели + агент)      |
| `/help`           | Справка                                                           |

`/start` работает только в личных сообщениях (handshake бота). Выбор model/agent идет через кнопки клавиатуры, а не через slash-команды.

## Конфигурация

### Расположение конфигурации

- В режиме запуска из исходников (source mode) конфигурация хранится в корне репозитория.
- В установленном режиме (installed mode) - в каталоге app-data платформы.
- `OPENCODE_TELEGRAM_HOME` переопределяет оба варианта и задает свой каталог конфигурации.

Пути конфигурации в установленном режиме:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Основные переменные окружения

| Переменная                        | Описание                                                                                                             | Обязательно | По умолчанию                                                   |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------- | :----: | -------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`              | Bot token от @BotFather                                                                                              |  Yes   | -                                                              |
| `TELEGRAM_ALLOWED_USER_ID`        | Ваш числовой Telegram user ID                                                                                        |  Yes   | -                                                              |
| `OPENCODE_API_URL`                | Адрес сервера OpenCode                                                                                               |   No   | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2)   |
| `OPENCODE_SERVER_VERSION`         | Версия API сервера: `v1` или `v2`                                                                                    |   No   | `v1`                                                           |
| `OPENCODE_SERVER_USERNAME`        | Имя пользователя для авторизации на сервере                                                                          |   No   | `opencode`                                                     |
| `OPENCODE_SERVER_PASSWORD`        | Пароль для авторизации на сервере                                                                                    |   No   | -                                                              |
| `OPENCODE_MODEL_PROVIDER`         | Провайдер модели по умолчанию                                                                                        |  Yes   | -                                                              |
| `OPENCODE_MODEL_ID`               | ID модели по умолчанию                                                                                               |  Yes   | -                                                              |
| `OPENCODE_AUTO_START`             | Запускать управляемый сервер OpenCode при старте бота, если ни один не доступен                                      |   No   | `true`                                                         |
| `BOT_LOCALE`                      | Язык интерфейса бота (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`)                                                 |   No   | `en`                                                           |
| `SERVICE_MESSAGES_INTERVAL_SEC`   | Интервал сервисных сообщений; держите `>= 2`, `0` = мгновенно                                                        |   No   | `5`                                                            |
| `BUDGET_ALERT_USD`                | Оповещение о дневном расходе в USD (`0` = выключено)                                                                  |   No   | `0`                                                            |
| `LOG_LEVEL`                       | Уровень логов (`debug`, `info`, `warn`, `error`)                                                                     |   No   | `info`                                                         |

Храните `.env` в секрете: там лежит ваш bot token.

Если нужна полная таблица переменных окружения, смотрите раздел Configuration в английской версии [`README.md`](./README.md).

## Устранение неполадок

**Бот не отвечает**

- Убедитесь, что `TELEGRAM_ALLOWED_USER_ID` совпадает с вашим реальным Telegram user ID.
- Убедитесь, что bot token корректный.
- Для работы в группе убедитесь, что privacy mode отключен в BotFather (`/setprivacy` -> Disable).

**Сервер OpenCode недоступен**

- Убедитесь, что сервер OpenCode запущен (`opencode serve` на V1, `opencode service start` на V2; если он запрашивает credentials, один раз выполните `opencode pair`).
- Убедитесь, что `OPENCODE_API_URL` (и `OPENCODE_SERVER_VERSION` для V2) указывают на правильный адрес.

**Не удается создать новые session topics**

- Убедитесь, что группа является supergroup с включенными **Topics**.
- Убедитесь, что бот админ с правом **Manage Topics**.

**Кнопка ⏪ не появляется**

- Она показывается только для инструментов `bash`/`execute`/`task`, все еще выполняющихся спустя `BACKGROUND_OFFER_AFTER_SEC` (по умолчанию 3 с).
- Уменьшите порог и проверьте session topic: предложение публикуется именно там.

## Безопасность

Ботом может пользоваться только Telegram-пользователь, чей ID совпадает с `TELEGRAM_ALLOWED_USER_ID`.

Бот работает локально и подключается к вашему локальному серверу OpenCode, поэтому публичный сервис кроме самого Telegram не открывается. Опциональный health endpoint привязывается только к `127.0.0.1` и отдает read-only статус.

Никогда не коммитьте `.env` (по умолчанию в gitignore) и `settings.json` (runtime-состояние с ID сессий); оба файла остаются на машине, где работает бот.

## Дополнительная документация

- Main docs in English: [`README.md`](./README.md)
- Fork sync notes: [`FORK_SYNC.md`](./FORK_SYNC.md)
- Product scope and status: [`PRODUCT.md`](./PRODUCT.md)
- Contributing guide: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Лицензия

[MIT](LICENSE) • Оригинальный проект © Ruslan Grinev • Модификации fork © Shane Kunz
