# OpenCode Telegram Group Topics Bot

[README en inglés](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Un bot de Telegram ([grammy](https://grammy.dev/), Node.js 20+) que convierte un supergrupo de Telegram en un **cliente móvil multi-sesión para [OpenCode](https://opencode.ai)**: el topic **General** es el canal de control, y cada sesión de OpenCode obtiene su propio topic de foro con streaming en vivo, un panel de estado fijado, una cola de prompts, flujos de permisos y preguntas, y un botón ⏪ de envío a segundo plano para comandos de shell largos.

Este proyecto es un fork de [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot), de Ruslan Grinev:

- Si quieres el flujo más simple de un solo chat, usa el proyecto upstream.
- Si quieres un topic de control **General** junto con varios forum topics que ejecuten sesiones de OpenCode en paralelo, controlable desde el móvil, usa este fork.

Sin puertos abiertos y sin UI web expuesta. El bot solo habla con tu servidor OpenCode local y con la Bot API de Telegram. Se admiten servidores OpenCode V1 y V2. Un grupo suele corresponder a un repositorio; puede haber muchos topics de sesión en paralelo en un mismo grupo, y muchos grupos activos a la vez.

Idiomas de la interfaz del bot: English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Nota: el [`README.md`](./README.md) en inglés sigue siendo la documentación oficial. Si hay diferencias entre este documento y la versión en ingles, prevalece la versión en ingles.

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## De un vistazo

- Un grupo de Telegram suele corresponder a un repositorio o espacio de trabajo de un proyecto.
- **General** es el canal de control: `/projects`, `/sessions`, `/recent`, `/new`, `/task` y comprobaciones de estado.
- Cada nueva sesión de OpenCode obtiene su propio topic de foro con su estado propio de sesión, modelo, agente y panel fijado.
- Los comandos de shell largos ofrecen un botón ⏪ que envía la sesión a segundo plano para que puedas seguir conversando.
- Cada subagente publica su transcripción en su propio topic de solo lectura, junto a una tarjeta de estado en vivo en el topic padre.
- Los prompts escritos en la PC se reflejan en el topic de la sesión como mensajes 🧑, así ambos lados se mantienen sincronizados.
- Un toggle opcional de respuestas de audio (TTS) se activa globalmente con `/tts` y persiste tras reiniciar.
- Los mensajes directos (DM) sirven para control ligero y consultas de estado, no como flujo principal multi-sesión.

## Quick Start

### 1. Requisitos previos

- Node.js 20+.
- OpenCode, desde [opencode.ai](https://opencode.ai) o [GitHub](https://github.com/sst/opencode).
- Un bot de Telegram creado con [@BotFather](https://t.me/BotFather).
- Tu ID numérico de Telegram, obtenido con [@userinfobot](https://t.me/userinfobot).

### 2. Crear y preparar el grupo de Telegram

1. Crea un nuevo **supergroup** de Telegram para un proyecto o repositorio de OpenCode.
2. Añade tu bot al grupo y dale permisos de administrador con el permiso **Manage Topics**.
3. Habilita **Topics** en la configuración del grupo.
4. En [@BotFather](https://t.me/BotFather), ejecuta `/setprivacy` para el bot y elige **Disable**.
5. Conserva el topic **General** por defecto: es el canal de control.

### 3. Iniciar OpenCode

Ejecuta OpenCode en la máquina donde vivirá el bot:

```bash
# V1
opencode serve
# V2: usa el servicio en segundo plano (puerto estable + credenciales).
# Un `opencode serve` simple enlaza un puerto aleatorio con una contraseña
# aleatoria, así el bot nunca podría alcanzarlo.
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

También es posible ejecutar el bot con Docker. Consulta la sección Quick Start del [README en inglés](./README.md) para los detalles completos (compose, volúmenes, específicos de Docker Desktop y Linux).

### 5. Completar el asistente de configuración

El asistente pregunta por:

- idioma de la interfaz
- token del bot de Telegram
- ID del usuario de Telegram permitido
- URL de la API de OpenCode
- usuario/contraseña opcionales del servidor OpenCode

### 6. Verificación inicial

1. Envía un DM al bot y ejecuta `/start`; confirma que contesta.
2. En el topic **General** del grupo, ejecuta `/start` y después `/status` para confirmar que OpenCode es accesible.
3. Ejecuta `/projects` en **General** y elige el repositorio de este grupo.
4. Ejecuta `/new` en **General** para crear un topic de sesión.
5. Abre el nuevo topic y envía un prompt.

Si todo funciona, tu espacio de trabajo en grupo está listo.

## Flujo de trabajo diario

1. Inicia OpenCode (`opencode serve` en V1, `opencode service start` en V2) y luego inicia el bot.
2. Abre el grupo de Telegram y ve a **General**.
3. Usa `/projects` para confirmar el repositorio elegido.
4. Usa `/new` para crear un nuevo topic de sesión.
5. Trabaja dentro del hilo del topic; si un comando de shell se demora, toca ⏪ para enviarlo a segundo plano.
6. Usa `/sessions` en **General** para volver a hilos de sesiones anteriores.

## Trabajo en paralelo y límites de Telegram

- Este fork está diseñado para el trabajo en paralelo: muchos topics en un grupo, y muchos grupos entre proyectos.
- Telegram aplica límites de velocidad de mensajes, especialmente cuando muchos topics reciben actualizaciones a la vez.
- El bot ralentiza o escalona las actualizaciones de Telegram cuando es necesario (ver `SERVICE_MESSAGES_INTERVAL_SEC`, mantener `>= 2`).
- Las sesiones de OpenCode siguen ejecutándose aunque las actualizaciones de Telegram se vuelvan menos frecuentes: espera menos mensajes en tiempo real por topic con carga alta, pero no trabajo perdido.

## Comandos

Cualquier mensaje de texto normal en un topic de sesión se trata como un prompt cuando no hay ninguna interacción bloqueante activa. Las acciones de modelo, agente, variante y contexto se realizan desde el teclado fijo inferior.

| Command           | Descripción                                                                   |
| ----------------- | ----------------------------------------------------------------------------- |
| `/status`         | Estado del servidor y de la sesión                                            |
| `/new`            | Crear una nueva sesión                                                        |
| `/abort`          | Abortar la acción en curso                                                    |
| `/sessions`       | Listar sesiones                                                               |
| `/recent`         | Explorar sesiones recientes entre todos los proyectos                         |
| `/last`           | Mostrar el último mensaje de la sesión                                        |
| `/tts`            | Activar o desactivar las respuestas de audio                                  |
| `/projects`       | Listar proyectos                                                              |
| `/open`           | Añadir un proyecto explorando directorios                                     |
| `/task`           | Crear una tarea programada                                                    |
| `/tasklist`       | Listar tareas programadas                                                     |
| `/queue`          | Ver y gestionar los mensajes en cola                                          |
| `/trust`          | Nivel de confianza para autoaprobar permisos                                  |
| `/retry`          | Reenviar el último prompt                                                     |
| `/diff`           | Mostrar los archivos modificados en esta sesión                               |
| `/commit`         | Confirmar los cambios de la sesión con un mensaje                             |
| `/compact`        | Compactar el contexto de la sesión (sin teclado)                              |
| `/cost`           | Mostrar el gasto de la sesión (incluye subagentes) y el gasto diario          |
| `/close`          | Cerrar este topic de sesión                                                   |
| `/cleanup`        | Eliminar los topics de transcripción de subagentes                            |
| `/fork`           | Clonar esta sesión en un topic nuevo                                          |
| `/share`          | Exportar la transcripción de esta sesión como archivo                         |
| `/saved`          | Atajos de prompts guardados                                                   |
| `/rename`         | Renombrar la sesión actual                                                    |
| `/commands`       | Comandos personalizados                                                       |
| `/skills`         | Catálogo de skills                                                            |
| `/opencode_start` | Iniciar el servidor OpenCode                                                  |
| `/opencode_stop`  | Detener el servidor OpenCode                                                  |
| `/reload`         | Recargar la configuración del servidor OpenCode (solo V2)                     |
| `/refresh`        | Actualizar la información de la sesión                                        |
| `/display`        | Opciones de visualización de este chat (toggles + agente)                     |
| `/help`           | Ayuda                                                                         |

`/start` es solo para DM (handshake del bot). Los selectores de modelo y agente son botones del teclado, no comandos con barra.

## Configuración

### Ubicación de la configuración

- El modo fuente (source mode) guarda la configuración en la raíz del repositorio.
- El modo instalado (installed mode) guarda la configuración en el directorio de datos de aplicación de la plataforma.
- `OPENCODE_TELEGRAM_HOME` suprime ambos y fuerza un directorio de configuración personalizado.

Rutas de configuración en modo instalado:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Variables de entorno principales

| Variable                       | Descripción                                                                                              | Necesaria | Por defecto                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- | :-------: | ---------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`           | Token del bot de @BotFather                                                                              |    Sí     | -                                                                      |
| `TELEGRAM_ALLOWED_USER_ID`     | Tu ID numérico de Telegram                                                                               |    Sí     | -                                                                      |
| `OPENCODE_API_URL`             | URL del servidor OpenCode                                                                                |    No     | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2)           |
| `OPENCODE_SERVER_VERSION`      | Versión de la API del servidor: `v1` o `v2`                                                              |    No     | `v1`                                                                   |
| `OPENCODE_SERVER_USERNAME`     | Usuario de autenticación del servidor                                                                    |    No     | `opencode`                                                             |
| `OPENCODE_SERVER_PASSWORD`     | Contraseña de autenticación del servidor                                                                 |    No     | -                                                                      |
| `OPENCODE_MODEL_PROVIDER`      | Proveedor del modelo por defecto                                                                         |    Sí     | -                                                                      |
| `OPENCODE_MODEL_ID`            | ID del modelo por defecto                                                                                |    Sí     | -                                                                      |
| `OPENCODE_AUTO_START`          | Iniciar un servidor OpenCode gestionado al arrancar el bot cuando no hay ninguno accesible                |    No     | `true`                                                                 |
| `BOT_LOCALE`                   | Idioma de la interfaz del bot (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`)                           |    No     | `en`                                                                   |
| `SERVICE_MESSAGES_INTERVAL_SEC`| Intervalo de los mensajes de servicio; mantener `>= 2`, `0` = inmediato                                   |    No     | `5`                                                                    |
| `BUDGET_ALERT_USD`             | Alerta de gasto diario en USD (`0` = desactivado)                                                        |    No     | `0`                                                                    |
| `LOG_LEVEL`                    | Nivel de log (`debug`, `info`, `warn`, `error`)                                                          |    No     | `info`                                                                 |

Mantén tu `.env` en privado: contiene el token de tu bot.

La tabla completa de variables de entorno está en la sección Configuration del [README en inglés](./README.md).

## Solución de problemas

**El bot no responde**

- Confirma que `TELEGRAM_ALLOWED_USER_ID` coincide con tu ID real de Telegram.
- Confirma que el token del bot es correcto.
- Para uso en grupo, asegúrate de que el modo privacidad está desactivado en BotFather (`/setprivacy`, luego Disable).

**El servidor OpenCode no está disponible**

- Asegúrate de que el servidor OpenCode está en ejecución (`opencode serve` en V1, `opencode service start` en V2; empareja una vez con `opencode pair` si pide credenciales).
- Confirma que `OPENCODE_API_URL` (y `OPENCODE_SERVER_VERSION` para V2) apuntan a la dirección correcta.

**No se pueden crear topics de sesión nuevos**

- Confirma que el grupo es un supergroup con Topics habilitado.
- Confirma que el bot es administrador con el permiso **Manage Topics**.

**El botón ⏪ nunca aparece**

- Solo se muestra para las herramientas `bash`/`execute`/`task` que siguen en ejecución después de `BACKGROUND_OFFER_AFTER_SEC` (3 s por defecto).
- Baja el umbral y revisa el topic de la sesión: la oferta se publica allí.

## Seguridad

Solo puede usar el bot el usuario de Telegram cuyo ID coincide con `TELEGRAM_ALLOWED_USER_ID`.

El bot se ejecuta en local y se conecta a tu servidor OpenCode local, así que no hay ningún servicio público expuesto más allá de Telegram. El endpoint de health opcional se enlaza solo a `127.0.0.1` y sirve estado de solo lectura.

Nunca confirmes (commit) tu `.env` (ignorado por defecto) ni `settings.json` (estado en ejecución con IDs de sesión); ambos permanecen en la máquina que ejecuta el bot.

## Más documentación

- English main docs: [`README.md`](./README.md)
- Fork sync notes: [`FORK_SYNC.md`](./FORK_SYNC.md)
- Product scope: [`PRODUCT.md`](./PRODUCT.md)
- Contributing: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Licencia

[MIT](LICENSE) - proyecto original © Ruslan Grinev - modificaciones del fork © Shane Kunz
