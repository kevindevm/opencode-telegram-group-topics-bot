# OpenCode Telegram Group Topics Bot

[README en inglés](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Nota: el [`README.md`](./README.md) en inglés sigue siendo la documentación oficial. Si hay diferencias entre este documento y la versión en inglés, prevalece la versión en inglés.

Un bot de Telegram ([grammy](https://grammy.dev/), Node.js 20+) que convierte un supergrupo de Telegram en un **cliente móvil multi-sesión para [OpenCode](https://opencode.ai)**: el topic **General** es el canal de control, y cada sesión de OpenCode obtiene su propio topic de foro con streaming en vivo, un panel de estado fijado, una cola de prompts, flujos de permisos y preguntas, y un botón ⏪ de envío a segundo plano para comandos de shell largos.

Este proyecto es un fork de [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot), de Ruslan Grinev. Usa el upstream para el flujo más simple de un solo chat; usa este fork para sesiones en paralelo en topics de foro, controlable desde tu móvil.

Sin puertos abiertos y sin UI web expuesta. El bot solo habla con tu servidor OpenCode local y con la Bot API de Telegram. Se admiten servidores OpenCode V1 y V2. Un grupo suele corresponder a un repositorio; muchos topics de sesión pueden ejecutarse en paralelo en un mismo grupo, y muchos grupos pueden estar activos a la vez.

Notas de sincronización del fork: [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Contenido

- [De un vistazo](#de-un-vistazo)
- [Capturas de pantalla](#capturas-de-pantalla)
- [Características](#características)
- [Inicio rápido](#inicio-rápido)
- [Flujo de trabajo diario](#flujo-de-trabajo-diario)
- [Trabajo en paralelo y límites de Telegram](#trabajo-en-paralelo-y-límites-de-telegram)
- [Comandos](#comandos)
- [Botón de segundo plano](#botón-de-segundo-plano)
- [Topics de transcripción de subagentes](#topics-de-transcripción-de-subagentes)
- [Menú de visualización](#menú-de-visualización)
- [Configuración](#configuración)
- [Lanzamientos](#lanzamientos)
- [Seguridad](#seguridad)
- [Desarrollo](#desarrollo)
- [Solución de problemas](#solución-de-problemas)
- [Créditos](#créditos)
- [Licencia](#licencia)

## De un vistazo

- Un grupo de Telegram corresponde a un repositorio o espacio de trabajo de un proyecto.
- **General** es el canal de control: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, comprobaciones de estado.
- Cada nueva sesión de OpenCode obtiene su propio topic de foro con su propio estado de sesión, modelo, agente y visualización.
- Los comandos de shell largos ofrecen un botón ⏪ que envía la sesión a segundo plano para que puedas seguir conversando.
- Cada subagente publica su transcripción en su propio topic de solo lectura, junto a una tarjeta de estado en vivo en el topic padre.
- Los prompts escritos en la PC se reflejan en el topic de la sesión como mensajes 🧑, así ambos lados se mantienen sincronizados.
- Un toggle opcional de respuestas de audio TTS se activa globalmente con `/tts` y persiste tras reiniciar.
- Los mensajes directos (DM) sirven para control ligero y consultas de estado, no como flujo principal multi-sesión.

## Capturas de pantalla

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Session topic with live assistant streaming" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Pinned status dashboard and reply keyboard" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Model picker with favorites" />
</p>

## Características

- **Sesiones por topic**: un topic de foro por sesión de OpenCode; General sigue siendo el canal de control y nunca fija nada.
- **Streaming en vivo**: las respuestas del asistente se transmiten con ediciones por hilo y entrega de finalización como respaldo.
- **⏪ Enviar a segundo plano**: los comandos largos de `bash`/`execute` ofrecen un botón que envía la sesión a segundo plano vía `session.background`.
- **🧩 Topics de transcripción de subagentes**: cada subagente obtiene un topic de solo lectura con la transcripción completa en vivo; el topic padre conserva una tarjeta de estado compacta.
- **Paneles fijados**: mensaje fijado por topic con sesión, proyecto, modelo, uso de contexto, costo y archivos modificados.
- **Cola de prompts**: los prompts enviados mientras una sesión está ocupada se ponen en cola, sobreviven a reinicios, y admiten cancelar por mensaje, mover al frente e interrumpir y ejecutar vía `/queue`.
- **Permisos y preguntas**: flujos interactivos de `allow once` / `always` / `reject` y encuestas de preguntas con todas las opciones numeradas en el mensaje, además de botones breves numerados, texto personalizado y respuestas de voz; niveles de confianza por sesión vía `/trust ask|edits|all`.
- **Pie de la respuesta final**: solo el último mensaje de un turno lleva el pie `agent · model · elapsed` (`🛠️ Build · opus · 1m 30s`), así el final de la respuesta siempre es reconocible. Los mensajes anteriores salen sin formato.
- **Selectores y teclado**: controles de modelo, agente, variante y contexto desde el teclado fijo, con los favoritos primero.
- **Menú `/display`**: toggles de mostrar/ocultar por chat/topic, más un atajo de agente y un botón Cancelar; las sobrescritas persisten en `settings.json`.
- **Gestión de sesiones**: `/retry` para el último prompt, `/diff`, `/commit`, seguimiento de gasto con `/cost` y `BUDGET_ALERT_USD`, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, atajos de prompts guardados (`/saved`), comandos personalizados (`/commands`), skills (`/skills`).
- **Tareas programadas**: topic programado por proyecto vía `/task` y `/tasklist` (pausar/reanudar/ejecutar ahora/logs).
- **Voz y archivos**: STT compatible con Whisper para voz/audio, TTS global opcional (`/tts`), adjuntos de imagen/PDF/texto, diffs como archivos o bloques de código en línea.
- **Explorador de proyectos**: `/open` y `/projects` con protección de directorios permitidos.
- **Control del servidor**: autoarranque de OpenCode, `/opencode_start` / `/opencode_stop` remotos, `/reload` de configuración en V2.
- **Control de acceso de usuario único**, sin puertos públicos (el endpoint de health se enlaza solo a `127.0.0.1`).
- **8 idiomas de interfaz** con fallback al inglés.

## Inicio rápido

### 1. Requisitos previos

- Node.js 20+
- OpenCode desde [opencode.ai](https://opencode.ai) o [GitHub](https://github.com/sst/opencode)
- Un bot de Telegram de [@BotFather](https://t.me/BotFather)
- Tu ID numérico de Telegram de [@userinfobot](https://t.me/userinfobot)

### 2. Crear y preparar el grupo de Telegram

1. Crea un nuevo **supergroup** de Telegram para un proyecto/repositorio de OpenCode.
2. Añade tu bot al grupo y hazlo administrador con el permiso **Manage Topics**.
3. Habilita **Topics** en la configuración del grupo.
4. En [@BotFather](https://t.me/BotFather), ejecuta `/setprivacy` para el bot y elige **Disable**.
5. Conserva el topic **General** por defecto: es el canal de control.

### 3. Iniciar OpenCode

Ejecuta OpenCode en la máquina donde vivirá el bot:

```bash
# V1
opencode serve
# V2: use the background service (stable port + credentials).
# A bare `opencode serve` binds a random port with a random password,
# so the bot could never reach it.
opencode service start
```

URL de la API por defecto: `http://localhost:4096` (V1) o `http://127.0.0.1:49374` (V2, define `OPENCODE_SERVER_VERSION=v2`).

### 4. Instalar el bot

#### Opción A: `npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### Opción B: instalación global

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Opción C: ejecutar desde el código fuente

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` es el punto de entrada del CLI compilado que produce `npm run build`.

#### Opción D: Docker

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID
docker compose up -d --build
```

`.env` se queda en el host. Se inyecta en tiempo de ejecución y no se copia dentro de la imagen.

La configuración y el estado en ejecución viven en el volumen `opencode-group-topics-bot-data` (`OPENCODE_TELEGRAM_HOME=/app/data` dentro del contenedor).

**Linux** (OpenCode en el host en `127.0.0.1:4096`): el compose por defecto usa `network_mode: host`, así que el contenedor alcanza tu servidor OpenCode del host y ve las mismas rutas de proyectos.

**Docker Desktop** (macOS/Windows): el networking de host no está disponible, así que usa el archivo de override, que alcanza OpenCode a través de `host.docker.internal`:

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

En Docker Desktop el contenedor no puede ver las rutas de proyectos del host ni ejecutar `opencode` por sí mismo: ejecuta `opencode serve` (V1) o `opencode service start` (V2) en el host y prefiere rutas de `/projects` que se resuelvan dentro del contenedor (monta repos con una entrada extra de `volumes` si hace falta). `/opencode_start` y `/opencode_stop` son funciones solo de host.

Las versiones estables se publican en `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` y `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest` para `linux/amd64` y `linux/arm64`. Los release candidates reciben solo su etiqueta de versión exacta.

#### Opción E: servicio de Windows (NSSM, siempre activo)

Para un setup 24/7 en Windows, ejecuta el bot como servicio nativo con [NSSM](https://nssm.cc):

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

La configuración queda entonces en `%APPDATA%\opencode-telegram-group-topics-bot\.env` (o donde apunte `OPENCODE_TELEGRAM_HOME`): el servicio lee ese archivo, no el `.env` del repositorio. Una tarea programada que ejecuta `opencode pair` al iniciar sesión mantiene el CLI emparejado; el propio servicio gestiona el proceso del bot y lo reinicia si falla.

### 5. Completar el asistente de configuración

El asistente pregunta por:

- idioma de la interfaz
- token del bot de Telegram
- ID del usuario de Telegram permitido
- URL de la API de OpenCode
- usuario/contraseña opcionales del servidor OpenCode

### 6. Verificación inicial

1. Envía un DM al bot y ejecuta `/start`; confirma que contesta.
2. En el topic **General** del grupo, ejecuta `/start`, y después `/status` para confirmar que OpenCode es accesible.
3. Ejecuta `/projects` en **General** y elige el repositorio para este grupo.
4. Ejecuta `/new` en **General** para crear un topic de sesión.
5. Abre el nuevo topic y envía un prompt.

Si eso funciona, el espacio de trabajo del grupo está listo.

## Flujo de trabajo diario

1. Inicia OpenCode (`opencode serve` en V1, `opencode service start` en V2), luego inicia el bot.
2. Abre el grupo de Telegram y ve a **General**.
3. Usa `/projects` para confirmar el repositorio elegido.
4. Usa `/new` para crear un topic de sesión nuevo.
5. Trabaja dentro del hilo del topic; si un comando de shell tarda mucho, toca ⏪ para enviarlo a segundo plano.
6. Usa `/sessions` en **General** para volver a topics de sesiones anteriores.

## Trabajo en paralelo y límites de Telegram

- Este fork está diseñado para el trabajo en paralelo: muchos topics en un grupo, y muchos grupos entre proyectos.
- Telegram aplica límites de velocidad de mensajes, especialmente cuando muchos topics reciben actualizaciones a la vez.
- El bot ralentiza o escalona las actualizaciones de Telegram cuando hace falta (ver `SERVICE_MESSAGES_INTERVAL_SEC`, mantener `>= 2`).
- Las sesiones de OpenCode siguen ejecutándose aunque las actualizaciones de Telegram se vuelvan menos frecuentes: espera menos mensajes en tiempo real por topic con carga alta, no trabajo perdido.

## Comandos

Cualquier mensaje de texto normal en un topic de sesión se trata como un prompt cuando no hay ninguna interacción bloqueante activa. Las acciones de modelo, agente, variante y contexto están disponibles desde el teclado fijo inferior.

| Comando           | Descripción                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `/status`         | Estado del servidor y de la sesión                                        |
| `/new`            | Crear una sesión nueva                                                    |
| `/abort`          | Abortar la acción en curso                                                |
| `/sessions`       | Listar sesiones                                                           |
| `/recent`         | Explorar sesiones recientes entre proyectos                               |
| `/last`           | Mostrar el último mensaje de la sesión                                    |
| `/tts`            | Activar o desactivar las respuestas de audio                              |
| `/projects`       | Listar proyectos                                                          |
| `/open`           | Añadir un proyecto explorando directorios                                 |
| `/task`           | Crear una tarea programada                                                |
| `/tasklist`       | Listar tareas programadas                                                 |
| `/queue`          | Ver y gestionar los mensajes en cola                                      |
| `/trust`          | Nivel de confianza para autoaprobar permisos                              |
| `/retry`          | Reenviar el último prompt                                                 |
| `/diff`           | Mostrar los archivos modificados en esta sesión                           |
| `/commit`         | Confirmar los cambios de la sesión con un mensaje                         |
| `/compact`        | Compactar el contexto de la sesión (sin teclado)                          |
| `/cost`           | Mostrar el gasto de la sesión (incluye subagentes) y el gasto diario      |
| `/close`          | Cerrar este topic de sesión                                               |
| `/cleanup`        | Eliminar los topics de transcripción de subagentes                        |
| `/fork`           | Clonar esta sesión en un topic nuevo                                      |
| `/share`          | Exportar la transcripción de esta sesión como archivo                     |
| `/saved`          | Atajos de prompts guardados                                               |
| `/rename`         | Renombrar la sesión actual                                                |
| `/commands`       | Comandos personalizados                                                   |
| `/skills`         | Catálogo de skills                                                        |
| `/opencode_start` | Iniciar el servidor OpenCode                                              |
| `/opencode_stop`  | Detener el servidor OpenCode                                              |
| `/reload`         | Recargar la configuración del servidor OpenCode (solo V2)                 |
| `/refresh`        | Actualizar la información de la sesión                                    |
| `/display`        | Opciones de visualización de este chat (toggles + agente)                 |
| `/help`           | Ayuda                                                                     |

`/start` es solo para DM (handshake del bot). Los selectores de modelo/agente son botones del teclado, no comandos con barra.

## Botón de segundo plano

Cuando una herramienta de shell (`bash`/`execute`) o de subagente (`task`) sigue en ejecución más de `BACKGROUND_OFFER_AFTER_SEC` (3 s por defecto, como la pista del TUI), el bot publica un botón ⏪ **Enviar a segundo plano** en el topic de la sesión. Al tocarlo se llama al `session.background` de OpenCode: el comando sigue ejecutándose en el servidor mientras sigues conversando, y el flujo normal de finalización entrega el resultado cuando termina.

- Una oferta por sesión en ejecución; desaparece si el comando termina antes.
- Ajusta el retardo con `BACKGROUND_OFFER_AFTER_SEC`.

## Topics de transcripción de subagentes

Cuando el agente crea subagentes, cada uno obtiene su propio topic de transcripción de solo lectura (`🧩 <description>`) con la transcripción completa en vivo, mientras el topic padre conserva una tarjeta de estado 🧩 compacta. Cuando el subagente termina, su topic se renombra (✅/❌) y se cierra. Las respuestas a encuestas siguen funcionando dentro de los topics de transcripción; los prompts nuevos se redirigen al topic padre con un aviso.

## Menú de visualización

`/display` abre un menú por chat: siempre se aplica al chat/topic donde lo ejecutaste (busca la nota "Scope: this chat/topic only" en el título del menú), nunca globalmente. Contiene:

- Toggles de mostrar/ocultar para pensamiento, llamadas a herramientas, archivos de herramientas, bloques de código, avisos de segundo plano, espejo de prompts de PC y previews de enlaces.
- Una fila de atajo de agente (`🤖 Agent: <name>`) que cambia el menú al selector de agente para el mismo chat/topic.
- Un botón `❌ Cancel` que cierra el menú sin cambiar nada.

Las sobrescritas persisten por chat/topic en `settings.json`, así cada topic de sesión conserva su propia configuración de visualización.

## Configuración

### Ubicación de la configuración

- El modo fuente guarda la configuración en la raíz del repositorio.
- El modo instalado guarda la configuración en el directorio de datos de aplicación de la plataforma.
- `OPENCODE_TELEGRAM_HOME` suprime ambos y fuerza un directorio de configuración personalizado.

Rutas de configuración en modo instalado:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Variables de entorno

| Variable | Descripción | Obligatoria | Por defecto |
| -------- | ----------- | :---------: | ----------- |
| `TELEGRAM_BOT_TOKEN` | Token del bot de @BotFather | Sí | - |
| `TELEGRAM_ALLOWED_USER_ID` | Tu ID numérico de Telegram | Sí | - |
| `TELEGRAM_PROXY_URL` | URL del proxy para la API de Telegram (SOCKS5/HTTP) | No | - |
| `OPENCODE_API_URL` | URL del servidor OpenCode | No | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Versión de la API del servidor: `v1` o `v2` | No | `v1` |
| `OPENCODE_SERVER_USERNAME` | Usuario de autenticación del servidor | No | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Contraseña de autenticación del servidor | No | - |
| `OPENCODE_MODEL_PROVIDER` | Proveedor del modelo por defecto | Sí | - |
| `OPENCODE_MODEL_ID` | ID del modelo por defecto | Sí | - |
| `OPENCODE_AUTO_START` | Iniciar un servidor OpenCode gestionado al arrancar el bot cuando no hay ninguno accesible | No | `true` |
| `BOT_LOCALE` | Idioma de la interfaz del bot (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | No | `en` |
| `SESSIONS_LIST_LIMIT` | Sesiones por página en `/sessions` | No | `10` |
| `PROJECTS_LIST_LIMIT` | Proyectos por página en `/projects` | No | `10` |
| `COMMANDS_LIST_LIMIT` | Comandos por página en `/commands` | No | `10` |
| `OPEN_BROWSER_ROOTS` | Directorios raíz permitidos para `/open`, separados por comas | No | directorio home |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Tiempo máximo de ejecución de una tarea programada, en minutos | No | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Intervalo de sondeo de tareas programadas, en segundos | No | `30` |
| `BUDGET_ALERT_USD` | Alerta de gasto diario en USD (`0` = desactivado) | No | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Intervalo de los mensajes de servicio; mantener `>= 2`, `0` = inmediato (`TOOL_MESSAGES_INTERVAL_SEC` sigue funcionando como alias heredado) | No | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | Segundos de ejecución de shell/subagente antes de ofrecer el envío a segundo plano ⏪ | No | `3` |
| `HIDE_THINKING_MESSAGES` | Ocultar los mensajes de servicio `Thinking...` | No | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Ocultar los mensajes de servicio de llamadas a herramientas | No | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Ocultar los mensajes de archivos de herramientas enviados como documentos | No | `false` |
| `CODE_BLOCKS_IN_TEXT` | Mostrar los diffs de código como bloques de código en texto en lugar de documentos `.txt` | No | `true` |
| `TRACK_BACKGROUND_SESSIONS` | Rastrear las sesiones en segundo plano iniciadas desde la PC y avisar en Telegram | No | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Mostrar avisos de sesiones en segundo plano (también activable vía `/display`) | No | `true` |
| `SHOW_PC_USER_MIRROR` | Reflejar en el topic los prompts escritos en la PC (también activable vía `/display`) | No | `true` |
| `SHOW_LINK_PREVIEWS` | Mostrar previews de enlaces bajo los mensajes del asistente (también activable vía `/display`) | No | `true` |
| `MESSAGE_FORMAT_MODE` | Modo de formato de las respuestas del asistente: `markdown` o `raw` | No | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Retardo entre actualizaciones transmitidas del asistente, en ms | No | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Longitud máxima mostrada del código `bash`/`execute` en los resúmenes | No | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Tamaño máximo de archivo (KB) para enviarlo como documento | No | `100` |
| `STT_API_URL` | URL base de la API compatible con Whisper (o endpoint completo para `plain`) | No | - |
| `STT_API_KEY` | API key de tu proveedor de STT (no hace falta para `plain`) | No | - |
| `STT_PROTOCOL` | `openai` (POST a `{URL}/audio/transcriptions` con key) o `plain` (POST a la URL tal cual con un campo `audio` wav, sin autenticación; convertido con ffmpeg) | No | `openai` |
| `STT_AUDIO_FIELD` | Campo multipart que lleva el audio (por defecto: `file` para openai, `audio` para plain) | No | - |
| `STT_TIMEOUT_SEC` | Timeout por transcripción, en segundos | No | `60` |
| `STT_FFMPEG_PATH` | Ruta absoluta de ffmpeg (conversión a wav en modo plain; solo necesaria si ffmpeg no está en PATH) | No | - |
| `STT_MODEL` | Nombre del modelo STT pasado a `/audio/transcriptions` | No | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Sugerencia opcional de idioma | No | - |
| `STT_NOTE_PROMPT` | Prompt/nota extra opcional que se envía con las peticiones de transcripción | No | - |
| `TTS_API_URL` | URL base de la API de TTS | No | - |
| `TTS_API_KEY` | API key de TTS | No | - |
| `TTS_MODEL` | Nombre del modelo TTS pasado a `/audio/speech` | No | `gpt-4o-mini-tts` |
| `TTS_VOICE` | Nombre de la voz TTS compatible con OpenAI | No | `alloy` |
| `LOG_LEVEL` | Nivel de log (`debug`, `info`, `warn`, `error`) | No | `info` |
| `BOT_HEALTH_PORT` | Puerto del endpoint interno de health (`/health`, `/health/live`, `/health/ready`) en `127.0.0.1`; `0` lo desactiva | No | desactivado; `3100` en Docker |

Mantén tu `.env` en privado: contiene el token de tu bot. Todos los flags de `/display` se aplican por chat/topic (ejecuta `/display` donde quieras el cambio); las sobrescritas persisten en `settings.json`.

### Opcional: voz y transcripción de audio

Si `STT_API_URL` está definido, el bot transcribe los mensajes de voz/audio de Telegram antes de enviarlos a OpenCode (se necesita además `STT_API_KEY` para servidores con protocolo `openai`).

Los workers personalizados mínimos se admiten vía `STT_PROTOCOL=plain`: el bot hace POST a la URL tal cual con un campo `audio` wav y sin autenticación (los registros no wav se convierten con ffmpeg, así que debe estar en PATH). Las peticiones se serializan porque los workers de referencia son instancias de una sola CPU.

Si las credenciales de TTS están configuradas, `/tts` activa o desactiva las respuestas habladas globalmente. La preferencia se guarda en `settings.json` y persiste tras reinicios.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Ejemplos compatibles con Whisper:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Together: `https://api.together.xyz/v1`

### Notas del selector de modelos

- Los favoritos se muestran antes que los modelos recientes.
- El modelo actual se marca con `✅`.
- El modelo por defecto de `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` siempre está incluido.

Para añadir favoritos, abre el TUI de OpenCode y pulsa `Cmd+F` / `Ctrl+F` sobre un modelo.

## Lanzamientos

Los lanzamientos están completamente automatizados a partir de los cambios de versión, sin etiquetado manual:

1. Sube la versión en `package.json` (`npm version patch|minor|major`, o edítala a mano).
   - Usa un sufijo `-rc.N` para release candidates: `1.2.3-rc.1` (previsualiza con `npm run release:rc`, notas con `npm run release:notes:preview`).
2. Haz push a `main`. El workflow **Publish** detecta la etiqueta que falta y luego, en orden: lint → build → test → generar notas de lanzamiento → publicar en npm (`latest`, o `next` para `-rc`) → push de la etiqueta `vX.Y.Z` → crear el GitHub Release → publicar la imagen multi-arquitectura en GHCR.
3. No pasa nada en pushes sin cambio de versión: CI sigue ejecutando lint/build/test en cada push y PR.

En resumen: **lanzamiento por commit**: cualquier push a `main` con un cambio de versión se publica. Las pre-releases nunca tocan la etiqueta `latest` de npm ni la etiqueta del contenedor.

## Seguridad

Solo el usuario de Telegram cuyo ID coincide con `TELEGRAM_ALLOWED_USER_ID` puede usar el bot.

Como el bot se ejecuta en local y se conecta a tu servidor OpenCode local, no hay ningún servicio público expuesto más allá de Telegram mismo. El endpoint de health opcional (`BOT_HEALTH_PORT`) se enlaza solo a `127.0.0.1` y sirve estado de solo lectura.

Nunca hagas commit de tu `.env` (ignorado por defecto) ni de `settings.json` (estado en ejecución con IDs de sesión); ambos permanecen en la máquina que ejecuta el bot.

## Desarrollo

### Ejecutar desde el código fuente

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Scripts

| Script | Descripción |
| ------ | ----------- |
| `npm run dev` | Compilar y arrancar |
| `npm run build` | Compilar TypeScript |
| `npm start` | Ejecutar el código compilado |
| `npm run release:prepare` | Subir la versión para un lanzamiento estable |
| `npm run release:rc` | Subir la versión para un release candidate |
| `npm run release:notes:preview` | Previsualizar las notas de lanzamiento |
| `npm run lint` | Ejecutar ESLint |
| `npm run format` | Ejecutar Prettier |
| `npm test` | Ejecutar los tests |
| `npm run test:coverage` | Ejecutar los tests con cobertura |

No se usa ningún watcher porque el bot mantiene conexiones persistentes de SSE y polling.

### Comprobaciones antes de cada cambio

```bash
npm run build && npm run lint && npm test
```

## Solución de problemas

**El bot no responde**

- Confirma que `TELEGRAM_ALLOWED_USER_ID` coincide con tu ID real de Telegram.
- Confirma que el token del bot es correcto.
- Para uso en grupo, asegúrate de que el modo privacidad está desactivado en BotFather (`/setprivacy` → Disable).

**El servidor OpenCode no está disponible**

- Asegúrate de que el servidor OpenCode está en ejecución (`opencode serve` en V1, `opencode service start` en V2; empareja una vez con `opencode pair` si pide credenciales).
- Confirma que `OPENCODE_API_URL` (y `OPENCODE_SERVER_VERSION` para V2) apunta a la dirección correcta.

**No se pueden crear topics de sesión nuevos**

- Confirma que el grupo es un supergroup con Topics habilitado.
- Confirma que el bot es administrador con el permiso **Manage Topics**.

**El botón ⏪ nunca aparece**

- Solo se muestra para las herramientas `bash`/`execute`/`task` que siguen en ejecución después de `BACKGROUND_OFFER_AFTER_SEC` (3 s por defecto).
- Baja el umbral y revisa el topic de la sesión: la oferta se publica allí.

## Créditos

Creado y mantenido por el dueño del repositorio, con contribuciones de la comunidad.

Coescrito con **OpenCode (Muse Spark)**, la IA de programación en pareja usada para la arquitectura, la implementación y la revisión a lo largo de este fork.

Este repositorio es un fork mantenido por [kevindevm](https://github.com/kevindevm), con soporte de group-topics agregado sobre el proyecto upstream.

Proyecto upstream: [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot), de Ruslan Grinev.

## Licencia

[MIT](LICENSE)
