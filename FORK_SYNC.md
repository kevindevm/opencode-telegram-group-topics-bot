# Fork Sync Guide

This repository is a product fork of the original single-chat project at `grinev/opencode-telegram-bot`.

## Last Synced Upstream

- Permanent git remote: `upstream` -> `https://github.com/grinev/opencode-telegram-bot.git`
- Upstream repo: `https://github.com/grinev/opencode-telegram-bot`
- Upstream branch: `main`
- Last reviewed upstream head: `2801cb8` (`fix(OTB-117)`, upstream `main` at v0.26.3+, 2026-10-10)
- Previously reviewed: `7a8e542` (`chore(release): v0.16.0`, 2026-04-12); fork `main` additionally aligned with upstream v0.17.0 runtime fixes
- Original fork point for this threaded fork: `21da71b` (`chore(release): v0.11.0`)

## Fork Rules

- Keep this fork optimized for group topics, thread-scoped sessions, and DM control flows.
- Prefer selective ports over blind merges.
- Keep upstream-compatible naming and UX when the change is low-risk.
- Skip or rewrite upstream changes that assume one global chat/session lane.

## Upstream Changes Intentionally Ported

- `c301481` setup wizard now asks for `OPENCODE_SERVER_USERNAME` and `OPENCODE_SERVER_PASSWORD`
- `d7a114f` dotenv startup noise suppression via quiet config loading
- `d758af7` startup logging improvements, including resolved config path logging
- `2b63c5b` alignment toward upstream command naming by exposing `/abort`
- `dce630c` partial port: `/start` is now always allowed during active interactions and performs scope-aware recovery
- `c192aee` partial port: model favorites/recent lists are filtered against the current provider catalog and invalid stored scoped models are reconciled
- `19e0644` reviewed during sync; localized text remains compatible with this fork
- `eb56b66` adapted port: interactive/status/setup messages now default to raw Telegram text while assistant completions still fall back safely from MarkdownV2 to plain text
- `c72e7cb` ported: French locale support added and registered in locale validation/docs
- `6afb300` + `6619532` ported: scoped pinned messages now show cumulative session cost
- `f3b3fc6` + `a337370` + `54a493d` ported: `/commands` pagination, filtering, and clearer execution UX
- `fcd2273` + `e4eb83e` + `b414bf3` covered by fork commit `c97baf6`: upstream tool-call streaming/reply formatting changes were already adapted into this fork's topic-aware streaming flow
- `84c300d` adapted port: subagent work status now renders inside the parent topic's tool stream without breaking topic-scoped delivery
- `afacade` ported: `/sessions` now requests root sessions only, avoiding child-session entries in the control-lane picker
- `6ff8fa1` ported: Markdown fallback retries now strip stale parse options, and Markdown splitting avoids trailing escape characters at chunk boundaries
- `b6efc31` ported: todowrite formatter now separates the header from todo items with a blank line
- `5632f2f` + `d888b16` adapted port: MarkdownV2 retries now attempt reserved-character escaping first and final assistant sends preserve raw-text fallback content instead of leaking converted Telegram markdown
- `dae0f82` partial port: assistant stream pacing is now configurable via `RESPONSE_STREAM_THROTTLE_MS`
- `bd4504d` ported: scoped pinned messages now show the current git branch for the active project, including linked worktrees
- `b0e96ee` adapted port: `todowrite` service messages are replaced in-place so todo streams stay isolated alongside the fork's scoped live stream and subagent cards
- `0efb80c` ported: long `bash` tool commands in Telegram summaries now truncate via `BASH_TOOL_DISPLAY_MAX_LENGTH`
- `13a8948` adapted port: scoped agent selection now falls back to an available project agent before prompts, commands, topic creation, and scheduled tasks
- `a25af98` ported: bot UI now labels the selector as `agent` instead of `mode`
- `2f22851` adapted port: `/open` now adds projects by browsing configurable allowed roots while still respecting this fork's group/topic project-lock rules and scoped state reset flow

