import type { I18nDictionary } from "./en.js";

export const ru: I18nDictionary = {
  "cmd.description.status": "Статус сервера и сессии",
  "cmd.description.new": "Создать новую сессию",
  "cmd.description.abort": "Прервать текущее действие",
  "cmd.description.stop": "Прервать текущее действие",
  "cmd.description.sessions": "Список сессий",
  "cmd.description.last": "Показать последнее сообщение сессии",
  "cmd.description.tts": "Переключить аудиоответы",
  "cmd.description.projects": "Список проектов",
  "cmd.description.task": "Создать отложенную задачу",
  "cmd.description.tasklist": "Список отложенных задач",
  "cmd.description.commands": "Пользовательские команды",
  "cmd.description.model": "Выбрать модель",
  "cmd.description.agent": "Выбрать режим агента",
  "cmd.description.cleanup": "Закрыть устаревшие темы",
  "cmd.description.opencode_start": "Запустить OpenCode сервер",
  "cmd.description.opencode_stop": "Остановить OpenCode сервер",
  "cmd.description.recent": "Browse recent sessions across projects",
  "cmd.description.reload": "Reload the OpenCode server configuration (V2 only)",
  "refresh.last_message": "📋 Last message: {preview}",
  "refresh.subscribed": "✅ Subscribed to session events",
  "refresh.no_topic": "⚠️ No topic linked",

  "pcuser.echo": "🧑 {text}",

  "permission.outcome.once": "✅ Allowed once",
  "permission.outcome.always": "🔓 Allowed always",
  "permission.outcome.reject": "❌ Rejected",
  "permission.outcome.settled_outside": "☑️ Answered outside Telegram",

  "background.session_fallback": "session {id}",
  "background.assistant_response": "🔔 Assistant replied in background session: {session}",
  "background.question_asked": "❓ Background session needs an answer: {session}",
  "background.permission_asked": "🔐 Background session requested permissions: {session}",
  "background.open_session_button": "Open session",
    "cmd.description.refresh": "Refresh session information",

  "cmd.description.help": "Справка",
  "cmd.description.open": "Добавить проект через обзор папок",

  "callback.unknown_command": "Неизвестная команда",
  "callback.processing_error": "Ошибка обработки",

  "error.load_agents": "❌ Ошибка при загрузке списка агентов",
  "error.load_models": "❌ Ошибка при загрузке списка моделей",
  "error.load_variants": "❌ Ошибка при загрузке списка вариантов",
  "error.context_button": "❌ Ошибка при обработке кнопки контекста",
  "error.generic": "🔴 Произошла ошибка.",

  "interaction.blocked.expired": "⚠️ Текущая интеракция устарела. Запустите ее снова.",
  "interaction.blocked.expected_callback":
    "⚠️ Для этого шага используйте inline-кнопки или нажмите Отмена.",
  "interaction.blocked.expected_text": "⚠️ Для этого шага отправьте текстовое сообщение.",
  "interaction.blocked.expected_command": "⚠️ Для этого шага отправьте команду.",
  "interaction.blocked.command_not_allowed": "⚠️ Эта команда недоступна на текущем шаге.",
  "interaction.blocked.finish_current":
    "⚠️ Сначала завершите текущую интеракцию (ответьте или отмените), затем откройте другое меню.",

  "inline.blocked.expected_choice": "⚠️ Выберите вариант через inline-кнопки или нажмите Отмена.",
  "inline.blocked.command_not_allowed": "⚠️ Эта команда недоступна, пока активно inline-меню.",

  "question.blocked.expected_answer":
    "⚠️ Ответьте на текущий вопрос кнопками, через Свой ответ, или нажмите Отмена.",
  "question.blocked.command_not_allowed":
    "⚠️ Эта команда недоступна, пока не завершен текущий опрос.",

  "inline.button.cancel": "❌ Отмена",
  "inline.inactive_callback": "Это меню уже неактивно",
  "inline.cancelled_callback": "Отменено",

  "common.unknown": "неизвестна",
  "common.unknown_error": "неизвестная ошибка",

  "start.welcome":
    "👋 Добро пожаловать в OpenCode Telegram Group Topics Bot!\n\nИспользуйте команды:\n/projects — выбрать проект\n/sessions — список сессий\n/new — новая сессия\n/status — статус\n/help — справка\n\nРежим, модель и вариант выбираются кнопками внизу.",
  "help.keyboard_hint":
    "💡 Режим, модель, вариант и действия с контекстом доступны через нижние кнопки клавиатуры.",
  "help.text":
    "📖 **Справка**\n\n/status - Проверить статус сервера\n/sessions - Список сессий\n/new - Создать новую сессию\n/help - Справка",

  "bot.thinking": "💭 Думаю...",
  "bot.project_not_selected": "🏗 Проект не выбран.\n\nСначала выберите проект командой /projects.",
  "bot.creating_session": "🔄 Создаю новую сессию...",
  "bot.create_session_error":
    "🔴 Не удалось создать сессию. Попробуйте команду /new или проверьте статус сервера /status.",
  "bot.session_created": "✅ Сессия создана: {title}",
  "bot.session_busy":
    "⏳ Предыдущий запрос все еще выполняется, поэтому новый не был запущен.\n\nПочему так: в одной сессии OpenCode обрабатывает только один активный запуск одновременно.\nЧто делать: дождитесь ответа, либо используйте /abort, если процесс завис, и отправьте сообщение снова.",
  "bot.session_queued":
    "📝 Ваше сообщение поставлено в очередь для этой сессии.\n\nПозиция в очереди: {position}\nЧто будет дальше: оно запустится автоматически после завершения текущего запуска.",
    "bot.session_queued_cancel": "❌ Cancel queued message",
  "bot.session_queue_cancelled": "❌ Queued message cancelled, it will not run.\n\nCancelled message:\n{preview}",
  "bot.session_queue_cancelled_callback": "❌ Queued message cancelled",
  "bot.session_queue_cancel_missing": "⚠️ That queued message already started or was cancelled.",
"bot.session_queue_started":
    "▶️ Запускается следующее сообщение из очереди для этой сессии.\n\nСообщение из очереди:\n{preview}",
  "bot.session_reset_project_mismatch":
    "⚠️ Активная сессия не соответствует выбранному проекту, поэтому была сброшена. Используйте /sessions для выбора или /new для создания новой сессии.",
  "bot.prompt_send_error":
    "⚠️ Не удалось передать это сообщение в OpenCode.\n\nВозможная причина: временный сбой соединения между ботом и сервером OpenCode.\nЧто делать: отправьте сообщение еще раз. Если ошибка повторяется, выполните /status и проверьте доступность OpenCode.",
  "bot.prompt_send_error_session_not_found":
    "⚠️ Не удалось передать сообщение, потому что активная сессия больше недоступна.\n\nПочему так: сессия могла быть сброшена, переключена или удалена.\nЧто делать: выберите сессию через /sessions или создайте новую через /new, затем отправьте сообщение снова.",
  "bot.session_error": "🔴 OpenCode вернул ошибку: {message}",
  "bot.session_error_invalid_request":
    "🔴 The model rejected the request: {message}\n\nThe session context is probably too large or corrupted, retrying will not help. Compact it from 🎛️ Session Control, or start fresh with /new.",
  "bot.session_retry":
    "🔁 {message}\n\nПровайдер возвращает одну и ту же ошибку при повторных запросах. Используйте /abort для остановки.",
  "bot.session_retry_wait": "🔁 {message}\n\n⏳ Retrying in {wait}.",
  "bot.unknown_command": "⚠️ Неизвестная команда: {command}. Используйте /help для списка команд.",
  "bot.photo_downloading": "⏳ Скачиваю фото...",
  "bot.photo_too_large": "⚠️ Фото слишком большое (макс. {maxSizeMb}МБ)",
  "bot.photo_model_no_image":
    "⚠️ Текущая модель не поддерживает изображения. Отправляю только текст.",
  "bot.photo_download_error": "🔴 Не удалось скачать фото",
  "bot.photo_no_caption": "💡 Совет: Добавьте подпись, чтобы описать, что делать с этим фото.",
  "bot.file_downloading": "⏳ Скачиваю файл...",
  "bot.file_too_large": "⚠️ Файл слишком большой (макс. {maxSizeMb}МБ)",
  "bot.file_download_error": "🔴 Не удалось скачать файл",
  "bot.model_no_pdf": "⚠️ Текущая модель не поддерживает PDF. Отправляю только текст.",
  "bot.text_file_too_large": "⚠️ Текстовый файл слишком большой (макс. {maxSizeKb}КБ)",

  "status.header_running": "🟢 OpenCode Server запущен",
  "status.health.healthy": "Healthy",
  "status.health.unhealthy": "Unhealthy",
  "status.line.health": "Статус: {health}",
  "status.line.version": "Версия: {version}",
  "status.line.managed_yes": "Управляется ботом: Да",
  "status.line.managed_no": "Управляется ботом: Нет",
  "status.line.pid": "PID: {pid}",
  "status.line.uptime_sec": "Uptime: {seconds} сек",
  "status.line.mode": "Агент: {mode}",
  "status.line.model": "Модель: {model}",
  "status.line.tts": "TTS-ответы: {tts}",
  "status.tts.on": "Вкл",
  "status.tts.off": "Выкл",
  "status.agent_not_set": "не установлен",
  "status.project_selected": "🏗 Проект: {project}",
  "status.project_not_selected": "🏗 Проект: не выбран",
  "status.project_hint": "Используйте /projects для выбора проекта",
  "status.session_selected": "📋 Текущая сессия: {title}",
  "status.session_not_selected": "📋 Текущая сессия: не выбрана",
  "status.session_hint": "Используйте /sessions для выбора или /new для создания",
  "status.server_unavailable":
    "🔴 OpenCode Server недоступен\n\nИспользуйте /opencode_start для запуска сервера.",

  "tts.enabled": "🔊 Аудиоответы включены глобально.",
  "tts.not_configured": "⚠️ Аудиоответы недоступны. Сначала укажите `TTS_API_URL` и `TTS_API_KEY`.",
  "tts.disabled": "🔇 Аудиоответы выключены глобально.",
  "tts.failed": "⚠️ Не удалось создать аудиоответ.",

  "projects.empty":
    "📭 Проектов нет.\n\nОткройте директорию в OpenCode и создайте хотя бы одну сессию, после этого она появится здесь.",
  "projects.select": "Выберите проект:",
  "projects.select_with_current": "Выберите проект:\n\nТекущий: 🏗 {project}",
  "projects.page_indicator": "Страница {current}/{total}",
  "projects.prev_page": "⬅️ Назад",
  "projects.next_page": "Вперёд ➡️",
  "projects.fetch_error":
    "🔴 OpenCode Server недоступен или произошла ошибка при получении списка проектов.",
  "projects.page_load_error": "Не удалось загрузить эту страницу. Попробуйте снова.",
  "projects.selected":
    "✅ Проект выбран: {project}\n\n📋 Сессия сброшена. Используйте /sessions или /new для работы с этим проектом.",
  "projects.select_error": "🔴 Ошибка при выборе проекта.",
  "projects.locked.topic_scope":
    "⚠️ Этот топик привязан к собственному контексту проекта/сессии. Переключайте проекты только из General до создания топиков.",
  "projects.locked.group_project":
    "⚠️ Эта группа уже настроена для проекта: {project}. Создайте новую группу, если хотите работать с другим репозиторием.",
  "projects.locked.callback": "Смена проекта для этой группы заблокирована.",

  "open.back": "⬆️ Наверх",
  "open.roots": "📋 К списку корней",
  "open.prev_page": "⬅️ Назад",
  "open.next_page": "Далее ➡️",
  "open.select_current": "✅ Выбрать эту папку",
  "open.select_root": "📂 Выберите корневой каталог для просмотра:",
  "open.access_denied": "⛔ Доступ запрещён: путь за пределами разрешённых каталогов",
  "open.scan_error": "🔴 Не удалось открыть каталог: {error}",
  "open.open_error": "🔴 Не удалось открыть обозреватель каталогов.",
  "open.menu_expired": "⌛ Это меню устарело после перезапуска. Выполните команду ещё раз.",
  "open.selected":
    "✅ Проект добавлен: {project}\n\n📋 Используйте /sessions или /new для начала работы.",
  "open.select_error": "🔴 Не удалось добавить проект.",
  "open.no_subfolders": "📭 Нет подпапок",
  "open.subfolder_count": "{count} подпапка",
  "open.subfolders_count": "{count} подпапок",

  "sessions.project_not_selected":
    "🏗 Проект не выбран.\n\nСначала выберите проект командой /projects.",
  "sessions.empty": "📭 Сессий нет.\n\nСоздайте новую сессию командой /new.",
  "sessions.select": "Выберите сессию:",
  "sessions.select_page": "Выберите сессию (страница {page}):",
  "sessions.fetch_error":
    "🔴 OpenCode Server недоступен или произошла ошибка при получении списка сессий.",
  "sessions.select_project_first": "🔴 Проект не выбран. Используйте /projects.",
  "sessions.page_empty_callback": "На этой странице нет сессий",
  "sessions.page_load_error_callback":
    "Не удалось загрузить эту страницу. Пожалуйста, попробуйте снова.",
  "sessions.button.prev_page": "⬅️ Назад",
  "sessions.button.next_page": "Вперёд ➡️",
  "sessions.topic_locked":
    "⚠️ Эта тема привязана к текущей сессии. Используйте /new в General, чтобы создать новую тему.",
  "sessions.general_overview": "Обзор сессий по темам:",
  "sessions.general_item": "• {topic} (тред #{thread}) - {status}",
  "sessions.general_empty": "Тем сессий пока нет. Используйте /new для создания.",
  "sessions.bound_topic_link": "🔗 Топик для этой сессии: {url}",
  "sessions.created_topic_link": "✅ Топик для этой сессии создан: {url}",
  "sessions.loading_context": "⏳ Загружаю контекст и последние сообщения...",
  "sessions.selected": "✅ Сессия выбрана: {title}",
  "sessions.select_error": "🔴 Ошибка при выборе сессии.",
  "sessions.preview.empty": "Последних сообщений нет.",
  "sessions.preview.title": "Последние сообщения:",
  "sessions.preview.you": "Вы:",
  "sessions.preview.agent": "Агент:",
  "sessions.resume.assistant_title": "Последнее сообщение агента:",
  "sessions.resume.last_turn_title": "Последнее видимое сообщение:",

  "last.title": "Последнее сообщение:",
  "last.session_not_selected": "📋 Сессия не выбрана. Сначала используйте /sessions или /new.",
  "last.empty": "В этой сессии нет недавних видимых сообщений.",
  "last.fetch_error": "🔴 Не удалось загрузить последнее сообщение сессии.",

  "new.project_not_selected": "🏗 Проект не выбран.\n\nСначала выберите проект командой /projects.",
  "new.created": "✅ Создана новая сессия: {title}",
  "new.topic_only_in_general":
    "⚠️ Запустите /new в теме General, чтобы создать отдельную тему сессии.",
  "new.requires_forum_general":
    "⚠️ /new требует тему General в супергруппе с включёнными форумами.",
  "new.topic_created": "✅ Тема сессии готова: {title}",
  "new.general_created": "✅ Созданы новая сессия OpenCode и тема группы.",
  "new.topic_create_error":
    "🔴 Не удалось создать тему сессии. Проверьте права форума и попробуйте снова.",
  "new.topic_create_no_rights":
    '🔴 Я не могу создавать темы форума в этой группе. Выдайте боту право "Управление темами" и повторите /new.',
  "new.general_open_link": "🔗 Открыть тему: {url}",
  "new.create_error": "🔴 OpenCode Server недоступен или произошла ошибка при создании сессии.",

  "task.project_not_selected":
    "🏗 Проект не выбран.\n\nСначала выберите проект командой /projects.",
  "task.output_topic_blocked":
    "⚠️ Промпты отключены в Scheduled Task Output. Используйте 🎛️ Session Control для управления проектами, сессиями и отложенными задачами.",
  "task.output_topic_commands_only":
    "⚠️ Большинство команд отключено в Scheduled Task Output. Используйте 🎛️ Session Control для управления проектами, сессиями и отложенными задачами.",
  "task.schedule_prompt":
    "Отправьте расписание для этой задачи. Примеры: `каждый будний день в 09:00` или `завтра в 18:30`.\n\nПосле разбора расписания вы еще можете изменить настройки агента и модели из 🎛️ Session Control перед отправкой финального промпта.",
  "task.schedule_parsing": "⏳ Я все еще разбираю расписание. Дождитесь предпросмотра.",
  "task.schedule_preview":
    "Расписание распознано.\n\nОписание: {summary}\nСледующий запуск: {nextRunAt}",
  "task.prompt_prompt":
    "Отправьте промпт для этой отложенной задачи. Вы все еще можете изменить агента, модель или вариант из 🎛️ Session Control; задача использует те значения, которые активны в момент отправки финального промпта.",
  "task.schedule_error":
    "⚠️ Я не смог разобрать это расписание: {message}\n\nОтправьте более понятное описание.",
  "task.created":
    "✅ Отложенная задача создана.\n\nРасписание: {summary}\nСледующий запуск: {nextRunAt}",
  "task.created_topic_link": "🔗 Запуски по расписанию будут публиковаться здесь: {url}",
  "task.create_error": "🔴 Не удалось создать отложенную задачу.",
  "task.blocked.expected_text":
    "⚠️ Сначала завершите настройку отложенной задачи или используйте /abort для отмены.",
  "task.blocked.command_not_allowed":
    "⚠️ Эта команда недоступна, пока активна настройка отложенной задачи.",
  "task.blocked.finish_or_abort_to_change_defaults":
    "⚠️ Эта задача уже запомнила текущие настройки по умолчанию из 🎛️ Session Control. Завершите ее как есть или используйте /abort и снова запустите /task, если нужны другие настройки.",
  "task.blocked.only_defaults_before_prompt":
    "⚠️ Идет настройка отложенной задачи. До отправки финального промпта можно менять только значения агента, модели или варианта; иначе завершите настройку или используйте /abort.",
  "task.list.title": "Отложенные задачи:",
  "task.list.empty": "📭 Для этого проекта в этом чате нет отложенных задач.",
  "task.list.none": "не запланировано",
  "task.list.next_run": "Следующий запуск: {value}",
  "task.list.status": "Статус: {value}",
  "task.list.prompt": "Промпт: {value}",
  "task.list.delete_button": "Удалить #{index}",
  "task.list.deleted": "Отложенная задача удалена",
  "task.list.delete_missing": "Отложенная задача не найдена",
  "task.list.delete_error": "Не удалось удалить отложенную задачу",

  "cleanup.topic_use_general": "⚠️ Выполните /cleanup из темы General.",
  "cleanup.requires_forum_general":
    "⚠️ /cleanup доступен только в теме General супергруппы с включёнными форумами.",
  "cleanup.no_topics": "✅ Нет тем сессий для очистки.",
  "cleanup.result":
    "🧹 Очистка завершена. Проверено: {inspected}, закрыто: {closed}, пропущено: {skipped}, ошибок: {failed}.",

  "stop.no_active_session":
    "🛑 Агент не был запущен\n\nСначала создайте сессию командой /new или выберите существующую через /sessions.",
  "stop.cancelled_interaction":
    "✅ Текущая настройка отменена. Теперь можно изменить параметры по умолчанию или начать заново.",
  "stop.in_progress":
    "🛑 Отключил поток событий и отправляю сигнал прерывания...\n\nОжидание остановки агента.",
  "stop.warn_unconfirmed":
    "⚠️ Поток событий остановлен, но сервер не подтвердил прерывание.\n\nПроверьте /status и повторите /abort через пару секунд.",
  "stop.warn_maybe_finished":
    "⚠️ Поток событий остановлен, но агент мог уже завершиться к моменту запроса.",
  "stop.success":
    "✅ Действие агента прервано. Новые сообщения от текущего запуска больше не придут.",
  "stop.warn_still_busy":
    "⚠️ Сигнал отправлен, но агент еще busy.\n\nПоток событий уже отключен, поэтому бот не будет присылать промежуточные сообщения.",
  "stop.warn_timeout":
    "⚠️ Таймаут запроса на прерывание.\n\nПоток событий уже отключен, повторите /abort через пару секунд.",
  "stop.warn_local_only":
    "⚠️ Поток событий остановлен локально, но при прерывании на сервере произошла ошибка.",
  "stop.error":
    "🔴 Ошибка при прерывании действия.\n\nПоток событий остановлен, попробуйте /abort еще раз.",

  "opencode_start.already_running_managed":
    "⚠️ OpenCode Server уже запущен\n\nPID: {pid}\nUptime: {seconds} секунд",
  "opencode_start.already_running_external":
    "✅ OpenCode Server уже запущен внешним процессом\n\nВерсия: {version}\n\nЭтот сервер не был запущен через бота, поэтому команда /opencode-stop не сможет его остановить.",
  "opencode_start.starting": "🔄 Запускаю OpenCode Server...",
  "opencode_start.start_error":
    "🔴 Не удалось запустить OpenCode Server\n\nОшибка: {error}\n\nПроверьте, что OpenCode CLI установлен и доступен в PATH:\nopencode --version\nnpm install -g @opencode-ai/cli",
  "opencode_start.started_not_ready":
    "⚠️ OpenCode Server запущен, но не отвечает\n\nPID: {pid}\n\nСервер может запускаться. Попробуйте /status через несколько секунд.",
  "opencode_start.success": "✅ OpenCode Server успешно запущен\n\nPID: {pid}\nВерсия: {version}",
  "opencode_start.error":
    "🔴 Произошла ошибка при запуске сервера.\n\nПроверьте логи приложения для подробностей.",
  "opencode_stop.external_running":
    "⚠️ OpenCode Server запущен внешним процессом\n\nЭтот сервер не был запущен через /opencode-start.\nОстановите его вручную или используйте /status для проверки состояния.",
  "opencode_stop.not_running": "⚠️ OpenCode Server не запущен",
  "opencode_stop.stopping": "🛑 Останавливаю OpenCode Server...\n\nPID: {pid}",
  "opencode_stop.stop_error": "🔴 Не удалось остановить OpenCode Server\n\nОшибка: {error}",
  "opencode_stop.success": "✅ OpenCode Server успешно остановлен",
  "opencode_stop.error":
    "🔴 Произошла ошибка при остановке сервера.\n\nПроверьте логи приложения для подробностей.",

  "reload.reloading": "🔄 Reloading OpenCode configuration…",
  "reload.success": "✅ OpenCode configuration reloaded.",
  "reload.failed": "❌ Failed to reload the OpenCode configuration.",
  "reload.v1_not_supported": "⚠️ /reload needs an OpenCode V2 server (set OPENCODE_SERVER_VERSION=v2).",

  "recent.heading": "Recent sessions across projects:",
  "recent.empty": "📭 No recent sessions found.",
  "recent.selected": "✅ Session selected: {title} ({project})",
  "recent.topic_locked": "⚠️ /recent works in General or DM, not inside a session topic.",

  "agent.changed_callback": "Режим изменен: {name}",
  "agent.changed_message": "✅ Режим изменен на: {name}",
  "agent.change_error_callback": "Ошибка при смене агента",
  "agent.menu.current": "Текущий агент: {name}\n\nВыберите агента:",
  "agent.menu.select": "Выберите агента:",
  "agent.menu.empty": "⚠️ Нет доступных агентов",
  "agent.menu.error": "🔴 Не удалось получить список агентов",

  "model.changed_callback": "Модель изменена: {name}",
  "model.changed_message": "✅ Модель изменена на: {name}",
  "model.change_error_callback": "Ошибка при смене модели",
  "model.menu.empty": "⚠️ Нет доступных моделей",
  "model.menu.select": "Выберите модель:",
  "model.menu.current": "Текущая модель: {name}\n\nВыберите модель:",
  "model.menu.favorites_title": "⭐ Избранное (Добавляйте модели в избранное через OpenCode CLI)",
  "model.menu.favorites_empty": "— Список пуст.",
  "model.menu.recent_title": "🕘 Недавние",
  "model.menu.recent_empty": "— Список пуст.",
  "model.menu.favorites_hint":
    "ℹ️ Добавляйте модели в избранное через OpenCode CLI, чтобы они были вверху списка.",
  "model.menu.error": "🔴 Не удалось получить список моделей",

  "model.search.button": "🔍 Search",
  "model.search.prompt": "🔍 Enter model name to search:",
  "model.search.results_title": "Search results for \"{query}\":",
  "model.search.no_results": "No models found for \"{query}\"",
  "model.search.search_again": "↩ Search again",
  "model.search.error": "Search failed",
  "model.search.cancelled": "Model search cancelled.",
  "model.search.cancel": "Cancel",
  "model.search.added_favorite": "⭐ Added to favorites",
  "model.search.removed_favorite": "Removed from favorites",

  "variant.model_not_selected_callback": "Ошибка: модель не выбрана",
  "variant.changed_callback": "Вариант изменен: {name}",
  "variant.changed_message": "✅ Вариант изменен на: {name}",
  "variant.change_error_callback": "Ошибка при смене варианта",
  "variant.select_model_first": "⚠️ Сначала выберите модель",
  "variant.menu.empty": "⚠️ Нет доступных вариантов",
  "variant.menu.current": "Текущий вариант: {name}\n\nВыберите вариант:",
  "variant.menu.error": "🔴 Не удалось получить список вариантов",

  "context.button.confirm": "✅ Да, сжать контекст",
  "context.no_active_session": "⚠️ Нет активной сессии. Создайте сессию командой /new",
  "context.confirm_text":
    '📊 Сжатие контекста для сессии "{title}"\n\nЭто уменьшит использование контекста, удалив старые сообщения из истории. Текущая задача не будет прервана.\n\nПродолжить?',
  "context.general_not_available":
    "⚠️ Сжатие контекста доступно только внутри топика сессии, а не в General.",
  "context.general_not_available_callback": "Сначала откройте топик сессии.",
  "context.callback_session_not_found": "Сессия не найдена",
  "context.callback_compacting": "Сжатие контекста...",
  "context.progress": "⏳ Сжимаю контекст...",
  "context.error": "❌ Ошибка при сжатии контекста",
  "context.success": "✅ Контекст успешно сжат",
  "context.after_compaction": "✅ Окно контекста после сжатия: {context}",

  "permission.inactive_callback": "Запрос разрешения неактивен",
  "permission.processing_error_callback": "Ошибка при обработке",
  "permission.no_active_request_callback": "Ошибка: нет активного запроса",
  "permission.reply.once": "Разрешено однократно",
  "permission.reply.always": "Разрешено всегда",
  "permission.reply.reject": "Отклонено",
  "permission.send_reply_error": "❌ Не удалось отправить ответ на запрос разрешения",
  "permission.blocked.expected_reply": "⚠️ Сначала ответьте на запрос разрешения кнопками выше.",
  "permission.blocked.command_not_allowed":
    "⚠️ Эта команда недоступна, пока вы не ответите на запрос разрешения.",
  "permission.header": "{emoji} Запрос разрешения: {name}\n\n",
  "permission.button.allow": "✅ Разрешить один раз",
  "permission.button.always": "🔓 Разрешить всегда",
  "permission.button.reject": "❌ Отклонить",
  "permission.name.bash": "Bash",
  "permission.name.edit": "Edit",
  "permission.name.write": "Write",
  "permission.name.read": "Read",
  "permission.name.webfetch": "Web Fetch",
  "permission.name.websearch": "Web Search",
  "permission.name.glob": "File Search",
  "permission.name.grep": "Content Search",
  "permission.name.list": "List Directory",
  "permission.name.task": "Task",
  "permission.name.lsp": "LSP",
  "permission.name.external_directory": "Внешняя директория",

  "question.inactive_callback": "Опрос неактивен",
  "question.processing_error_callback": "Ошибка при обработке",
  "question.select_one_required_callback": "Выберите хотя бы один вариант",
  "question.enter_custom_callback": "Введите свой ответ сообщением",
  "question.cancelled": "❌ Опрос отменен",
  "question.settled_outside.answered": "☑️ Answered outside Telegram",
  "question.settled_outside.cancelled": "❌ Cancelled outside Telegram",
  "question.answer_already_received": "Ответ уже получен, подождите...",
  "question.completed_no_answers": "✅ Опрос завершен (без ответов)",
  "question.no_active_project": "❌ Нет активного проекта",
  "question.no_active_request": "❌ Нет активного запроса",
  "question.send_answers_error": "❌ Не удалось отправить ответы агенту",
  "question.multi_hint": "\n(Можно выбрать несколько вариантов)",
  "question.button.submit": "✅ Готово",
  "question.button.custom": "🔤 Свой ответ",
  "question.button.cancel": "❌ Отмена",
  "question.use_custom_button_first":
    '⚠️ Чтобы отправить текст, сначала нажмите кнопку "Свой ответ" для текущего вопроса.',
  "question.summary.title": "✅ Опрос завершен!\n\n",
  "question.summary.question": "Вопрос {index}:\n{question}\n\n",
  "question.summary.answer": "Ответ:\n{answer}\n\n",

  "keyboard.agent_mode": "{emoji} {name} Agent",
  "keyboard.context": "📊 {used} / {limit} ({percent}%)",
  "keyboard.context_empty": "📊 Управление",
  "keyboard.general_defaults": "Параметры новой сессии:",
  "keyboard.general_defaults_info":
    "Эти значения будут применяться к новым сессиям, созданным в этой группе:\n• Агент\n• Модель\n• Вариант",
  "keyboard.variant": "💭 {name}",
  "keyboard.variant_default": "💡 Default",
  "keyboard.updated": "⌨️ Клавиатура обновлена",
  "keyboard.dm.status": "/status",
  "keyboard.dm.help": "/help",
  "keyboard.dm.opencode_start": "/opencode_start",
  "keyboard.dm.opencode_stop": "/opencode_stop",

  "pinned.default_session_title": "new session",
  "pinned.unknown": "Unknown",
  "pinned.line.project": "Project: {project}",
  "pinned.line.model": "Model: {model}",
  "pinned.line.context": "Context: {used} / {limit} ({percent}%)",
  "pinned.line.cost": "Cost: {cost}",
  "subagent.completed": "Completed",
  "subagent.failed": "Failed",
  "subagent.working": "Working",
  "subagent.line.task": "Task: {task}",
  "subagent.line.agent": "Agent: {agent}",
  "subagent.topic_readonly": "🧩 This topic is a subagent transcript (read-only). Send prompts in the parent topic.",
  "pinned.files.title": "Files ({count}):",
  "pinned.files.item": "  {path}{diff}",
  "pinned.files.more": "  ... and {count} more",

  "tool.todo.overflow": "*(ещё {count} задач)*",
  "tool.file_header.write":
    "Write File/Path: {path}\n============================================================\n\n",
  "tool.file_header.edit":
    "Edit File/Path: {path}\n============================================================\n\n",
  "tool.background_button": "⏪ В фон",
  "tool.background_offer":
    "⏳ Эта команда всё ещё выполняется:\n{command}\n\nОтправить в фон и заняться другим?",
  "tool.background_no_command": "длинную команду",
  "tool.background_started": "⏪ В фоне. Продолжает выполняться; сообщу, когда завершится.",
  "tool.background_started_callback": "⏪ Отправлено в фон",
  "tool.background_error": "Не удалось отправить в фон.",

  "runtime.wizard.ask_token": "Введите токен Telegram-бота (получить у @BotFather).\n> ",
  "runtime.wizard.ask_language":
    "Выберите язык интерфейса.\nВведите номер языка из списка или код локали.\nНажмите Enter, чтобы оставить язык по умолчанию: {defaultLocale}\n{options}\n> ",
  "runtime.wizard.language_invalid":
    "Введите номер языка из списка или поддерживаемый код локали.\n",
  "runtime.wizard.language_selected": "Выбран язык: {language}\n",
  "runtime.wizard.token_required": "Токен обязателен. Попробуйте еще раз.\n",
  "runtime.wizard.token_invalid":
    "Похоже на невалидный токен (ожидается формат <id>:<secret>). Попробуйте еще раз.\n",
  "runtime.wizard.ask_user_id": "Введите ваш Telegram User ID (можно узнать у @userinfobot).\n> ",
  "runtime.wizard.user_id_invalid": "Введите положительное целое число (> 0).\n",
  "runtime.wizard.ask_api_url":
    "Введите URL OpenCode API (опционально).\nНажмите Enter для значения по умолчанию: {defaultUrl}\n> ",
  "runtime.wizard.ask_server_username":
    "Введите имя пользователя сервера OpenCode (опционально).\nНажмите Enter для значения по умолчанию: {defaultUsername}\n> ",
  "runtime.wizard.ask_server_password":
    "Введите пароль сервера OpenCode (опционально, ввод скрыт).\nНажмите Enter, чтобы пропустить.\n> ",
  "runtime.wizard.api_url_invalid":
    "Введите корректный URL (http/https) или нажмите Enter для значения по умолчанию.\n",
  "runtime.wizard.start": "Настройка OpenCode Telegram Group Topics Bot.\n",
  "runtime.wizard.saved": "Конфигурация сохранена:\n- {envPath}\n- {settingsPath}\n",
  "runtime.wizard.not_configured_starting":
    "Приложение еще не сконфигурировано. Запускаю wizard...\n",
  "runtime.wizard.tty_required":
    "Интерактивный wizard требует TTY-терминал. Запустите `opencode-telegram-group-topics-bot config` в интерактивной оболочке.",

  "rename.no_session": "⚠️ Нет активной сессии. Сначала создайте или выберите сессию.",
  "rename.prompt": "📝 Введите новое название сессии:\n\nТекущее: {title}",
  "rename.empty_title": "⚠️ Название не может быть пустым.",
  "rename.success": "✅ Сессия переименована в: {title}",
  "rename.error": "🔴 Не удалось переименовать сессию.",
  "rename.cancelled": "❌ Переименование отменено.",
  "rename.inactive_callback": "Запрос переименования неактивен",
  "rename.inactive": "⚠️ Запрос переименования неактивен. Выполните /rename снова.",
  "rename.blocked.expected_name":
    "⚠️ Введите новое название текстом или нажмите Отмена в сообщении переименования.",
  "rename.blocked.command_not_allowed":
    "⚠️ Эта команда недоступна, пока ожидается новое название сессии.",
  "rename.button.cancel": "❌ Отмена",

  "commands.select": "Выберите команду OpenCode:",
  "commands.empty": "📭 Для этого проекта нет доступных команд OpenCode.",
  "commands.fetch_error": "🔴 Не удалось загрузить список команд OpenCode.",
  "commands.no_description": "Без описания",
  "commands.select_page": "Выберите команду OpenCode ({current}/{total}):",
  "commands.button.execute": "✅ Выполнить",
  "commands.button.prev_page": "⬅️ Назад",
  "commands.button.next_page": "Далее ➡️",
  "commands.button.cancel": "❌ Отмена",
  "commands.confirm":
    "Выполнить {command}? Отправьте текстовым сообщением аргументы или нажмите Выполнить, чтобы запустить команду без изменений.",
  "commands.inactive_callback": "Это меню команд уже неактивно",
  "commands.cancelled_callback": "Отменено",
  "commands.execute_callback": "Запускаю команду...",
  "commands.executing": "⚡ Запускаю команду OpenCode\n{command}",
  "commands.arguments_empty":
    "⚠️ Аргументы не могут быть пустыми. Отправьте текст или нажмите Выполнить.",
  "commands.execute_error": "🔴 Не удалось выполнить команду OpenCode.",

  "cmd.description.trust": "Trust level for auto-approving permissions",
  "trust.choose": "How should I handle permission requests for this session?\n\nCurrent: {level}",
  "trust.current": "Trust level: {level}",
  "trust.no_session": "No active session.",
  "trust.invalid": "Use: ask, edits or all.",
  "trust.level.ask": "Ask everything",
  "trust.level.edits": "Auto-approve reads and edits",
  "trust.level.all": "Auto-approve everything",
  "cmd.description.retry": "Resend the last prompt",
  "retry.no_session": "No active session.",
  "retry.load_error": "Could not load the last message.",
  "retry.empty": "No previous user message in this session.",
  "retry.resending": "Resending:\n{preview}",
  "cmd.description.diff": "Show changed files in this session",
  "diff.no_session": "No active session.",
  "diff.load_error": "Could not load changed files.",
  "diff.empty": "No changes in this session.",
  "diff.title": "Changed files in: {title}",
  "cmd.description.commit": "Commit session changes with a message",
  "commit.no_session": "No active session.",
  "commit.need_message": "Send a message: /commit your message here.",
  "commit.nothing": "Nothing to commit, working tree is clean.",
  "commit.success": "Committed: {hash}",
  "commit.error": "Commit failed. Check the worktree is a git repo.",
  "cmd.description.cost": "Show session and daily spend",
  "cost.no_session": "No active session.",
  "cost.report": "Cost for: {title}\n\nThis session: {session}\nToday ({day}): {today}\nBudget: {budget}",
  "cost.budget_off": "not set",
  "cost.budget_alert": "Daily budget reached.\n\nSpent today: {today}\nBudget: {budget}",
  "cmd.description.close": "Close this session topic",
  "close.topic_only": "Run /close inside a session topic.",
  "close.no_topic_session": "No active session topic here.",
  "close.topic_prefix": "✅ {name}",
  "close.done": "Session closed: {title}",
  "cmd.description.fork": "Clone this session into a new topic",
  "fork.topic_only": "Run /fork inside a session topic.",
  "fork.no_session": "No active session.",
  "fork.creating": "Cloning session into a new topic...",
  "fork.error": "Could not fork the session.",
  "fork.topic_error": "Session forked, but the topic could not be created.",
  "fork.done": "Fork ready: {title}",
  "cmd.description.share": "Export this session transcript as a file",
  "share.no_session": "No active session.",
  "share.load_error": "Could not load the transcript.",
  "share.empty": "Nothing to share yet.",
  "share.caption": "Transcript: {title}",
  "share.send_error": "Could not send the transcript.",
  "share.too_large": "Транскрипт слишком большой для отправки (более 50 МБ).",
  "cmd.description.saved": "Saved prompt shortcuts",
  "saved.title": "Saved prompts (use /saved run <name>):",
  "saved.empty": "No saved prompts. Add one: /saved add <name> <text>",
  "saved.add_usage": "Use: /saved add <name> <text>",
  "saved.added": "Saved: {name}",
  "saved.del_usage": "Use: /saved del <name>",
  "saved.deleted": "Deleted: {name}",
  "saved.missing": "Not found: {name}",
  "saved.usage": "Use: /saved [list|add|run|del].",
  "task.list.pause_button": "⏸ {index}",
  "task.list.resume_button": "▶ {index}",
  "task.list.run_button": "▶️ {index}",
  "task.list.log_button": "📄 {index}",
  "task.list.paused": "paused",
  "task.list.paused_message": "Task paused",
  "task.list.resumed_message": "Task resumed",
  "task.list.run_scheduled": "Run queued for the next poll",
  "task.list.log_title": "Last run: {summary}\nStatus: {status}\nAt: {runAt}",
  "task.list.log_empty": "No output recorded yet.",
  "task.list.back_button": "Back",
  "cmd.description.queue": "Show and manage the queued messages",
  "queue.title": "\ud83d\udcdd Queued messages for: {title}",
  "queue.empty": "\ud83d\udced No queued messages for this session.",
  "queue.no_session": "\ud83d\udccb No active session.",
  "queue.clear_button": "\ud83e\uddf9 Clear all",
  "queue.cleared": "\ud83e\uddf9 Queue cleared ({count})",
  "queue.cleared_message": "\ud83e\uddf9 Queue cleared. Removed {count} messages.",
  "bot.session_queue_steer": "\u26a1 Interrupt & run now",
  "bot.session_queue_front": "\u23eb Move to front",
  "bot.session_queue_moved_front": "\u23eb Moved to the front of the queue. It will run when the current one finishes.\n\nMessage:\n{preview}",
  "bot.session_queue_moved_front_callback": "\u23eb Moved to front",
  "bot.session_queue_steering": "\u26a1 Interrupting and running now:\n{preview}",
  "bot.session_queue_steering_callback": "\u26a1 Running now",
  "bot.session_queue_steer_failed": "\u26a0\ufe0f Could not redirect. Still queued.",
  "cmd.description.display": "Display options for this chat (toggles + agent)",
  "display.title": "🖥️ Display for this chat: tap to show/hide.\n\nScope: this chat/topic only — other chats keep their own settings.",
  "display.title_topic": "🖥️ Display for this topic: tap to show/hide.\n\nScope: only this chat/topic — other chats keep their own settings.",
  "display.button.agents": "🤖 Agent: {name}",
  "display.button.agents_fallback": "🤖 Agents…",
  "display.flag.thinking": "💭 Thinking",
  "display.flag.toolCalls": "🔧 Tool calls",
  "display.flag.toolFiles": "📎 Tool files",
  "display.flag.codeBlocks": "🧑‍💻 Code as text (❌ = .txt file)",
  "display.flag.background": "🔔 Background notices",
  "display.flag.pcMirror": "🧑 PC prompt mirror",
  "display.flag.linkPreviews": "🔗 Link previews",
  "cmd.description.rename": "Переименовать текущую сессию",

  "cli.usage":
    "Использование:\n  opencode-telegram-group-topics-bot [start] [--mode sources|installed]\n  opencode-telegram-group-topics-bot status\n  opencode-telegram-group-topics-bot stop\n  opencode-telegram-group-topics-bot config [--mode sources|installed]\n\nЗаметки:\n  - Без команды по умолчанию используется `start`\n  - Для `config` по умолчанию используется режим `installed`, если не указан `--mode sources`",
  "cli.placeholder.status":
    "Команда `status` пока работает как заглушка. Реальная проверка статуса появится на этапе service-слоя (Этап 5).",
  "cli.placeholder.stop":
    "Команда `stop` пока работает как заглушка. Реальная остановка фонового процесса появится на этапе service-слоя (Этап 5).",
  "cli.placeholder.unavailable": "Команда недоступна.",
  "cli.error.prefix": "CLI error: {message}",
  "cli.args.unknown_command": "Неизвестная команда: {value}",
  "cli.args.mode_requires_value": "Опция --mode требует значение: sources|installed",
  "cli.args.invalid_mode": "Некорректное значение --mode: {value}. Ожидается sources|installed",
  "cli.args.unknown_option": "Неизвестная опция: {value}",
  "cli.args.mode_only_start": "Опция --mode поддерживается только для команд start и config",

  "legacy.models.fetch_error":
    "🔴 Не удалось получить список моделей. Проверьте статус сервера /status.",
  "legacy.models.empty": "📋 Нет доступных моделей. Настройте провайдеры через OpenCode.",
  "legacy.models.header": "📋 Доступные модели:\n\n",
  "legacy.models.no_provider_models": "  ⚠️ Нет доступных моделей\n",
  "legacy.models.env_hint": "💡 Для использования модели в .env:\n",
  "legacy.models.error": "🔴 Произошла ошибка при получении списка моделей.",

  "stt.recognizing": "🎤 Распознаю аудио...",
  "stt.recognized": "🎤 Распознано:\n{text}",
  "stt.not_configured":
    "🎤 Распознавание голоса не настроено.\n\nУстановите STT_API_URL и STT_API_KEY в .env для включения.",
  "stt.error": "🔴 Не удалось распознать аудио: {error}",
  "stt.empty_result": "🎤 В аудиосообщении не обнаружена речь.",

  "start.welcome_dm":
    "👋 В режиме ЛС доступны только команды статуса/управления ботом и сервером.\n\nДля работы с проектами и сессиями используйте топик в группе.",
  "status.global_overview": "📈 Глобальный обзор",
  "status.global_projects": "Проекты: {count}",
  "status.global_sessions": "Сессии: {count}",
  "dm.restricted.command":
    "⚠️ Команды управления сессией отключены в ЛС. Используйте топик в группе для работы с проектами/сессиями.",
  "dm.restricted.prompt":
    "⚠️ Промпты отключены в ЛС. Используйте топик в группе для запуска задач OpenCode.",
  "help.dm.title": "Команды управления в ЛС",
  "help.dm.command_start": "показать подсказки режима ЛС",
  "help.dm.hint": "Используйте топики в группе для работы с проектами/сессиями.",
  "status.dm.title": "Обзор статуса в ЛС",
  "status.dm.hint": "Используйте топики в группе для запуска сессий OpenCode.",
  "group.general.prompts_disabled":
    "⚠️ Промпты отключены в теме General. Используйте /new, чтобы создать отдельную тему сессии.",
  "topic.unbound":
    "⚠️ Эта тема не связана ни с одной сессией. Перейдите в тему General и выполните /new.",
  "cmd.description.skills": "Skills catalog",
  "topic.worktree_missing":
    "⚠️ This topic is linked to a worktree that is no longer available. Switch to Session Control, choose an available worktree, and create a new topic.",
  "projects.worktree_missing":
    "⚠️ The selected project directory is no longer available. Choose an available project or worktree from /projects.",
  "skills.select": "Choose an OpenCode skill:",
  "skills.empty": "📭 No OpenCode skills are available for this project.",
  "skills.fetch_error": "🔴 Failed to load OpenCode skills.",
  "skills.no_description": "No description",
  "skills.button.execute": "✅ Execute",
  "skills.button.cancel": "❌ Cancel",
  "skills.confirm":
    "Choose how to run skill {skill}. Tap Execute to run it directly, or send text arguments.",
  "skills.inactive_callback": "This skill menu is inactive",
  "skills.cancelled_callback": "Cancelled",
  "skills.execute_callback": "Using skill...",
  "skills.executing_prefix": "⚡ Using skill:",
  "skills.arguments_empty": "⚠️ Arguments cannot be empty. Send text or tap Execute.",
  "skills.select_page": "Choose an OpenCode skill (page {page}):",
  "skills.button.prev_page": "⬅️ Prev",
  "skills.button.next_page": "Next ➡️",
  "skills.page_empty_callback": "No skills on this page",
  "skills.page_load_error_callback": "Cannot load this page. Please try again.",
};
