# OpenCode Telegram Group Topics Bot

[README en anglais](./README.md)

[![CI](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml/badge.svg)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/kevindevm/opencode-telegram-group-topics-bot)](https://github.com/kevindevm/opencode-telegram-group-topics-bot/releases)
[![npm version](https://img.shields.io/npm/v/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![npm downloads](https://img.shields.io/npm/dt/@kevindevm%2Fopencode-telegram-group-topics-bot)](https://www.npmjs.com/package/@kevindevm/opencode-telegram-group-topics-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Languages: [English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Remarque : ce fichier est la traduction française. Le [`README.md`](./README.md) en anglais reste la documentation de référence : en cas de différence, c'est la version anglaise qui fait foi.

Un bot Telegram ([grammy](https://grammy.dev/), Node.js 20+) qui transforme un seul supergroupe Telegram en **client mobile multi-sessions pour [OpenCode](https://opencode.ai)** : le topic **General** sert de canal de contrôle, et chaque session OpenCode obtient son propre topic de forum, avec streaming en direct, tableau de bord d'état épinglé, file d'attente de prompts, flux de permissions et de questions, et un bouton ⏪ d'envoi en arrière-plan pour les longues commandes shell.

Ce projet est un fork de [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) par Ruslan Grinev. Utilisez le dépôt upstream pour le workflow plus simple en chat unique ; utilisez ce fork pour des sessions parallèles dans des topics de forum, contrôlables depuis votre téléphone.

Aucun port ouvert, aucune interface web exposée. Le bot ne communique qu'avec votre serveur OpenCode local et l'API Telegram Bot. Les serveurs OpenCode V1 et V2 sont pris en charge. Un groupe correspond généralement à un dépôt ; plusieurs topics de session peuvent tourner en parallèle dans un même groupe, et plusieurs groupes peuvent rester actifs en même temps.

Notes de synchronisation du fork : [`FORK_SYNC.md`](./FORK_SYNC.md)

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## Table des matières

- [En bref](#en-bref)
- [Captures d'écran](#captures-décran)
- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Utilisation quotidienne](#utilisation-quotidienne)
- [Charges parallèles et limites de débit Telegram](#charges-parallèles-et-limites-de-débit-telegram)
- [Commandes](#commandes)
- [Bouton d'arrière-plan](#bouton-darrière-plan)
- [Topics de transcription des sous-agents](#topics-de-transcription-des-sous-agents)
- [Menu d'affichage](#menu-daffichage)
- [Configuration](#configuration)
- [Versions](#versions)
- [Sécurité](#sécurité)
- [Développement](#développement)
- [Dépannage](#dépannage)
- [Crédits](#crédits)
- [Licence](#licence)

## En bref

- Un groupe Telegram correspond à un dépôt / espace de travail de projet.
- **General** est le canal de contrôle : `/projects`, `/sessions`, `/recent`, `/new`, `/task`, et les vérifications d'état.
- Chaque nouvelle session OpenCode obtient son propre topic de forum, avec son propre état de session, de modèle, d'agent et d'affichage.
- Les longues commandes shell proposent un bouton ⏪ qui envoie la session en arrière-plan pour que vous puissiez continuer à discuter.
- Chaque sous-agent diffuse dans son propre topic de transcription en lecture seule, plus une carte d'état en direct dans le topic parent.
- Les prompts tapés sur votre PC sont recopiés dans le topic de session en messages 🧑, pour que les deux côtés restent synchronisés.
- Les réponses audio TTS (optionnelles) se basculent globalement avec `/tts` et persistent après redémarrage.
- Les messages privés (DM) servent au contrôle léger et aux vérifications d'état, pas au workflow multi-sessions principal.

## Captures d'écran

<p align="center">
  <img src="assets/Screenshot-1.png" width="30%" alt="Topic de session avec streaming de l'assistant en direct" />
  <img src="assets/Screenshot-2.png" width="30%" alt="Tableau de bord d'état épinglé et clavier de réponses" />
  <img src="assets/Screenshot-3.png" width="30%" alt="Sélecteur de modèles avec favoris" />
</p>

## Fonctionnalités

- **Sessions par topic** : un topic de forum par session OpenCode ; General reste le canal de contrôle et n'épingle jamais rien.
- **Streaming en direct** : les réponses de l'assistant arrivent en streaming avec des modifications tenant compte du fil de discussion et une livraison de complétion de secours.
- **⏪ Envoi en arrière-plan** : les longues commandes `bash`/`execute` proposent un bouton qui passe la session en arrière-plan via `session.background`.
- **🧩 Topics de transcription des sous-agents** : chaque sous-agent obtient un topic en lecture seule avec la transcription complète en direct ; le topic parent garde une carte d'état compacte.
- **Tableaux de bord épinglés** : message épinglé par topic avec session, projet, modèle, usage du contexte, coût et fichiers modifiés.
- **File d'attente de prompts** : les prompts envoyés pendant qu'une session est occupée sont mis en file d'attente, survivent aux redémarrages, et prennent en charge l'annulation par message, le passage en tête et l'interruption-avec-exécution via `/queue`.
- **Permissions et questions** : flux interactifs `allow once` / `always` / `reject` et sondages de questions avec les options numérotées complètes dans le message, plus des boutons numérotés courts, du texte personnalisé et des réponses vocales ; niveaux de confiance par session via `/trust ask|edits|all`.
- **Pied de réponse finale** : seul le dernier message d'un tour porte le pied `agent · model · elapsed` (`🛠️ Build · opus · 1m 30s`), pour que la fin de la réponse soit toujours reconnaissable. Les messages précédents partent en texte simple.
- **Sélecteurs et clavier** : contrôles de modèle, d'agent, de variante et de contexte depuis le clavier persistant, favoris en premier.
- **Menu `/display`** : bascules d'affichage par chat/topic, un raccourci agent et un bouton d'annulation ; les préférences persistent dans `settings.json`.
- **Gestion des sessions** : `/retry` du dernier prompt, `/diff`, `/commit`, `/cost` suivi des dépenses avec `BUDGET_ALERT_USD`, `/close`, `/fork`, `/share`, `/rename`, `/refresh`, raccourcis de prompts enregistrés (`/saved`), commandes personnalisées (`/commands`), skills (`/skills`).
- **Tâches planifiées** : topic planifié par projet via `/task` et `/tasklist` (pause/reprise/exécution immédiate/logs).
- **Voix et fichiers** : transcription STT compatible Whisper pour les messages vocaux/audio, TTS global optionnel (`/tts`), pièces jointes image/PDF/texte, diffs en fichiers ou blocs de code en ligne.
- **Navigateur de projets** : `/open` et `/projects` avec garde des répertoires autorisés.
- **Contrôle du serveur** : démarrage automatique d'OpenCode, `/opencode_start` / `/opencode_stop` à distance, `/reload` de la config V2.
- **Contrôle d'accès mono-utilisateur**, aucun port public (le endpoint de santé se lie uniquement à `127.0.0.1`).
- **8 langues d'interface** avec repli vers l'anglais.

## Démarrage rapide

### 1. Prérequis

- Node.js 20+
- OpenCode, installé depuis [opencode.ai](https://opencode.ai) ou [GitHub](https://github.com/sst/opencode)
- Un bot Telegram créé via [@BotFather](https://t.me/BotFather)
- Votre identifiant utilisateur Telegram numérique, obtenu via [@userinfobot](https://t.me/userinfobot)

### 2. Créer et préparer le groupe Telegram

1. Créez un nouveau **supergroupe** Telegram dédié à un projet / dépôt OpenCode.
2. Ajoutez votre bot au groupe et nommez-le administrateur avec la permission **Manage Topics**.
3. Activez **Topics** dans les paramètres du groupe.
4. Dans [@BotFather](https://t.me/BotFather), exécutez `/setprivacy` pour le bot et choisissez **Disable**.
5. Conservez le topic **General** par défaut : c'est le canal de contrôle.

### 3. Lancer OpenCode

Exécutez OpenCode sur la machine où vivra le bot :

```bash
# V1
opencode serve
# V2: use the background service (stable port + credentials).
# A bare `opencode serve` binds a random port with a random password,
# so the bot could never reach it.
opencode service start
```

URL d'API par défaut : `http://localhost:4096` (V1) ou `http://127.0.0.1:49374` (V2, définir `OPENCODE_SERVER_VERSION=v2`).

### 4. Installer le bot

#### Option A : `npx`

```bash
npx @kevindevm/opencode-telegram-group-topics-bot
```

#### Option B : Installation globale

```bash
npm install -g @kevindevm/opencode-telegram-group-topics-bot
opencode-telegram-group-topics-bot config
opencode-telegram-group-topics-bot start
```

#### Option C : Exécution depuis les sources

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

`dist/cli.js` est le point d'entrée CLI compilé produit par `npm run build`.

#### Option D : Docker

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
cp .env.example .env
# fill in TELEGRAM_BOT_TOKEN, TELEGRAM_ALLOWED_USER_ID, OPENCODE_MODEL_PROVIDER, OPENCODE_MODEL_ID
docker compose up -d --build
```

Le `.env` reste sur l'hôte. Il est injecté au moment de l'exécution et n'est pas copié dans l'image.

La configuration et l'état d'exécution vivent dans le volume `opencode-group-topics-bot-data` (`OPENCODE_TELEGRAM_HOME=/app/data` dans le conteneur).

**Linux** (OpenCode sur l'hôte à `127.0.0.1:4096`) : le fichier compose par défaut utilise `network_mode: host`, donc le conteneur atteint votre serveur OpenCode hôte et voit les mêmes chemins de projet.

**Docker Desktop** (macOS/Windows) : le réseau de l'hôte n'est pas disponible, utilisez donc le fichier d'override, qui atteint OpenCode via `host.docker.internal` :

```bash
docker compose -f docker-compose.yml -f docker-compose.desktop.yml up -d --build
```

Sur Docker Desktop, le conteneur ne peut pas voir les chemins de projets de l'hôte ni lancer `opencode` lui-même : exécutez `opencode serve` (V1) ou `opencode service start` (V2) sur l'hôte et privilégiez des chemins `/projects` qui se résolvent dans le conteneur (montez les dépôts avec une entrée `volumes` supplémentaire si besoin). `/opencode_start` et `/opencode_stop` sont des fonctionnalités réservées à l'hôte.

Les versions stables sont publiées sur `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:<version>` et `ghcr.io/kevindevm/opencode-telegram-group-topics-bot:latest` pour `linux/amd64` et `linux/arm64`. Les release candidates ne reçoivent que leur tag de version exact.

#### Option E : Service Windows (NSSM, toujours actif)

Pour une installation 24h/24 et 7j/7 sous Windows, exécutez le bot comme service natif avec [NSSM](https://nssm.cc) :

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

La configuration se trouve alors dans `%APPDATA%\opencode-telegram-group-topics-bot\.env` (ou là où `OPENCODE_TELEGRAM_HOME` pointe) : le service lit ce fichier, pas le `.env` du dépôt. Une tâche planifiée qui exécute `opencode pair` à l'ouverture de session garde le CLI associé ; le service gère lui-même le processus du bot et le redémarre en cas d'échec.

### 5. Terminer l'assistant de configuration

L'assistant demande :

- la langue de l'interface
- le token du bot Telegram
- l'identifiant utilisateur Telegram autorisé
- l'URL de l'API OpenCode
- un éventuel nom d'utilisateur / mot de passe du serveur OpenCode

### 6. Vérification initiale

1. Écrivez au bot en privé et exécutez `/start` ; confirmez qu'il répond.
2. Dans le topic **General** du groupe, exécutez `/start`, puis `/status` pour vérifier que OpenCode est joignable.
3. Exécutez `/projects` dans **General** et sélectionnez le dépôt de ce groupe.
4. Exécutez `/new` dans **General** pour créer un topic de session.
5. Ouvrez le nouveau topic et envoyez un prompt.

Si tout cela fonctionne, l'espace de travail du groupe est prêt.

## Utilisation quotidienne

1. Démarrez OpenCode (`opencode serve` en V1, `opencode service start` en V2), puis démarrez le bot.
2. Ouvrez le groupe Telegram et rendez-vous dans **General**.
3. Utilisez `/projects` pour confirmer le dépôt sélectionné.
4. Utilisez `/new` pour créer un nouveau topic de session.
5. Travaillez dans le fil du topic ; si une commande shell tourne longtemps, appuyez sur ⏪ pour l'envoyer en arrière-plan.
6. Utilisez `/sessions` dans **General** pour revenir aux sessions plus anciennes.

## Charges parallèles et limites de débit Telegram

- Ce fork est conçu pour le travail parallèle : plusieurs fils de topics dans un même groupe, et plusieurs groupes pour plusieurs projets.
- Telegram applique des limites de débit de messages, surtout quand plusieurs topics reçoivent des mises à jour en même temps.
- Le bot ralentit ou échelonne les mises à jour Telegram quand c'est nécessaire (voir `SERVICE_MESSAGES_INTERVAL_SEC`, garder `>= 2`).
- Les sessions OpenCode continuent de tourner même si les mises à jour Telegram deviennent moins fréquentes : sous forte charge, attendez-vous à moins de messages en temps réel par topic, mais aucun travail n'est perdu.

## Commandes

Tout message en texte brut envoyé dans un topic de session est traité comme un prompt quand aucune interaction bloquante n'est active. Les actions de modèle, d'agent, de variante et de contexte sont accessibles depuis le clavier persistant en bas.

| Commande          | Description                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `/status`         | État du serveur et de la session                                         |
| `/new`            | Créer une nouvelle session                                               |
| `/abort`          | Interrompre l'action en cours                                           |
| `/sessions`       | Lister les sessions                                                      |
| `/recent`         | Parcourir les sessions récentes de tous les projets                      |
| `/last`           | Afficher le dernier message de la session                                |
| `/tts`            | Activer / désactiver les réponses audio                                  |
| `/projects`       | Lister les projets                                                       |
| `/open`           | Ajouter un projet en naviguant dans les répertoires                      |
| `/task`           | Créer une tâche planifiée                                                |
| `/tasklist`       | Lister les tâches planifiées                                             |
| `/queue`          | Afficher et gérer les messages en file d'attente                         |
| `/trust`          | Niveau de confiance pour l'approbation automatique des permissions       |
| `/retry`          | Renvoyer le dernier prompt                                               |
| `/diff`           | Afficher les fichiers modifiés de cette session                          |
| `/commit`         | Commiter les changements de la session avec un message                   |
| `/compact`        | Compacter le contexte de la session (sans clavier)                       |
| `/cost`           | Afficher la dépense de la session (sous-agents inclus) et du jour        |
| `/close`          | Fermer ce topic de session                                               |
| `/cleanup`        | Supprimer les topics de transcription des sous-agents                    |
| `/fork`           | Cloner cette session dans un nouveau topic                               |
| `/share`          | Exporter la transcription de cette session en fichier                    |
| `/saved`          | Raccourcis de prompts enregistrés                                        |
| `/rename`         | Renommer la session actuelle                                             |
| `/commands`       | Commandes personnalisées                                                 |
| `/skills`         | Catalogue des skills                                                     |
| `/opencode_start` | Démarrer le serveur OpenCode                                             |
| `/opencode_stop`  | Arrêter le serveur OpenCode                                              |
| `/reload`         | Recharger la configuration du serveur OpenCode (V2 uniquement)           |
| `/refresh`        | Actualiser les informations de la session                                |
| `/display`        | Options d'affichage pour ce chat (bascules + agent)                      |
| `/help`           | Aide                                                                     |

`/start` est réservé aux messages privés (handshake avec le bot). Les sélecteurs de modèle et d'agent sont des boutons du clavier, pas des commandes slash.

## Bouton d'arrière-plan

Quand un outil shell (`bash`/`execute`) ou sous-agent (`task`) tourne plus longtemps que `BACKGROUND_OFFER_AFTER_SEC` (3 s par défaut, comme l'astuce du TUI), le bot publie un bouton ⏪ **Envoyer en arrière-plan** dans le topic de session. Appuyer dessus appelle `session.background` d'OpenCode : la commande continue de tourner sur le serveur pendant que vous continuez à discuter, et le flux de complétion normal livre le résultat quand elle se termine.

- Une seule proposition par session en cours ; elle disparaît si la commande se termine d'abord.
- Réglez le délai avec `BACKGROUND_OFFER_AFTER_SEC`.

## Topics de transcription des sous-agents

Quand l'agent lance des sous-agents, chacun obtient son propre topic de transcription en lecture seule (`🧩 <description>`) avec la transcription live complète, tandis que le topic parent garde une carte d'état 🧩 compacte. Quand le sous-agent se termine, son topic est renommé (✅/❌) et fermé. Les réponses aux sondages fonctionnent toujours dans les topics de transcription ; les nouveaux prompts sont redirigés vers le topic parent avec une notification.

## Menu d'affichage

`/display` ouvre un menu par chat : il s'applique toujours au chat/topic où vous l'avez lancé (cherchez la note « Scope: this chat/topic only » dans le titre du menu), jamais globalement. Il contient :

- Des bascules afficher/masquer pour le raisonnement, les appels d'outils, les fichiers d'outils, les blocs de code, les avis d'arrière-plan, la copie des prompts PC et les aperçus de liens.
- Une ligne de raccourci agent (`🤖 Agent: <name>`) qui bascule le menu vers le sélecteur d'agent pour le même chat/topic.
- Un bouton `❌ Cancel` qui ferme le menu sans rien changer.

Les préférences persistent par chat/topic dans `settings.json`, pour que chaque topic de session garde son propre réglage d'affichage.

## Configuration

### Emplacement de la configuration

- En mode source (sources), la configuration est stockée à la racine du dépôt.
- En mode installé (installed), la configuration est stockée dans le répertoire de données d'application de la plateforme.
- `OPENCODE_TELEGRAM_HOME` remplace ces deux comportements et impose un répertoire de configuration personnalisé.

Chemins de configuration en mode installé :

- macOS : `~/Library/Application Support/opencode-telegram-group-topics-bot/.env`
- Windows : `%APPDATA%\opencode-telegram-group-topics-bot\.env`
- Linux : `~/.config/opencode-telegram-group-topics-bot/.env`

### Variables d'environnement

| Variable | Description | Requis | Valeur par défaut |
| -------- | ----------- | :----: | ----------------- |
| `TELEGRAM_BOT_TOKEN` | Token du bot fourni par @BotFather | Oui | - |
| `TELEGRAM_ALLOWED_USER_ID` | Votre identifiant utilisateur Telegram numérique | Oui | - |
| `TELEGRAM_PROXY_URL` | URL du proxy pour l'API Telegram (SOCKS5/HTTP) | Non | - |
| `OPENCODE_API_URL` | URL du serveur OpenCode | Non | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION` | Version de l'API du serveur : `v1` ou `v2` | Non | `v1` |
| `OPENCODE_SERVER_USERNAME` | Nom d'utilisateur d'authentification du serveur | Non | `opencode` |
| `OPENCODE_SERVER_PASSWORD` | Mot de passe d'authentification du serveur | Non | - |
| `OPENCODE_MODEL_PROVIDER` | Fournisseur de modèle par défaut | Oui | - |
| `OPENCODE_MODEL_ID` | ID du modèle par défaut | Oui | - |
| `OPENCODE_AUTO_START` | Démarre un serveur OpenCode géré au lancement du bot quand aucun n'est joignable | Non | `true` |
| `BOT_LOCALE` | Langue de l'interface du bot (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`) | Non | `en` |
| `SESSIONS_LIST_LIMIT` | Sessions par page dans `/sessions` | Non | `10` |
| `PROJECTS_LIST_LIMIT` | Projets par page dans `/projects` | Non | `10` |
| `COMMANDS_LIST_LIMIT` | Commandes par page dans `/commands` | Non | `10` |
| `OPEN_BROWSER_ROOTS` | Répertoires racine autorisés pour `/open`, séparés par des virgules | Non | répertoire personnel |
| `SCHEDULED_TASK_EXECUTION_TIMEOUT_MINUTES` | Durée d'exécution maximale d'une tâche planifiée, en minutes | Non | `120` |
| `SCHEDULED_TASK_POLL_INTERVAL_SEC` | Intervalle d'interrogation des tâches planifiées, en secondes | Non | `30` |
| `BUDGET_ALERT_USD` | Alerte de dépense quotidienne en USD (`0` = désactivée) | Non | `0` |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Intervalle des messages de service ; garder `>= 2`, `0` = immédiat (`TOOL_MESSAGES_INTERVAL_SEC` fonctionne toujours comme alias historique) | Non | `5` |
| `BACKGROUND_OFFER_AFTER_SEC` | Secondes d'exécution shell/sous-agent avant de proposer ⏪ l'envoi en arrière-plan | Non | `3` |
| `HIDE_THINKING_MESSAGES` | Masquer les messages de service `Thinking...` | Non | `false` |
| `HIDE_TOOL_CALL_MESSAGES` | Masquer les messages de service d'appels d'outils | Non | `false` |
| `HIDE_TOOL_FILE_MESSAGES` | Masquer les messages de fichiers d'outils envoyés comme documents | Non | `false` |
| `CODE_BLOCKS_IN_TEXT` | Afficher les diffs de code comme blocs de code texte au lieu de documents `.txt` | Non | `true` |
| `TRACK_BACKGROUND_SESSIONS` | Suivre les sessions en arrière-plan démarrées depuis le PC et notifier dans Telegram | Non | `true` |
| `SHOW_BACKGROUND_NOTIFICATIONS` | Afficher les avis de sessions en arrière-plan (bascule aussi via `/display`) | Non | `true` |
| `SHOW_PC_USER_MIRROR` | Recopier dans le topic les prompts tapés sur PC (bascule aussi via `/display`) | Non | `true` |
| `SHOW_LINK_PREVIEWS` | Afficher les aperçus de liens sous les messages de l'assistant (bascule aussi via `/display`) | Non | `true` |
| `MESSAGE_FORMAT_MODE` | Mode de formatage des réponses de l'assistant : `markdown` ou `raw` | Non | `markdown` |
| `RESPONSE_STREAM_THROTTLE_MS` | Délai entre les mises à jour en streaming de l'assistant, en ms | Non | `1000` |
| `BASH_TOOL_DISPLAY_MAX_LENGTH` | Longueur maximale affichée du code `bash`/`execute` dans les résumés | Non | `128` |
| `CODE_FILE_MAX_SIZE_KB` | Taille maximale (Ko) d'un fichier envoyé comme document | Non | `100` |
| `STT_API_URL` | URL de base d'une API compatible Whisper (ou endpoint complet pour `plain`) | Non | - |
| `STT_API_KEY` | Clé API de votre fournisseur STT (inutile pour `plain`) | Non | - |
| `STT_PROTOCOL` | `openai` (POST `{URL}/audio/transcriptions` avec clé) ou `plain` (POST de l'URL telle quelle avec un champ wav `audio`, sans authentification ; conversion avec ffmpeg) | Non | `openai` |
| `STT_AUDIO_FIELD` | Champ multipart portant l'audio (défauts : `file` pour openai, `audio` pour plain) | Non | - |
| `STT_TIMEOUT_SEC` | Délai d'expiration par transcription, en secondes | Non | `60` |
| `STT_FFMPEG_PATH` | Chemin absolu de ffmpeg (conversion wav en mode `plain` ; nécessaire seulement si ffmpeg n'est pas dans le PATH) | Non | - |
| `STT_MODEL` | Nom du modèle STT passé à `/audio/transcriptions` | Non | `whisper-large-v3-turbo` |
| `STT_LANGUAGE` | Indice de langue optionnel | Non | - |
| `STT_NOTE_PROMPT` | Prompt / note supplémentaire optionnel envoyé avec les requêtes de transcription | Non | - |
| `TTS_API_URL` | URL de base de l'API TTS | Non | - |
| `TTS_API_KEY` | Clé API TTS | Non | - |
| `TTS_MODEL` | Nom du modèle TTS passé à `/audio/speech` | Non | `gpt-4o-mini-tts` |
| `TTS_VOICE` | Nom de la voix TTS compatible OpenAI | Non | `alloy` |
| `LOG_LEVEL` | Niveau de journalisation (`debug`, `info`, `warn`, `error`) | Non | `info` |
| `BOT_HEALTH_PORT` | Port du endpoint de santé interne (`/health`, `/health/live`, `/health/ready`) sur `127.0.0.1` ; `0` le désactive | Non | désactivé ; `3100` dans Docker |

Gardez votre `.env` privé : il contient le token de votre bot. Tous les réglages `/display` s'appliquent par chat/topic (exécutez `/display` là où vous voulez le changement) ; les préférences persistent dans `settings.json`.

### Optionnel : transcription vocale et audio

Si `STT_API_URL` est définie, le bot transcrit les messages vocaux/audio de Telegram avant de les envoyer à OpenCode (`STT_API_KEY` est en plus requis pour les serveurs en protocole `openai`).

Des workers personnalisés minimaux sont pris en charge via `STT_PROTOCOL=plain` : le bot POST l'URL telle quelle avec un champ wav `audio` et sans authentification (l'entrée non-wav est convertie avec ffmpeg, il doit donc être dans le PATH). Les requêtes sont sérialisées car les workers de référence sont des instances CPU uniques.

Si les identifiants TTS sont configurés, `/tts` bascule les réponses vocales globalement. La préférence est stockée dans `settings.json` et persiste après redémarrage.

```env
TTS_API_URL=https://api.openai.com/v1
TTS_API_KEY=your-tts-api-key
TTS_MODEL=gpt-4o-mini-tts
TTS_VOICE=alloy
```

Exemples compatibles Whisper :

- OpenAI : `https://api.openai.com/v1`
- Groq : `https://api.groq.com/openai/v1`
- Together : `https://api.together.xyz/v1`

### Notes du sélecteur de modèles

- Les favoris apparaissent avant les modèles récents.
- Le modèle courant est marqué avec `✅`.
- Le modèle par défaut (`OPENCODE_MODEL_PROVIDER` + `OPENCODE_MODEL_ID`) est toujours inclus.

Pour ajouter un favori, ouvrez le TUI OpenCode et appuyez sur `Cmd+F` / `Ctrl+F` sur un modèle.

## Versions

Les releases sont entièrement automatisées à partir des changements de version, sans tagging manuel :

1. Incrémentez la version dans `package.json` (`npm version patch|minor|major`, ou modifiez-la à la main).
   - Utilisez un suffixe `-rc.N` pour les release candidates : `1.2.3-rc.1` (aperçu avec `npm run release:rc`, notes avec `npm run release:notes:preview`).
2. Poussez sur `main`. Le workflow **Publish** détecte le tag manquant puis, dans l'ordre : lint → build → test → génération des notes de release → publication sur npm (`latest`, ou `next` pour `-rc`) → push du tag `vX.Y.Z` → création de la GitHub Release → publication de l'image de conteneur multi-arch sur GHCR.
3. Rien ne se passe pour les pushes sans changement de version : la CI exécute toujours lint/build/test sur chaque push et chaque PR.

En résumé : **release par commit** ; tout push sur `main` portant un changement de version est publié. Les pré-releases ne touchent jamais le tag npm `latest` ni le tag de conteneur.

## Sécurité

Seul l'utilisateur Telegram dont l'ID correspond à `TELEGRAM_ALLOWED_USER_ID` peut utiliser le bot.

Le bot tourne en local et se connecte à votre serveur OpenCode local : aucun service public n'est exposé en dehors de Telegram lui-même. Le endpoint de santé optionnel (`BOT_HEALTH_PORT`) se lie uniquement à `127.0.0.1` et sert des états en lecture seule.

Ne commitez jamais votre `.env` (ignoré par défaut) ni `settings.json` (état d'exécution contenant des identifiants de sessions) ; les deux restent sur la machine qui exécute le bot.

## Développement

### Exécution depuis les sources

```bash
git clone https://github.com/kevindevm/opencode-telegram-group-topics-bot.git
cd opencode-telegram-group-topics-bot
npm install
npm run build
node dist/cli.js config --mode sources
npm run dev
```

### Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Construire et démarrer |
| `npm run build` | Compiler TypeScript |
| `npm start` | Exécuter le code compilé |
| `npm run release:prepare` | Incrémenter la version pour une release stable |
| `npm run release:rc` | Incrémenter la version pour une release candidate |
| `npm run release:notes:preview` | Prévisualiser les notes de release |
| `npm run lint` | Exécuter ESLint |
| `npm run format` | Exécuter Prettier |
| `npm test` | Exécuter les tests |
| `npm run test:coverage` | Exécuter les tests avec couverture |

Aucun watcher n'est utilisé car le bot maintient des connexions SSE et de polling persistantes.

### Vérifications avant chaque modification

```bash
npm run build && npm run lint && npm test
```

## Dépannage

**Le bot ne répond pas**

- Vérifiez que `TELEGRAM_ALLOWED_USER_ID` correspond bien à votre véritable identifiant utilisateur Telegram.
- Vérifiez que le token du bot est correct.
- Pour un usage en groupe, assurez-vous que le mode privé (privacy mode) est désactivé dans BotFather (`/setprivacy` → Disable).

**Le serveur OpenCode est inaccessible**

- Assurez-vous que le serveur OpenCode tourne (`opencode serve` en V1, `opencode service start` en V2 ; s'il demande des identifiants, associez le client une fois avec `opencode pair`).
- Vérifiez que `OPENCODE_API_URL` (et `OPENCODE_SERVER_VERSION` pour V2) pointe vers la bonne adresse.

**Impossible de créer de nouveaux topics de session**

- Vérifiez que le groupe est un supergroupe avec **Topics** activé.
- Vérifiez que le bot est administrateur avec la permission **Manage Topics**.

**Le bouton ⏪ n'apparaît jamais**

- Il ne s'affiche que pour les outils `bash`/`execute`/`task` qui tournent encore après `BACKGROUND_OFFER_AFTER_SEC` (3 s par défaut).
- Baissez ce seuil et regardez le topic de session : c'est là que la proposition est publiée.

## Crédits

Créé et maintenu par le propriétaire du dépôt, avec des contributions de la communauté.

Co-écrit avec **OpenCode (Muse Spark)** : assistant de programmation en binôme utilisé pour l'architecture, l'implémentation et la revue tout au long de ce fork.

Ce dépôt est un fork maintenu par [kevindevm](https://github.com/kevindevm), avec le support des group-topics ajouté au projet upstream.

Dépôt upstream : [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) par Ruslan Grinev.

## Licence

[MIT](LICENSE)
