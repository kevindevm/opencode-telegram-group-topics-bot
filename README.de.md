# OpenCode Telegram Group Topics Bot

[Englische README](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Ein Telegram-Bot für [OpenCode](https://opencode.ai), der einen Telegram-Supergroup in einen Mehrsitzungs-Mobilclient für OpenCode verwandelt: Das **General**-Thema ist die Steuerungsebene, und jede OpenCode-Sitzung erhält ein eigenes Forum-Thema mit Live-Streaming, gepinnten Status-Dashboards, Prompt-Warteschlange, Berechtigungs-/Frage-Abläufen und einer Schaltfläche zum Senden in den Hintergrund für lange Shell-Befehle.

Dieses Projekt ist ein Fork von [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) von Ruslan Grinev.

- Wenn du den einfacheren Einzel-Chat-Workflow möchtest, benutze das Upstream-Projekt.
- Wenn du eine **General**-Steuerungsebene mit mehreren parallel laufenden Forum-Themen für OpenCode-Sitzungen möchtest, benutze diesen Fork.

Keine offenen Ports und keine zugängliche Web-UI. Der Bot kommuniziert nur mit deinem lokalen OpenCode-Server und der Telegram Bot API. OpenCode-Server der Versionen V1 und V2 werden unterstützt.

Du kannst mehrere Sitzungsthemen parallel in einer Gruppe betreiben und zusätzlich mehrere Gruppen für verschiedene Projekte gleichzeitig nutzen.

Unterstützte Plattformen: macOS, Windows, Linux

Bot-Oberflächensprachen: English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Hinweis: Die englische [`README.md`](./README.md) bleibt die maßgebliche Dokumentation. Bei Abweichungen gilt die englische Version.

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Auf einen Blick

- Eine Telegram-Gruppe entspricht normalerweise einem Repository bzw. Projektarbeitsbereich.
- **General** ist die Steuerungsebene für `/projects`, `/sessions`, `/recent`, `/new`, `/task` und Statusabfragen.
- Jede neue OpenCode-Sitzung erhält ein eigenes Forum-Thema.
- Jedes Thema verwaltet seinen eigenen Sitzungs-, Modell-, Agenten- und Dashboard-Zustand.
- Lange Shell-Befehle bieten eine ⏪ Schaltfläche, die die Sitzung in den Hintergrund schickt, sodass du weiterschreiben kannst.
- Mehrere Themen können gleichzeitig laufen, und mehrere Gruppen können gleichzeitig verschiedene Projekte bedienen.
- Private Nachrichten eignen sich für leichte Steuerung und Statusabfragen, sind aber nicht der Hauptweg für den Mehrsitzungs-Workflow.

## Schnellstart

### 1. Voraussetzungen

- Node.js 20+
- OpenCode von [opencode.ai](https://opencode.ai) oder [GitHub](https://github.com/sst/opencode)
- Einen Telegram-Bot von [@BotFather](https://t.me/BotFather)
- Deine numerische Telegram-Benutzer-ID von [@userinfobot](https://t.me/userinfobot)

### 2. Telegram-Gruppe erstellen und vorbereiten

1. Erstelle einen neuen Telegram-**Supergroup** für ein OpenCode-Projekt bzw. Repository.
2. Füge den Bot der Gruppe hinzu und mache ihn zum Administrator mit der Berechtigung **Manage Topics**.
3. Aktiviere **Topics** in den Gruppeneinstellungen.
4. Führe in [@BotFather](https://t.me/BotFather) `/setprivacy` für den Bot aus und wähle **Disable**.
5. Behalte das standardmäßige **General**-Thema bei, es ist die Steuerungsebene.

### 3. OpenCode starten

Starte OpenCode auf dem Rechner, auf dem der Bot läuft:

```bash
# V1
opencode serve
# V2: nutze den Hintergrunddienst (stabiler Port + Zugangsdaten).
# Ein nacktes `opencode serve` bindet einen zufälligen Port mit einem
# zufälligen Passwort, sodass der Bot es nie erreichen könnte.
opencode service start
```

Standard-API-URL: `http://localhost:4096` (V1) oder `http://127.0.0.1:49374` (V2, setze `OPENCODE_SERVER_VERSION=v2`).

### 4. Den Bot installieren

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

#### Option C: Aus dem Quellcode

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` ist der von `npm run build` erzeugte kompilierte CLI-Einstiegspunkt.

#### Option D: Docker

Alternativ kann der Bot auch mit Docker betrieben werden. Details findest du in der englischen [README](./README.md).

### 5. Einrichtungsassistent abschließen

Der Assistent fragt nach:

- Oberflächensprache
- Telegram-Bot-Token
- Erlaubter Telegram-Benutzer-ID
- OpenCode-API-URL
- Optionaler OpenCode-Server-Benutzername/Passwort

### 6. Erste Verifizierung

1. Schicke dem Bot eine private Nachricht und führe `/start` aus; bestätige, dass er antwortet.
2. Führe im **General**-Thema der Gruppe `/start` und danach `/status` aus, um die Erreichbarkeit von OpenCode zu prüfen.
3. Führe `/projects` in **General** aus und wähle das Repository für diese Gruppe.
4. Führe `/new` in **General** aus, um ein Sitzungsthema zu erstellen.
5. Öffne das neue Thema und sende einen Prompt.

Wenn das funktioniert, ist der Gruppenarbeitsbereich bereit.

## Täglicher Arbeitsablauf

1. OpenCode starten
2. Bot starten
3. Telegram-Gruppe öffnen und in **General** gehen
4. Mit `/projects` bestätigen, welches Projekt dieser Gruppe zugeordnet ist
5. Mit `/new` ein neues Sitzungsthema erstellen
6. Innerhalb des Themen-Threads arbeiten; läuft ein Shell-Befehl lange, tippe auf ⏪, um ihn in den Hintergrund zu schicken
7. Um ältere Sitzungsthemen wieder aufzurufen, in **General** `/sessions` verwenden

## Paralleles Arbeiten und Telegram-Ratenlimits

- Dieser Fork ist für paralleles Arbeiten ausgelegt: viele Themen-Threads in einer Gruppe und viele Gruppen über mehrere Projekte hinweg.
- Telegram erzwingt Nachrichtenratenlimits, besonders wenn viele Themen gleichzeitig Updates erhalten.
- Der Bot verlangsamt oder staffelt Telegram-Updates bei Bedarf (siehe `SERVICE_MESSAGES_INTERVAL_SEC`, halte `>= 2`).
- OpenCode-Sitzungen laufen weiter, selbst wenn Telegram-Updates seltener kommen. Bei hoher Last zeigt ein Thema weniger Echtzeitmeldungen, aber keine Arbeit geht verloren.

## Befehle

Jede einfache Textnachricht in einem Sitzungsthema wird als Prompt behandelt, solange keine blockierende Interaktion aktiv ist. Modell-, Agenten-, Varianten- und Kontextaktionen sind über die dauerhafte Tastatur unten verfügbar.

| Command           | Beschreibung                                                        |
| ----------------- | -------------------------------------------------------------------- |
| `/status`         | Server- und Sitzungsstatus                                           |
| `/new`            | Neue Sitzung erstellen                                               |
| `/abort`          | Laufende Aktion abbrechen                                            |
| `/sessions`       | Sitzungen auflisten                                                  |
| `/recent`         | Letzte Sitzungen über Projekte hinweg durchsuchen                    |
| `/last`           | Neueste Sitzungsnachricht anzeigen                                   |
| `/tts`            | Audioantworten ein- oder ausschalten                                 |
| `/projects`       | Projekte auflisten                                                   |
| `/open`           | Projekt über Verzeichnisse hinzufügen                                |
| `/task`           | Geplante Aufgabe erstellen                                           |
| `/tasklist`       | Geplante Aufgaben auflisten                                          |
| `/queue`          | Warteschlange anzeigen und verwalten                                 |
| `/trust`          | Vertrauensstufe für automatische Freigaben                           |
| `/retry`          | Letzten Prompt erneut senden                                         |
| `/diff`           | Geänderte Dateien in dieser Sitzung anzeigen                         |
| `/commit`         | Änderungen der Sitzung mit einer Nachricht committen                 |
| `/compact`        | Sitzungskontext komprimieren (keine Tastatur nötig)                  |
| `/cost`           | Sitzungs- (inkl. Subagents) und Tagesausgaben anzeigen               |
| `/close`          | Dieses Sitzungsthema schließen                                       |
| `/cleanup`        | Subagent-Transkriptthemen löschen                                    |
| `/fork`           | Diese Sitzung in ein neues Thema klonen                              |
| `/share`          | Transkript dieser Sitzung als Datei exportieren                      |
| `/saved`          | Gespeicherte Prompt-Kurzbefehle                                      |
| `/rename`         | Aktuelle Sitzung umbenennen                                          |
| `/commands`       | Eigene Befehle                                                       |
| `/skills`         | Skills-Katalog                                                       |
| `/opencode_start` | OpenCode-Server starten                                              |
| `/opencode_stop`  | OpenCode-Server stoppen                                              |
| `/reload`         | OpenCode-Serverkonfiguration neu laden (nur V2)                      |
| `/refresh`        | Sitzungsinformationen aktualisieren                                  |
| `/display`        | Anzeigeoptionen für diesen Chat (Schalter + Agent)                   |
| `/help`           | Hilfe                                                                |

`/start` ist nur in privaten Nachrichten verfügbar (Bot-Handshake). Modell-/Agenten-Auswahlen sind Tastaturtasten und keine Slash-Befehle.

## Konfiguration

### Speicherort der Konfiguration

- Im Source-Mode wird die Konfiguration im Repository-Stammverzeichnis gespeichert.
- Im Installed-Mode wird die Konfiguration im plattformabhängigen Anwendungsdatenverzeichnis gespeichert.
- `OPENCODE_TELEGRAM_HOME` überschreibt beides und erzwingt ein eigenes Konfigurationsverzeichnis.

Konfigurationspfade im Installed-Mode:

- macOS: `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows: `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux: `~/.config/opencode-telegram-group-topics-bot/.env`

### Wichtige Umgebungsvariablen

| Umgebungsvariable                  | Beschreibung                                                       | Erforderlich | Standardwert                                                     |
| ---------------------------------- | ------------------------------------------------------------------ | :----------: | ---------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN`               | Bot-Token von @BotFather                                            |     Yes      | -                                                                |
| `TELEGRAM_ALLOWED_USER_ID`         | Deine numerische Telegram-Benutzer-ID                               |     Yes      | -                                                                |
| `OPENCODE_API_URL`                 | OpenCode-Server-URL                                                 |      No      | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2)     |
| `OPENCODE_SERVER_VERSION`          | Server-API-Version: `v1` oder `v2`                                  |      No      | `v1`                                                             |
| `OPENCODE_SERVER_USERNAME`         | Benutzername für die Serverauthentifizierung                        |      No      | `opencode`                                                       |
| `OPENCODE_SERVER_PASSWORD`         | Passwort für die Serverauthentifizierung                            |      No      | -                                                                |
| `OPENCODE_MODEL_PROVIDER`          | Standard-Modellanbieter                                             |     Yes      | -                                                                |
| `OPENCODE_MODEL_ID`                | Standard-Modell-ID                                                  |     Yes      | -                                                                |
| `OPENCODE_AUTO_START`              | Verwalteten OpenCode-Server beim Bot-Start starten, falls keiner erreichbar ist | No | `true`                                                           |
| `BOT_LOCALE`                       | Bot-Oberflächensprache (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) |   No      | `en`                                                             |
| `SERVICE_MESSAGES_INTERVAL_SEC`    | Intervall für Servicenachrichten; halte `>= 2` (Legacy-Alias: `TOOL_MESSAGES_INTERVAL_SEC`) | No | `5`                                                              |
| `BUDGET_ALERT_USD`                 | Tagesausgaben-Alarm in USD (`0` = aus)                              |      No      | `0`                                                              |
| `LOG_LEVEL`                        | Log-Level (`debug`, `info`, `warn`, `error`)                        |      No      | `info`                                                           |

Bitte schütze deine `.env`-Datei, sie enthält dein Bot-Token.

Die vollständige Tabelle der Umgebungsvariablen findest du im Configuration-Abschnitt der englischen [`README.md`](./README.md).

## Fehlerbehebung

**Bot antwortet nicht**

- Prüfe, dass `TELEGRAM_ALLOWED_USER_ID` mit deiner echten Telegram-Benutzer-ID übereinstimmt.
- Prüfe, dass das Bot-Token korrekt ist.
- Für die Nutzung in Gruppen: Stelle sicher, dass der Privacy-Modus in BotFather deaktiviert ist (`/setprivacy` zu Disable).

**OpenCode-Server nicht erreichbar**

- Stelle sicher, dass der OpenCode-Server läuft (`opencode serve` bei V1, `opencode service start` bei V2; falls nach Zugangsdaten gefragt wird, einmalig mit `opencode pair` koppeln).
- Prüfe, dass `OPENCODE_API_URL` (und `OPENCODE_SERVER_VERSION` bei V2) auf die richtige Adresse zeigt.

**Neue Sitzungsthemen können nicht erstellt werden**

- Prüfe, dass die Gruppe ein Supergroup mit aktivierten Topics ist.
- Prüfe, dass der Bot Administrator mit der Berechtigung **Manage Topics** ist.

**Die ⏪-Schaltfläche erscheint nie**

- Sie wird nur für `bash`/`execute`/`task`-Werkzeuge angezeigt, die länger als `BACKGROUND_OFFER_AFTER_SEC` (Standard 3 s) laufen.
- Senke den Schwellwert und prüfe das Sitzungsthema, das Angebot wird dort gepostet.

## Sicherheit

Nur der Telegram-Benutzer, dessen ID mit `TELEGRAM_ALLOWED_USER_ID` übereinstimmt, kann den Bot verwenden.

Da der Bot lokal läuft und sich mit deinem lokalen OpenCode-Server verbindet, gibt es keinen öffentlich zugänglichen Dienst, außer Telegram selbst. Der optionale Health-Endpunkt ist nur auf `127.0.0.1` gebunden und liefert nur Lese-Statusinformationen.

Commite nie deine `.env`-Datei (standardmäßig ignoriert) oder `settings.json` (Laufzeitzustand mit Sitzungs-IDs); beide bleiben auf dem Rechner, auf dem der Bot läuft.

## Weitere Dokumentation

- Englische Hauptdokumentation: [`README.md`](./README.md)
- Fork-Sync-Hinweise: [`FORK_SYNC.md`](./FORK_SYNC.md)
- Produktumfang und Status: [`PRODUCT.md`](./PRODUCT.md)
- Beitragsrichtlinien: [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Lizenz

[MIT](LICENSE) • Originalprojekt © Ruslan Grinev • Fork-Änderungen © Shane Kunz