## Upstream Changes Intentionally Adapted

- `/stop` -> `/abort`
  - This fork exposes `/abort` as the sole public command to match upstream.
- `/start` reset behavior
  - Upstream clears global project/session/pinned state.
  - This fork only clears non-topic scopes; topic-bound sessions remain attached to their thread.
- Model reconciliation
  - Upstream validates one stored model.
  - This fork validates all scoped stored models.
- Scheduled tasks
  - Upstream stores and delivers scheduled tasks in a single global lane.
  - This fork stores explicit delivery targets and creates a dedicated per-project scheduled topic in forum groups.
- Response and tool-call streaming
  - Upstream streams through the current single chat lane.
  - This fork routes streamed edits by `sessionId -> topic binding`, keeping unrelated topics isolated.
- Subagent activity cards
  - Upstream renders subagent work in one active chat lane.
  - This fork maps child-session activity back into the parent topic thread and replaces prior subagent cards in-place.

## Upstream Changes Intentionally Skipped

- Release-only bumps (`v0.11.1`, `v0.11.2`)
- Release-only bumps (`v0.11.3`, `v0.11.4`)
- Release-only bumps (`v0.12.0`, `v0.12.1`, `v0.13.0`)
- Release-only bumps (`v0.13.1`, `v0.13.2`) reviewed; runtime changes were already covered by fork commit `c97baf6`
- Release-only bumps (`v0.14.0`, `v0.14.1`) reviewed; runtime fixes were selectively ported/adapted above
- Upstream docs that frame forum topics / parallel thread workflows as out of scope
- Repo template churn that does not affect runtime behavior
- `d392778` upstream concept docs link back to this fork; not needed in fork docs
- `939ebb7` reviewed; already covered in this fork because streamed interim sends already use `disable_notification: true`
- `239e512` skipped: this fork still needs its custom final-delivery path for topic-aware ordering, TTS replies, and keyboard refresh behavior
- `dae0f82` generic Telegram API retry wrapper skipped: this fork already routes outbound calls through a topic-aware rate limiter with `retry_after` handling, plus scoped live-stream retry scheduling
- `c91f137` test-only upstream change skipped: this fork added equivalent linked-worktree coverage inside its scoped pinned manager tests
- Release-only bump (`v0.15.0`) reviewed; runtime/UI changes were selectively ported/adapted above
- `1ad75a5` reviewed; file logging was already present in this fork, so no additional port was needed
- `e85380f` + `0580a73` + `5222bae` + `ed512ff` reviewed for `v0.16.0`; skipped for now because this fork's topic-scoped live-stream/final-delivery pipeline diverges heavily and needs a dedicated manual adaptation pass
- Release-only/docs-only changes in `v0.16.0` skipped after review (`57a0c56`, `a75f055`, `8940e35`, `7a8e542`)
- `dc7818a` ported (OTB-113): auth middleware now ignores updates authored by the bot itself instead of logging them as unauthorized access
- `7b3a42c` ported (OTB-109): Telegram file downloads now route `socks*` proxy URLs through `SocksProxyAgent` instead of forcing `HttpsProxyAgent`
- `76b42be` adapted port (OTB-78): variant is shown beside the model in `/status` (`src/bot/commands/status.ts`) and the scoped pinned message (`src/pinned/manager.ts`) via optional `variant` param on `formatModelForDisplay`
- `f904a52` partial port (OTB-127): new `src/session/title-format.ts` `formatSessionDisplayTitle()` falls back to `pinned.default_session_title` for empty titles; applied to `/status`, `/rename` prompt, `/new` topic creation/notice, and `/sessions` topic creation. Upstream live `session.get` re-fetch and menu-wide wrapping intentionally not ported (fork keeps stored scoped titles; topic scopes are immutable)
- `2801cb8` reviewed (OTB-117); no port needed: fork `src/bot/index.ts` `onTool` only fires for non-`pending` states and `src/summary/aggregator.ts` already gates tool updates to `running/completed/error`, which covers the same bare-name flash
- `40b6af8` reviewed; skipped: upstream retry helpers live in `src/utils/telegram-rate-limit-retry.ts`, which this fork does not have — outbound calls go through the topic-aware `src/bot/telegram-rate-limiter.ts` instead and need a dedicated adaptation pass
- `a3c4ff4` (Indonesian) + `76b6c02` (Turkish) ported via key-mapping: new `src/i18n/id.ts` + `src/i18n/tr.ts` (419 fork keys each; 303 upstream translations, 116 English fallbacks for fork-specific keys, 5 placeholder mismatches fixed to English), registered in `src/i18n/index.ts` (`id-ID`, `tr-TR`), docs updated (`.env.example`, README). Fallback keys still need native-speaker review.
- `7e03d5e` (OTB-147 health endpoint) ported with fork adaptation: new `src/runtime/container.ts` + `src/runtime/health-port.ts` + `src/runtime/healthcheck.ts` (verbatim upstream), new `src/app/services/health-server-service.ts` (same routes/payloads; OpenCode check via fork `opencodeClient.global.health()`), `config.server.healthPort` (`BOT_HEALTH_PORT`; 3100 in container, 0 locally), lifecycle wiring in `src/app/start-bot-app.ts`, plus `health-port`/`healthcheck`/`health-server-service`/`config` tests. Upstream `start-bot-app` DI-container test not portable (fork has no app container); wiring covered by build + service tests.
- `c92a273` (Docker multi-arch CI) ported with fork adaptation: new `Dockerfile` (same stages; `CMD node dist/index.js`, `HEALTHCHECK dist/runtime/healthcheck.js`), `docker-compose.yml` + `docker-compose.desktop.yml` (fork service/volume names), `.dockerignore` (generic `*.service` line), `container-image.yml` (verbatim; image name derives from fork repo), `publish.yml` gains job outputs + `publish_container` job. The upstream `if: github.event.repository.fork != true` guard was intentionally NOT ported: this repo is itself a fork and the guard would disable its own npm releases.
- `09fb4db` (OTB-141 apply_patch display) ported with fork adaptation: `getPatchFileChanges`/`formatPatchFileLine`/`getFirstPatchFile` in `src/summary/formatter.ts` (completed patches render one line per file with counts; running/failed name the first file only, never the patch text), `ToolFileInfo.files[]` multi-document flow in `src/summary/aggregator.ts` (per-file documents from `metadata.files[]`, existing single-section fallback kept), per-file captions in `src/bot/index.ts`. Pinned-manager file-list hunk not portable (fork pinned messages carry no per-file list); live-stream duration hunk not needed (fork suppresses file-mutation live lines by design).
- `6963610` (OTB-131 gone-folder hiding) ported with fork adaptation: new shared `src/project/directory.ts` (`projectDirectoryExists`, `filterProjectsWithExistingDirectories`; local-fs check matching the fork's existing local-server semantics in `prompt.ts`), gone worktrees filtered from `/projects` picker/pages/selection, and the `projects.worktree_missing` notice (previously a dead key) now answered by `/new`, `/task`, and `/sessions` when the current project directory is gone. Prompt-in-gone-worktree notice already existed and was kept. Upstream server-confirmed-absence logic is V2-only and N/A.
- `3991ebd` (OTB-143 removed-model fallback) reviewed; core already covered: fork `reconcileStoredModelSelection()` validates ALL scoped stored models against the catalog at startup with env-default fallback (upstream equivalent arrived later for V2 catalog timing). The no-cache-first-minute window and removed-tap redraw are V2-catalog-timing specific and N/A to this fork's V1 flow.
- Upstream refactors `b9a16d9`/`bd796a4`/`8ca71bd`/`823fcfb` (OTB-90..94 app container) + `ac4d691` (OTB-70 event bridge split) reviewed; skipped by design — this fork keeps its topic-scoped managers as module singletons; adopting the container would be a full rewrite of the fork's session/topic binding layer
- Upstream OpenCode V2 support (`6cc5a97`, `243cf19`, `87330bc`, `3e7859f`, `cbfc209` /reload, V2 queue/inbox OTB-116/121/122/146, `dcb93f7` /detach, `5b8b7c5`, `bb992ac`, `f6028b5`, `a1163c4`, `581d6ff`) reviewed; skipped for now — fork targets the V1 session/topic flow and needs a dedicated V2 adaptation design before porting queue/inbox semantics
- `cbfc209` (OTB-123) partial port: new `/reload` command (V2-only guard + `location.reload()` + model catalog refresh in background); upstream container/model-view/router wiring N/A to this fork's flat layout
- Release-only bumps from `v0.17.0` through `v0.26.3` skipped after review (runtime changes above classified individually)
- V2 foundation ported (OTB-53 `6cc5a97` core, partial): deps `@opencode/client ^2.0.26` + `@opencode-ai/sdk ^1.19.0`; `OPENCODE_SERVER_VERSION` (`v1` default, per-version default URLs) in `src/config.ts`; new `src/opencode/v2/{client,events,mappers}.ts` (verbatim upstream, plus shared `src/utils/type-guards.ts` + `src/utils/opencode-error.ts`); `src/opencode/client.ts` builds the V1 or V2 client from the configured version and exposes `opencodeV2Client`, `probeOpencodeServer` (`global/health` vs `api/info`), and `explainServerVersionMismatch` (wrong-credentials vs wrong-version diagnostics wired into `src/app/start-bot-app.ts`). Verified live against OpenCode v2.0.24 with auth: probe diagnoses correctly, and an authenticated end-to-end passed (health, 11 projects, 4 providers, session create → promptAsync → "V2-OK" reply via translated events → busy status → stream → delete). Ported upstream `tests/opencode/v2/{client,events,mappers}.test.ts` (59 tests). Remaining for full V2: consumer-path branches (prompt inbox/steer-queue, form-based questions/permissions, `/reload`, file-based folder presence, queue buttons, resumed runs, V2-aware setup/start), and an authenticated permission/question round-trip.

## Sync Workflow

1. Refresh upstream refs with `git fetch upstream main`.
2. Compare `upstream/main` against the last reviewed commit in this file.
3. Classify changes into:
   - safe cherry-pick / direct port
   - manual adaptation required
   - skip for fork-specific reasons
4. Use `git log --oneline <last-reviewed>..upstream/main` and `git diff --stat <last-reviewed>..upstream/main` for the initial review.
5. Port runtime/setup fixes first.
6. Port command/state changes only after checking thread-scoped behavior in:
   - `src/bot/commands/`
   - `src/bot/index.ts`
   - `src/interaction/`
   - `src/model/manager.ts`
   - `src/pinned/manager.ts`
   - `src/settings/manager.ts`
7. Run `npm run build`, `npm run lint`, and `npm test`.
8. Update this file:
   - reviewed upstream head
   - what was ported
   - what was skipped and why

## Remote Notes

- Prefer the permanent `upstream` remote for all future fork-sync checks; do not create ad-hoc temporary refs when the remote is available.
- Standard refresh command: `git fetch upstream main`
- Inspect new upstream commits with `git log --oneline HEAD..upstream/main` only when you specifically want to compare your current branch tip to upstream; for sync review, compare from the recorded `Last reviewed upstream head` instead.
- If the remote is ever missing in a fresh clone, restore it with `git remote add upstream https://github.com/grinev/opencode-telegram-bot.git`

## Known Conflict Hotspots

- `src/bot/commands/start.ts`
- `src/bot/index.ts`
- `src/interaction/guard.ts`
- `src/interaction/manager.ts`
- `src/model/manager.ts`
- `src/pinned/manager.ts`
- `README.md`, `PRODUCT.md`, `AGENTS.md`

## Publishing Notes

- Document the fork-specific behavior first; do not claim parity with the original project.
- Keep source-based setup instructions accurate until a distinct package name is chosen.
