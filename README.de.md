# OpenCode Telegram Group Topics Bot

[Englische README](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Hinweis: Die englische [`README.md`](./README.md) bleibt die maßgebliche Dokumentation. Bei Abweichungen gilt die englische Version.

Ein Telegram-Bot ([grammy](https://grammy.dev/), Node.js 20+), der eine einzige Telegram-Supergroup in einen **Mehr-Sitzungs-Mobilclient für [OpenCode](https://opencode.ai)** verwandelt: Das **General**-Thema ist die Steuerungsebene, und jede OpenCode-Sitzung erhält ein eigenes Forum-Thema mit Live-Streaming, einem gepinnten Status-Dashboard, einer Prompt-Warteschlange, Berechtigungs- und Frageabläufen sowie einer ⏪ Schaltfläche zum Senden in den Hintergrund für lange Shell-Befehle.

Dieses Projekt ist ein Fork von [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) von Ruslan Grinev. Nutze das Upstream-Projekt für den einfacheren Einzel-Chat-Workflow; nutze diesen Fork für parallele Sitzungen in Forum-Themen, steuerbar von deinem Handy.

Keine offenen Ports, keine exponierte Web-UI. Der Bot kommuniziert nur mit deinem lokalen OpenCode-Server und der Telegram Bot API. OpenCode-Server der Versionen V1 und V2 werden unterstützt. Eine Gruppe gehört in der Regel zu einem Repository; viele Sitzungsthemen können parallel in einer Gruppe laufen, und mehrere Gruppen können gleichzeitig aktiv sein.

Fork-Sync-Hinweise: [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Inhalt

- [Auf einen Blick](#auf-einen-blick)
- [Screenshots](#screenshots)
- [Funktionen](#funktionen)
- [Schnellstart](#schnellstart)
- [Täglicher Workflow](#täglicher-workflow)
- [Parallele Workloads und Telegram-Ratenlimits](#parallele-workloads-und-telegram-ratenlimits)
- [Befehle](#befehle)
- [Hintergrund-Schaltfläche](#hintergrund-schaltfläche)
- [Subagent-Transkript-Themen](#subagent-transkript-themen)
- [Anzeige-Menü](#anzeige-menü)
- [Konfiguration](#konfiguration)
- [Releases](#releases)
- [Sicherheit](#sicherheit)
- [Entwicklung](#entwicklung)
- [Fehlerbehebung](#fehlerbehebung)
- [Danksagungen](#danksagungen)
- [Lizenz](#lizenz)

## Auf einen Blick

- Eine Telegram-Gruppe gehört zu genau einem Repository bzw. Projektarbeitsbereich.
- **General** ist die Steuerungsebene: `/projects`, `/sessions`, `/recent`, `/new`, `/task`, Statusabfragen.
- Jede neue OpenCode-Sitzung erhält ihr eigenes Forum-Thema mit eigener Sitzung, eigenem Modell, Agenten und Anzeige-Zustand.
- Lange Shell-Befehle bieten eine ⏪ Schaltfläche, die die Sitzung in den Hintergrund schickt, damit du weiter schreiben kannst.
- Jeder Subagent streamt in sein eigenes Nur-Lese-Transkript-Thema plus eine Live-Statuskarte im Eltern-Thema.
- Am PC getippte Prompts werden als 🧑 Nachrichten in das Sitzungsthema gespiegelt, damit beide Seiten synchron bleiben.
- Optionale TTS-Audioantworten werden global per `/tts` umgeschaltet und überleben Neustarts.
- Private Nachrichten sind für leichte Steuerung und Statusabfragen da, nicht für den eigentlichen Mehr-Sitzungs-Workflow.

## Screenshots

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Session topic with live assistant streaming" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Pinned status dashboard and reply keyboard" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Model picker with favorites" />
</p>

## Funktionen

- **Sitzungen pro Thema** - ein Forum-Thema pro OpenCode-Sitzung; General bleibt die Steuerungsebene und pinnt nie etwas.
- **Live-Streaming** - Antworten des Assistenten werden live gestreamt, mit threadbewussten Edits und Fallback-Zustellung nach Abschluss.
- **⏪ In den Hintergrund senden** - lange `bash`-/`execute`-Befehle bieten eine Schaltfläche, die die Sitzung per `session.background` in den Hintergrund schickt.
- **🧩 Subagent-Transkript-Themen** - jeder Subagent erhält ein Nur-Lese-Thema mit dem vollständigen Live-Transkript; das Eltern-Thema behält eine kompakte Statuskarte.
- **Gepinnte Dashboards** - pro Thema eine gepinnte Nachricht mit Sitzung, Projekt, Modell, Kontextnutzung, Kosten und geänderten Dateien.
- **Prompt-Warteschlange** - Prompts, die gesendet werden, während eine Sitzung beschäftigt ist, werden in die Warteschlange gestellt, überleben Neustarts und unterstützen pro Nachricht Abbrechen, an den Anfang verschieben sowie Unterbrechen-und-Ausführen über `/queue`.
- **Berechtigungen und Fragen** - interaktive `allow once`- / `always`- / `reject`-Abläufe und Frageumfragen mit vollständigen nummerierten Optionen in der Nachricht plus kurzen nummerierten Schaltflächen, eigenem Text und Sprachantworten; pro Sitzung Vertrauensstufen über `/trust ask|edits|all`.
- **Abschluss-Fußzeile** - nur die letzte Nachricht eines Durchgangs trägt die Fußzeile `agent · model · elapsed` (`🛠️ Build · opus · 1m 30s`), damit das Ende der Antwort immer erkennbar ist. Frühere Nachrichten werden ohne sie gesendet.
- **Auswahlmenüs und Tastatur** - Modell-, Agenten-, Varianten- und Kontextsteuerung über die persistente Tastatur, Favoriten zuerst.
- **`/display`-Menü** - Ein-/Ausblenden pro Chat/Thema plus eine Agenten-Abkürzung und eine Abbrechen-Schaltfläche; Überschreibungen werden in `settings.json` gespeichert.
- **Sitzungsverwaltung** - `/retry` für den letzten Prompt, `/diff`, `/commit`, `/cost`-Kostenverfolgung mit `BUDGET_ALERT_USD`, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, gespeicherte Prompt-Kürzel (`/saved`), eigene Befehle (`/commands`), Skills (`/skills`).
- **Geplante Aufgaben** - geplantes Thema pro Projekt über `/task` und `/tasklist` (Anhalten/Fortsetzen/Jetzt ausführen/Protokolle).
- **Sprache und Dateien** - Whisper-kompatible STT für Sprach-/Audionachrichten, optionale globale TTS (`/tts`), Bild-/PDF-/Textanhänge, Diffs als Dateien oder Inline-Codeblöcke.
- **Projekt-Browser** - `/open` und `/projects` mit Schutz durch erlaubte Wurzelverzeichnisse.
- **Serversteuerung** - OpenCode-Autostart, remote `/opencode_start` / `/opencode_stop`, V2-Konfiguration `/reload`.
- **Zugriffssteuerung für einen einzelnen Nutzer**, keine öffentlichen Ports (Health-Endpunkt bindet nur an `127.0.0.1`).
- **8 Oberflächensprachen** mit Fallback auf Englisch.

## Schnellstart

### 1. Voraussetzungen

- Node.js 20+
- OpenCode von [opencode.ai](https://opencode.ai) oder [GitHub](https://github.com/sst/opencode)
- Einen Telegram-Bot von [@BotFather](https://t.me/BotFather)
- Deine numerische Telegram-Nutzer-ID von [@userinfobot](https://t.me/userinfobot)

### 2. Telegram-Gruppe anlegen und vorbereiten

1. Lege eine neue Telegram-**Supergroup** für ein OpenCode-Projekt bzw. -Repository an.
2. Füge deinen Bot der Gruppe hinzu und mache ihn zum Admin mit der Berechtigung **Themen verwalten**.
3. Aktiviere **Topics** in den Gruppeneinstellungen.
4. Führe in [@BotFather](https://t.me/BotFather) `/setprivacy` für den Bot aus und wähle **Disable**.
5. Behalte das Standard-Thema **General** bei: das ist die Steuerungsebene.

### 3. OpenCode starten

Starte OpenCode auf der Maschine, auf der der Bot laufen wird:

```bash
# V1
opencode serve
# V2: nutze den Hintergrunddienst (stabiler Port + Zugangsdaten).
# Ein nacktes `opencode serve` bindet einen zufälligen Port mit einem zufälligen Passwort,
# sodass der Bot ihn niemals erreichen könnte.
opencode service start
```

Standard-API-URL: `http://localhost:4096` (V1) oder `http://127.0.0.1:49374` (V2, setze `OPENCODE_SERVER_VERSION=v2`).

### 4. Bot installieren

#### Option A: `npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### Option B: Globale Installation

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Option C: Aus dem Quellcode starten

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` ist der kompilierte CLI-Einstiegspunkt, der durch `npm run build` entsteht.

#### Option D: Docker

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID ausfüllen
docker compose up -d --build
```

`.env` bleibt auf dem Host. Es wird zur Laufzeit injiziert und nicht in das Image kopiert.

Konfiguration und Laufzeitzustand liegen im Volume `opencode-group-topics-bot-data` (`OPENCODE_TELEGRAM_HOME=/app/data` im Container).

**Linux** (OpenCode auf dem Host unter `127.0.0.1:4096`): die Standard-Compose-Datei nutzt `network_mode: host`, sodass der Container deinen OpenCode-Server auf dem Host erreicht und dieselben Projektpfade sieht.

**Docker Desktop** (macOS/Windows): Host-Networking ist nicht verfügbar, nutze daher die Override-Datei, die OpenCode über `host.docker.internal` erreicht:

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

Auf Docker Desktop kann der Container die Projektpfade des Hosts nicht sehen und `opencode` nicht selbst starten: führe `opencode serve` (V1) oder `opencode service start` (V2) auf dem Host aus und bevorzuge `/projects`-Pfade, die sich innerhalb des Containers auflösen (mounte Repos bei Bedarf mit einem zusätzlichen `volumes`-Eintrag). `/opencode_start` und `/opencode_stop` sind reine Host-Features.

Stabile Releases werden als `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` und `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest` für `linux/amd64` und `linux/arm64` veröffentlicht. Release Candidates erhalten nur ihr exaktes Versionstag.

#### Option E: Windows-Dienst (NSSM, dauerhaft laufend)

Für einen 24/7-Betrieb unter Windows, starte den Bot als nativen Dienst mit [NSSM](https://nssm.cc):

```powershell
# 1. Einmal bauen
npm install
npm run build

# 2. Dienst registrieren (PowerShell mit erhöhten Rechten, Pfade anpassen)
nssm install OpenCodeTelegramBot "C:\Program Files\nodejs\node.exe" "E:\path\to\repo\dist\cli.js start --mode installed"
nssm set OpenCodeTelegramBot AppDirectory "E:\path\to\repo"
nssm set OpenCodeTelegramBot AppEnvironmentExtra "OPENCODE_TELEGRAM_HOME=C:\Users\<you>\AppData\Roaming\opencode-telegram-group-topics-bot"
nssm set OpenCodeTelegramBot Start SERVICE_AUTO_START

# 3. Starten
nssm start OpenCodeTelegramBot
```

Die Konfiguration liegt dann in `%APPDATA%\opencode-telegram-group-topics-bot\.env` (oder dort, wo `OPENCODE_TELEGRAM_HOME` hinweist); der Dienst liest diese Datei, nicht die `.env` des Repos. Eine geplante Aufgabe, die bei der Anmeldung `opencode pair` ausführt, hält die CLI gekoppelt; der Dienst selbst verwaltet den Bot-Prozess und startet ihn bei Fehlern neu.

### 5. Setup-Assistent abschließen

Der Assistent fragt nach:

- Oberflächensprache
- Telegram-Bot-Token
- erlaubte Telegram-Nutzer-ID
- OpenCode-API-URL
- optional OpenCode-Server-Benutzername/Passwort

### 6. Erste Überprüfung

1. Schicke dem Bot eine DM und führe `/start` aus; bestätige, dass er antwortet.
2. Führe im **General**-Thema der Gruppe `/start` und dann `/status` aus, um die Erreichbarkeit von OpenCode zu bestätigen.
3. Führe `/projects` in **General** aus und wähle das Repository für diese Gruppe.
4. Führe `/new` in **General** aus, um ein Sitzungsthema anzulegen.
5. Öffne das neue Thema und sende einen Prompt.

Wenn das funktioniert, ist der Gruppenarbeitsbereich bereit.

## Täglicher Workflow

1. Starte OpenCode (`opencode serve` auf V1, `opencode service start` auf V2), dann starte den Bot.
2. Öffne die Telegram-Gruppe und gehe zu **General**.
3. Prüfe mit `/projects` das ausgewählte Repository.
4. Lege mit `/new` ein neues Sitzungsthema an.
5. Arbeite innerhalb des Themen-Threads; läuft ein Shell-Befehl lange, tippe auf ⏪, um ihn in den Hintergrund zu schicken.
6. Nutze `/sessions` in **General**, um ältere Sitzungsläufe wieder aufzurufen.

## Parallele Workloads und Telegram-Ratenlimits

- Dieser Fork ist für paralleles Arbeiten ausgelegt: viele Themen-Threads in einer Gruppe und viele Gruppen über Projekte hinweg.
- Telegram erzwingt Ratenlimits für Nachrichten, besonders wenn viele Themen gleichzeitig Updates erhalten.
- Der Bot verlangsamt oder staffelt Telegram-Updates bei Bedarf (siehe `SERVICE_MESSAGES_INTERVAL_SEC`, halte `>= 2`).
- OpenCode-Sitzungen laufen weiter, auch wenn Telegram-Updates seltener kommen: unter hoher Last erhältst du pro Thema weniger Echtzeit-Meldungen, aber ohne verlorene Arbeit.

## Befehle

Jede einfache Textnachricht in einem Sitzungsthema wird als Prompt behandelt, wenn keine blockierende Interaktion aktiv ist. Modell-, Agenten-, Varianten- und Kontextaktionen findest du in der persistenten Tastatur unten.

| Befehl            | Beschreibung                                                             |
| ----------------- | ------------------------------------------------------------------------ |
| `/status`         | Server- und Sitzungsstatus                                               |
| `/new`            | Neue Sitzung anlegen                                                     |
| `/abort`          | Aktuelle Aktion abbrechen                                                |
| `/sessions`       | Sitzungen auflisten                                                      |
| `/recent`         | Neueste Sitzungen über Projekte hinweg durchsehen                        |
| `/last`           | Neueste Sitzungsnachricht anzeigen                                       |
| `/tts`            | Audioantworten umschalten                                                |
| `/projects`       | Projekte auflisten                                                       |
| `/open`           | Projekt über Verzeichnisnavigation hinzufügen                            |
| `/task`           | Geplante Aufgabe anlegen                                                 |
| `/tasklist`       | Geplante Aufgaben auflisten                                              |
| `/queue`          | Warteschlange anzeigen und verwalten                                     |
| `/trust`          | Vertrauensstufe für automatische Genehmigung von Berechtigungen          |
| `/retry`          | Letzten Prompt erneut senden                                             |
| `/diff`           | Geänderte Dateien in dieser Sitzung anzeigen                             |
| `/commit`         | Sitzungsänderungen mit einer Nachricht committen                         |
| `/compact`        | Sitzungskontext komprimieren (keine Tastatur nötig)                      |
| `/cost`           | Sitzungskosten (inkl. Subagents) und Tagesausgaben anzeigen              |
| `/close`          | Dieses Sitzungsthema schließen                                           |
| `/cleanup`        | Subagent-Transkript-Themen löschen                                       |
| `/fork`           | Diese Sitzung in ein neues Thema klonen                                  |
| `/share`          | Transkript dieser Sitzung als Datei exportieren                          |
| `/saved`          | Gespeicherte Prompt-Kürzel                                               |
| `/rename`         | Aktuelle Sitzung umbenennen                                              |
| `/commands`       | Eigene Befehle                                                           |
| `/skills`         | Skills-Katalog                                                           |
| `/opencode_start` | OpenCode-Server starten                                                  |
| `/opencode_stop`  | OpenCode-Server stoppen                                                  |
| `/reload`         | OpenCode-Server-Konfiguration neu laden (nur V2)                         |
| `/refresh`        | Sitzungsinformationen aktualisieren                                      |
| `/display`        | Anzeigeoptionen für diesen Chat (Toggles + Agent)                        |
| `/help`           | Hilfe                                                                    |

`/start` ist nur für DMs (Bot-Handshake). Modell-/Agenten-Auswahlmenüs sind Tastaturschaltflächen, keine Slash-Befehle.

## Hintergrund-Schaltfläche

Wenn ein Shell- (`bash`/`execute`)- oder Subagenten- (`task`)-Tool länger als `BACKGROUND_OFFER_AFTER_SEC` läuft (Standard 3 s, wie beim TUI-Hinweis), postet der Bot eine ⏪ **In den Hintergrund senden**-Schaltfläche im Sitzungsthema. Ein Tipp darauf ruft OpenCodes `session.background` auf: Der Befehl läuft auf dem Server weiter, während du weiter schreiben kannst, und der normale Abschlussablauf liefert das Ergebnis, wenn er fertig ist.

- Ein Angebot pro laufender Sitzung; es verschwindet, wenn der Befehl früher fertig ist.
- Passe die Verzögerung über `BACKGROUND_OFFER_AFTER_SEC` an.

## Subagent-Transkript-Themen

Wenn der Agent Subagents erzeugt, erhält jeder sein eigenes Nur-Lese-Transkript-Thema (`🧩 <description>`) mit dem vollständigen Live-Transkript, während das Eltern-Thema eine kompakte 🧩-Statuskarte behält. Ist der Subagent fertig, wird sein Thema umbenannt (✅/❌) und geschlossen. Umfrageantworten funktionieren auch in Transkript-Themen; neue Prompts werden mit einem Hinweis zum Eltern-Thema umgeleitet.

## Anzeige-Menü

`/display` öffnet ein Menü pro Chat: Es gilt immer für den Chat bzw. das Thema, in dem du es ausgeführt hast (beachte den Hinweis "Scope: this chat/topic only" im Menütitel), nie global. Es enthält:

- Ein-/Aus-Schalter für Thinking, Tool-Aufrufe, Tool-Dateien, Codeblöcke, Hintergrund-Hinweise, PC-Prompt-Spiegel und Linkvorschauen.
- Eine Agenten-Kurzzeile (`🤖 Agent: <name>`), die das Menü für denselben Chat bzw. dasselbe Thema zur Agenten-Auswahl umschaltet.
- Eine `❌ Cancel`-Schaltfläche, die das Menü schließt, ohne etwas zu ändern.

Überschreibungen werden pro Chat/Thema in `settings.json` gespeichert, sodass jedes Sitzungsthema seine eigene Anzeigekonfiguration behält.

## Konfiguration

### Speicherort der Konfiguration

- Der Quellmodus speichert die Konfiguration im Repository-Stammverzeichnis.
- Der Installationsmodus speichert die Konfiguration im App-Datenverzeichnis der Plattform.
- `OPENCODE_TELEGRAM_HOME` überschreibt beides und erzwingt ein eigenes Konfigurationsverzeichnis.

Konfigurationspfade im Installationsmodus:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Umgebungsvariablen

| Variable | Beschreibung | Erforderlich | Standard |
| -------- | ----------- | :------: | ------- |
| `TELEGRAM_BOT_TOKEN` | Bot-Token von @BotFather | Ja | - |
| `TELEGRAM_ALLOWED_USER_ID` | Deine numerische Telegram-Nutzer-ID | Ja | - |
| `TELEGRAM_PROXY_URL` | Proxy-URL für die Telegram-API (SOCKS5/HTTP) | Nein | - |
| `OPENCODE_API_URL` | OpenCode-Server-URL | Nein | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Server-API-Version: `v1` oder `v2` | Nein | `v1` |
| `OPENCODE_SERVER_USERNAME` | Benutzername für die Server-Authentifizierung | Nein | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Passwort für die Server-Authentifizierung | Nein | - |
| `OPENCODE_MODEL_PROVIDER` | Standard-Modellanbieter | Ja | - |
| `OPENCODE_MODEL_ID` | Standard-Modell-ID | Ja | - |
| `OPENCODE_AUTO_START` | Startet einen verwalteten OpenCode-Server beim Bot-Start, wenn keiner erreichbar ist | Nein | `true` |
| `BOT_LOCALE` | Sprache der Bot-UI (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | Nein | `en` |
| `SESSIONS_LIST_LIMIT` | Sitzungen pro Seite in `/sessions` | Nein | `10` |
| `PROJECTS_LIST_LIMIT` | Projekte pro Seite in `/projects` | Nein | `10` |
| `COMMANDS_LIST_LIMIT` | Befehle pro Seite in `/commands` | Nein | `10` |
| `OPEN_BROWSER_ROOTS` | Erlaubte Wurzelverzeichnisse für `/open`, kommagetrennt | Nein | Heimatverzeichnis |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Maximale Ausführungszeit für eine geplante Aufgabe, in Minuten | Nein | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Abfrageintervall für geplante Aufgaben, in Sekunden | Nein | `30` |
| `BUDGET_ALERT_USD` | Warnung bei Tagesausgaben in USD (`0` = aus) | Nein | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Intervall für Dienstmeldungen; halte `>= 2`, `0` = sofort (`TOOL_MESSAGES_INTERVAL_SEC` funktioniert weiterhin als Legacy-Alias) | Nein | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | Sekunden Shell-/Subagenten-Laufzeit, bevor ⏪ In-den-Hintergrund-Senden angeboten wird | Nein | `3` |
| `HIDE_THINKING_MESSAGES` | `Thinking...`-Dienstmeldungen ausblenden | Nein | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Tool-Call-Dienstmeldungen ausblenden | Nein | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Als Dokumente gesendete Tool-Datei-Nachrichten ausblenden | Nein | `false` |
| `CODE_BLOCKS_IN_TEXT` | Code-Diffs als Text-Codeblöcke statt als `.txt`-Dokumente anzeigen | Nein | `true` |
| `TRACK_BACKGROUND_SESSIONS` | Vom PC gestartete Hintergrund-Sitzungen verfolgen und in Telegram benachrichtigen | Nein | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Hintergrund-Sitzungshinweise anzeigen (auch umschaltbar über `/display`) | Nein | `true` |
| `SHOW_PC_USER_MIRROR` | Am PC getippte Prompts in das Thema spiegeln (auch umschaltbar über `/display`) | Nein | `true` |
| `SHOW_LINK_PREVIEWS` | Linkvorschauen unter Assistentennachrichten anzeigen (auch umschaltbar über `/display`) | Nein | `true` |
| `MESSAGE_FORMAT_MODE` | Formatierungsmodus der Assistentenantwort: `markdown` oder `raw` | Nein | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Verzögerung zwischen gestreamten Assistenten-Updates, in ms | Nein | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Maximale angezeigte Länge für `bash`-/`execute`-Code in Zusammenfassungen | Nein | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Maximale Dateigröße (KB) zum Senden als Dokument | Nein | `100` |
| `STT_API_URL` | Whisper-kompatible API-Basis-URL (oder vollständiger Endpunkt für `plain`) | Nein | - |
| `STT_API_KEY` | API-Schlüssel für deinen STT-Anbieter (nicht nötig für `plain`) | Nein | - |
| `STT_PROTOCOL` | `openai` (POST `{URL}/audio/transcriptions` mit Schlüssel) oder `plain` (POST der URL wie angegeben mit einem `audio`-wav-Feld, ohne Auth; konvertiert mit ffmpeg) | Nein | `openai` |
| `STT_AUDIO_FIELD` | Multipart-Feld mit den Audiodaten (Standard: `file` für openai, `audio` für plain) | Nein | - |
| `STT_TIMEOUT_SEC` | Timeout pro Transkription in Sekunden | Nein | `60` |
| `STT_FFMPEG_PATH` | Absoluter ffmpeg-Pfad (wav-Konvertierung im plain-Modus; nur nötig, wenn ffmpeg nicht im PATH liegt) | Nein | - |
| `STT_MODEL` | STT-Modellname, der an `/audio/transcriptions` übergeben wird | Nein | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Optionaler Sprachhinweis | Nein | - |
| `STT_NOTE_PROMPT` | Optionaler zusätzlicher Prompt/Hinweis, der mit Transkriptionsanfragen gesendet wird | Nein | - |
| `TTS_API_URL` | TTS-API-Basis-URL | Nein | - |
| `TTS_API_KEY` | TTS-API-Schlüssel | Nein | - |
| `TTS_MODEL` | TTS-Modellname, der an `/audio/speech` übergeben wird | Nein | `gpt-4o-mini-tts` |
| `TTS_VOICE` | OpenAI-kompatibler TTS-Voice-Name | Nein | `alloy` |
| `LOG_LEVEL` | Protokollierungsstufe (`debug`, `info`, `warn`, `error`) | Nein | `info` |
| `BOT_HEALTH_PORT` | Port des internen Health-Endpunkts (`/health`, `/health/live`, `/health/ready`) auf `127.0.0.1`; `0` deaktiviert ihn | Nein | aus; `3100` in Docker |

Behalte deine `.env` privat: sie enthält deinen Bot-Token. Alle `/display`-Schalter gelten pro Chat/Thema (führe `/display` dort aus, wo du die Änderung willst); Überschreibungen werden in `settings.json` gespeichert.

### Optional: Sprache und Audio-Transkription

Wenn `STT_API_URL` gesetzt ist, transkribiert der Bot Telegram-Sprach-/Audionachrichten, bevor sie an OpenCode gesendet werden (`STT_API_KEY` ist zusätzlich erforderlich für Server mit dem `openai`-Protokoll).

Eigene Minimale-Worker werden über `STT_PROTOCOL=plain` unterstützt: Der Bot postet die URL wie angegeben mit einem `audio`-wav-Feld und ohne Authentifizierung (nicht-wav-Eingabe wird mit ffmpeg konvertiert, es muss also im PATH liegen). Anfragen werden serialisiert, weil die Referenz-Worker Single-CPU-Instanzen sind.

Wenn TTS-Zugangsdaten konfiguriert sind, schaltet `/tts` gesprochene Antworten global um. Die Einstellung wird in `settings.json` gespeichert und überlebt Neustarts.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Whisper-kompatible Beispiele:

- OpenAI: `https://api.openai.com/v1`
- Groq: `https://api.groq.com/openai/v1`
- Together: `https://api.together.xyz/v1`

### Hinweise zur Modellauswahl

- Favoriten werden vor den zuletzt genutzten Modellen angezeigt.
- Das aktuelle Modell ist mit `✅` markiert.
- Das Standardmodell aus `OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID` ist immer enthalten.

Um Favoriten hinzuzufügen, öffne die OpenCode-TUI und drücke bei einem Modell `Cmd+F` / `Ctrl+F`.

## Releases

Releases laufen vollständig automatisiert über Versionsbumps; kein manuelles Taggen:

1. Erhöhe die Version in `package.json` (`npm version patch|minor|major` oder von Hand bearbeiten).
   - Nutze das Suffix `-rc.N` für Release Candidates: `1.2.3-rc.1` (Vorschau mit `npm run release:rc`, Notizen mit `npm run release:notes:preview`).
2. Push nach `main`. Der **Publish**-Workflow erkennt das fehlende Tag und macht dann in dieser Reihenfolge: Lint → Build → Test → Release-Notizen generieren → Veröffentlichung auf npm (`latest`, oder `next` für `-rc`) → Push des `vX.Y.Z`-Tags → GitHub Release anlegen → Multi-Arch-Containerimage nach GHCR veröffentlichen.
3. Passes ohne Versionsbump lösen nichts aus; CI läuft bei jedem Push und PR weiterhin mit Lint/Build/Test.

Also: **Release per Commit**; jeder `main`-Push mit einem Versionsbump wird veröffentlicht. Pre-Releases berühren niemals das `latest`-npm-Tag oder das Container-Tag.

## Sicherheit

Nur der Telegram-Nutzer, dessen ID mit `TELEGRAM_ALLOWED_USER_ID` übereinstimmt, kann den Bot nutzen.

Da der Bot lokal läuft und sich mit deinem lokalen OpenCode-Server verbindet, gibt es keinen exponierten öffentlichen Dienst außer Telegram selbst. Der optionale Health-Endpunkt (`BOT_HEALTH_PORT`) bindet nur an `127.0.0.1` und liefert Nur-Lese-Status.

Commite niemals deine `.env` (standardmäßig ignoriert) oder `settings.json` (Laufzeitzustand mit Sitzungs-IDs); beide bleiben auf der Maschine, auf der der Bot läuft.

## Entwicklung

### Start aus dem Quellcode

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Skripte

| Skript | Beschreibung |
| ------ | ----------- |
| `npm run dev` | Bauen und starten |
| `npm run build` | TypeScript kompilieren |
| `npm start` | Kompilierten Code ausführen |
| `npm run release:prepare` | Version für ein stabiles Release erhöhen |
| `npm run release:rc` | Version für einen Release Candidate erhöhen |
| `npm run release:notes:preview` | Release-Notizen in der Vorschau |
| `npm run lint` | ESLint ausführen |
| `npm run format` | Prettier ausführen |
| `npm test` | Tests ausführen |
| `npm run test:coverage` | Tests mit Abdeckung ausführen |

Es wird kein Watcher verwendet, weil der Bot persistente SSE- und Polling-Verbindungen aufrechterhält.

### Prüfungen vor jeder Änderung

```bash
npm run build && npm run lint && npm test
```

## Fehlerbehebung

**Der Bot antwortet nicht**

- Prüfe, ob `TELEGRAM_ALLOWED_USER_ID` mit deiner echten Telegram-Nutzer-ID übereinstimmt.
- Prüfe, ob das Bot-Token korrekt ist.
- Für die Gruppennutzung: stelle sicher, dass der Datenschutzmodus in BotFather deaktiviert ist (`/setprivacy` → Disable).

**OpenCode-Server ist nicht erreichbar**

- Stelle sicher, dass der OpenCode-Server läuft (`opencode serve` auf V1, `opencode service start` auf V2; kopple einmalig mit `opencode pair`, wenn er nach Zugangsdaten fragt).
- Prüfe, ob `OPENCODE_API_URL` (und `OPENCODE_SERVER_VERSION` für V2) auf die richtige Adresse zeigt.

**Es lassen sich keine neuen Sitzungsthemen anlegen**

- Prüfe, ob die Gruppe eine Supergroup mit aktivierten Themen ist.
- Prüfe, ob der Bot ein Admin mit der Berechtigung **Themen verwalten** ist.

**Die ⏪-Schaltfläche erscheint nie**

- Sie erscheint nur für `bash`-/`execute`-/`task`-Tools, die länger als `BACKGROUND_OFFER_AFTER_SEC` (Standard 3 s) laufen.
- Senke den Schwellwert und prüfe das Sitzungsthema: das Angebot wird dort gepostet.

## Danksagungen

Erstellt und gepflegt vom Repository-Owner, mit Beiträgen aus der Community.

In Zusammenarbeit mit **OpenCode (Muse Spark)** geschrieben, dem KI-Pair-Programmer, der in diesem Fork für Architektur, Implementierung und Review genutzt wurde.

Upstream-Projekt: [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) von Ruslan Grinev.

## Lizenz

[MIT](LICENSE)
