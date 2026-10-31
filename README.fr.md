# OpenCode Telegram Group Topics Bot

[README en anglais](./README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

Un bot Telegram ([grammy](https://grammy.dev/), Node.js 20+) qui transforme un supergroupe Telegram en **client mobile multi-sessions pour [OpenCode](https://opencode.ai)** : le topic **General** sert de canal de contrôle, et chaque session OpenCode obtient son propre topic de forum, avec streaming en direct, tableau de bord d'état épinglé, file d'attente de prompts, flux de permissions et de questions, et un bouton ⏪ d'envoi en arrière-plan pour les longues commandes shell.

Ce projet est un fork de [grinev/opencode-telegram-bot](https://github.com/grinev/opencode-telegram-bot) par Ruslan Grinev.

- Utilisez le projet upstream pour le workflow plus simple en chat unique.
- Utilisez ce fork pour des sessions parallèles dans des topics de forum, contrôlables depuis votre téléphone.

Aucun port ouvert, aucune interface web exposée. Le bot ne communique qu'avec votre serveur OpenCode local et l'API Telegram Bot. Les serveurs OpenCode V1 et V2 sont pris en charge. Un groupe correspond généralement à un dépôt ; plusieurs topics de session peuvent tourner en parallèle dans un même groupe, et plusieurs groupes peuvent rester actifs en même temps.

Langues de l'interface du bot : English (`en`)](./README.md), [Deutsch (`de`)](./README.de.md), [Español (`es`)](./README.es.md), [Français (`fr`)](./README.fr.md), [Bahasa Indonesia (`id`)](./README.id.md), [Русский (`ru`)](./README.ru.md), [Türkçe (`tr`)](./README.tr.md), [简体中文 (`zh`)](./README.zh-CN.md)

> Remarque : le [`README.md`](./README.md) en anglais reste la documentation de référence. En cas de différence de contenu, c'est la version anglaise qui fait foi.

<p align="center">
  <img src="assets/screencast.gif" width="45%" alt="OpenCode Telegram Group Topics Bot screencast" />
</p>

## En bref

- Un groupe Telegram correspond en général à un dépôt / espace de travail de projet.
- **General** est le canal de contrôle : `/projects`, `/sessions`, `/recent`, `/new`, `/task`, et les vérifications d'état.
- Chaque nouvelle session OpenCode obtient son propre topic de forum, avec son propre état de session, de modèle, d'agent et de tableau de bord épinglé.
- Les longues commandes shell proposent un bouton ⏪ qui envoie la session en arrière-plan pour que vous puissiez continuer à discuter.
- Plusieurs topics de session peuvent tourner en parallèle dans un même groupe, et plusieurs groupes peuvent rester actifs en même temps.
- Les échanges en privé (DM) servent au contrôle léger et aux vérifications d'état, pas au workflow multi-sessions principal.

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

URL par défaut de l'API : `http://localhost:4096` (V1) ou `http://127.0.0.1:49374` (V2, définir `OPENCODE_SERVER_VERSION=v2`).

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

Docker est aussi une option d'installation. Consultez la section Quick Start du [`README.md`](./README.md) en anglais pour la procédure complète (compose, `host.docker.internal`, images GHCR, Windows Service avec NSSM, etc.).

### 5. Terminer l'assistant de configuration

L'assistant demande :

- la langue de l'interface
- le token du bot Telegram
- l'identifiant de l'utilisateur Telegram autorisé
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

## Travail parallèle et limites de débit Telegram

- Ce fork est conçu pour le travail parallèle : plusieurs fils de topics dans un même groupe, et plusieurs groupes pour plusieurs projets.
- Telegram applique des limites de débit de messages, surtout quand plusieurs topics reçoivent des mises à jour en même temps.
- Le bot ralentit ou échelonne les mises à jour Telegram quand c'est nécessaire (voir `SERVICE_MESSAGES_INTERVAL_SEC`, garder `>= 2`).
- Les sessions OpenCode continuent de tourner même si les mises à jour Telegram deviennent moins fréquentes : sous forte charge, attendez-vous à moins de messages en temps réel par topic, mais aucun travail perdu.

## Commandes

Tout message en texte brut envoyé dans un topic de session est traité comme un prompt quand aucune interaction bloquante n'est active. Les actions de modèle, d'agent, de variante et de contexte sont accessibles depuis le clavier persistant en bas.

| Commande         | Description                                                        |
| ----------------- | ------------------------------------------------------------------ |
| `/status`         | État du serveur et de la session                                   |
| `/new`            | Créer une nouvelle session                                         |
| `/abort`          | Interrompre l'action en cours                                      |
| `/sessions`       | Lister les sessions                                                |
| `/recent`         | Parcourir les sessions récentes de tous les projets                |
| `/last`           | Afficher le dernier message de la session                          |
| `/tts`            | Activer/désactiver les réponses audio                              |
| `/projects`       | Lister les projets                                                 |
| `/open`           | Ajouter un projet en naviguant dans les répertoires                |
| `/task`           | Créer une tâche planifiée                                          |
| `/tasklist`       | Lister les tâches planifiées                                       |
| `/queue`          | Afficher et gérer les messages en file d'attente                   |
| `/trust`          | Niveau de confiance pour l'approbation automatique des permissions |
| `/retry`          | Renvoyer le dernier prompt                                         |
| `/diff`           | Afficher les fichiers modifiés de cette session                    |
| `/commit`         | Commiter les changements de la session avec un message             |
| `/compact`        | Compacter le contexte de la session (sans clavier)                 |
| `/cost`           | Afficher la dépense de la session (sous-agents inclus) et du jour   |
| `/close`          | Fermer ce topic de session                                         |
| `/cleanup`        | Supprimer les topics de transcription des sous-agents              |
| `/fork`           | Cloner cette session dans un nouveau topic                         |
| `/share`          | Exporter la transcription de cette session en fichier              |
| `/saved`          | Raccourcis de prompts enregistrés                                  |
| `/rename`         | Renommer la session actuelle                                       |
| `/commands`       | Commandes personnalisées                                           |
| `/skills`         | Catalogue des skills                                               |
| `/opencode_start` | Démarrer le serveur OpenCode                                       |
| `/opencode_stop`  | Arrêter le serveur OpenCode                                        |
| `/reload`         | Recharger la configuration du serveur OpenCode (V2 uniquement)     |
| `/refresh`        | Actualiser les informations de la session                          |
| `/display`        | Options d'affichage pour ce chat (bascules + agent)                |
| `/help`           | Aide                                                               |

`/start` est réservé aux messages privés (handshake avec le bot). Les sélecteurs de modèle et d'agent sont des boutons du clavier, pas des commandes slash.

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

| Variable                      | Description                                                                             | Requis  | Valeur par défaut                                             |
| ----------------------------- | --------------------------------------------------------------------------------------- | :-----: | ------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`          | Token du bot fourni par @BotFather                                                      | Oui     | -                                                             |
| `TELEGRAM_ALLOWED_USER_ID`    | Votre identifiant utilisateur Telegram numérique                                        | Oui     | -                                                             |
| `OPENCODE_API_URL`            | URL du serveur OpenCode                                                                 | Non     | `http://localhost:4096` (V1) / `http://127.0.0.1:49374` (V2) |
| `OPENCODE_SERVER_VERSION`     | Version de l'API du serveur : `v1` ou `v2`                                              | Non     | `v1`                                                          |
| `OPENCODE_SERVER_USERNAME`    | Nom d'utilisateur pour l'authentification au serveur                                    | Non     | `opencode`                                                    |
| `OPENCODE_SERVER_PASSWORD`    | Mot de passe pour l'authentification au serveur                                         | Non     | -                                                             |
| `OPENCODE_MODEL_PROVIDER`     | Fournisseur de modèle par défaut                                                        | Oui     | -                                                             |
| `OPENCODE_MODEL_ID`           | ID du modèle par défaut                                                                 | Oui     | -                                                             |
| `OPENCODE_AUTO_START`         | Démarre un serveur OpenCode géré au lancement du bot quand aucun n'est joignable          | Non     | `true`                                                        |
| `BOT_LOCALE`                  | Langue de l'interface du bot (`en`, `de`, `es`, `fr`, `id`, `ru`, `tr`, `zh`)            | Non     | `en`                                                          |
| `SERVICE_MESSAGES_INTERVAL_SEC` | Intervalle des messages de service ; garder `>= 2`, `0` = immédiat                    | Non     | `5`                                                           |
| `BUDGET_ALERT_USD`            | Alerte de dépense quotidienne en USD (`0` = désactivée)                                 | Non     | `0`                                                           |
| `LOG_LEVEL`                   | Niveau de journalisation (`debug`, `info`, `warn`, `error`)                             | Non     | `info`                                                        |

Gardez votre `.env` privé : il contient le token de votre bot.

Cette liste est condensée ; le tableau complet des variables d'environnement se trouve dans la section Configuration du [`README.md`](./README.md) en anglais.

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

## Sécurité

Seul l'utilisateur Telegram dont l'ID correspond à `TELEGRAM_ALLOWED_USER_ID` peut utiliser le bot.

Le bot tourne en local et se connecte à votre serveur OpenCode local : aucun service public n'est exposé en dehors de Telegram lui-même. Le endpoint de santé optionnel (`BOT_HEALTH_PORT`) écoute uniquement sur `127.0.0.1` et sert des états en lecture seule.

Ne commitez jamais votre `.env` (ignoré par défaut) ni `settings.json` (état d'exécution contenant des identifiants de sessions) ; les deux restent sur la machine qui exécute le bot.

## Plus de documentation

- Documentation principale en anglais : [`README.md`](./README.md)
- Notes de synchronisation du fork : [`FORK_SYNC.md`](./FORK_SYNC.md)
- Périmètre produit et état : [`PRODUCT.md`](./PRODUCT.md)
- Contribuer : [`CONTRIBUTING.md`](./CONTRIBUTING.md)

## Licence

[MIT](LICENSE) · Projet original © Ruslan Grinev · Modifications du fork © Shane Kunz
