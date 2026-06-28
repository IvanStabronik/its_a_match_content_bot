# Its a Match Content Bot — Implementation Tasks (v1)

Ordered task list for implementing v1. Follow [REQUIREMENTS.md](./REQUIREMENTS.md) v1.2 and [ARCHITECTURE.md](./ARCHITECTURE.md) v1.2 strictly.

**Status:** Planning only — do not mark complete until implemented and verified.

Phases are numbered **1–23 in implementation order**. Phase 12 (Optional AI Module) precedes command handlers, content input, and moderation so AI enablement rules are available before those features are wired.

---

## Scope Reminder

### In scope (v1)

Manual content input, moderation queue, publish/schedule, `/poll`, optional OpenAI, Docker, SQLite (`posts` table only), JSON logging, Russian bot UI.

### Explicitly out of scope — do NOT implement

- `/find`, Source_Adapter, external content fetching
- Web admin, webhook mode, HTTP server
- Redis, PostgreSQL, n8n, Telegram Mini App
- Media groups / albums
- `settings` and `sources` database tables
- Main Its a Match bot API integration (CTA text via `MAIN_BOT_USERNAME` env only)

### AI enablement rules (v1)

When `OPENAI_API_KEY` is **absent** or empty:

- Do **not** register AI commands (`/ai_rewrite`, `/ai_score`, `/ai_classify`, `/ai_poll`, `/ai_cta`)
- Do **not** show ♻️ Rewrite on Moderation_Card
- Do **not** run background AI evaluation on new Candidates
- Bot MUST start and operate normally without errors (TP-1.4)

When `OPENAI_API_KEY` is **present**:

- Register all AI commands
- Show ♻️ Rewrite on Moderation_Card
- Run background risk/category evaluation after Candidate creation (fire-and-forget)

---

## Phase 1 — Project Setup

- [ ] **T-1.1** Initialize npm project with `package.json` (name, version, `engines` Node ≥20, scripts: `build`, `start`, `dev`, `test`)
- [ ] **T-1.2** Add production dependencies: `grammy`, `better-sqlite3`, `openai`
- [ ] **T-1.3** Add dev dependencies: `typescript`, `tsx`, `@types/node`, `@types/better-sqlite3`, test runner (e.g. Vitest)
- [ ] **T-1.4** Create `.gitignore` (include `.env`, `node_modules/`, `dist/`, `data/`, `*.db`, logs)
- [ ] **T-1.5** Create directory layout per ARCHITECTURE §2.1 (`src/`, `src/bot/`, `src/db/`, `src/services/`, `src/ai/`)
- [ ] **T-1.6** Add `README.md` — technical sections in English, short Russian quickstart (clone, `.env`, `docker compose up`, verify `/start`)

---

## Phase 2 — TypeScript Configuration

- [ ] **T-2.1** Add `tsconfig.json` with `strict: true`, `module: NodeNext`, `outDir: dist`, `rootDir: src`
- [ ] **T-2.2** Verify `npm run build` compiles empty/skeleton entry without errors
- [ ] **T-2.3** Add `src/types.ts` — `PostType`, `PostStatus`, `Post`, `CreatePostInput`, predefined categories constant, session types

---

## Phase 3 — Environment Configuration

- [ ] **T-3.1** Create `.env.example` documenting all variables: `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`, `DATABASE_PATH`, `BACKUP_DIR`, `TIMEZONE`, `OPENAI_API_KEY` (optional), `MAIN_BOT_USERNAME` (optional)
- [ ] **T-3.2** Implement `src/config.ts` — load and validate required env vars
- [ ] **T-3.3** Validate `ADMIN_TELEGRAM_IDS`: 1–2 numeric IDs, comma-separated
- [ ] **T-3.4** Apply defaults: `DATABASE_PATH`, `BACKUP_DIR`, `TIMEZONE` (default `Europe/Warsaw`)
- [ ] **T-3.5** Treat empty/missing `OPENAI_API_KEY` and `MAIN_BOT_USERNAME` as null (no startup error)
- [ ] **T-3.6** Exit non-zero with log naming missing variable (no secret values) for required var failures

---

## Phase 4 — Logger

- [ ] **T-4.1** Implement `src/logger.ts` — JSON to stdout with `timestamp`, `level`, `module`, `message`
- [ ] **T-4.2** Add secret redaction for tokens, API keys, and sensitive env patterns
- [ ] **T-4.3** Expose `debug`, `info`, `warn`, `error` helpers used across modules

---

## Phase 5 — SQLite Schema and Repository

- [ ] **T-5.1** Implement `src/db/connection.ts` — open DB, set pragmas: `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`
- [ ] **T-5.2** Implement `src/db/schema.ts` — create `posts` table only (no `settings`, no `sources`)
- [ ] **T-5.3** Include columns per ARCHITECTURE §6.2 including `poll_question`, `poll_options_json`, `last_error`, `publishing_started_at`
- [ ] **T-5.4** Add CHECK constraints for `type`, `status`, and `category` (nullable category with predefined slug list)
- [ ] **T-5.5** Create indexes: `status`, partial indexes on `scheduled_at`, `posted_at`, `pending created_at`, `publishing_started_at`
- [ ] **T-5.6** Implement `src/services/posts.ts` — `PostRepository` with CRUD and query methods
- [ ] **T-5.7** Implement `create`, `getById`, `update`, `countPending`, `getPendingPage`, `getDueScheduled(nowIso)` — due scheduled posts only:

  ```sql
  status = 'scheduled'
  AND scheduled_at <= :nowIso
  AND publishing_started_at IS NULL
  ```

  (Never publish before `scheduled_at`; exclude posts with an active publish claim.)
- [ ] **T-5.8** Implement publish methods: `claimPublishing(id)`, `markPosted(id, messageId)`, `releasePublishingAfterManualFailure(id, originalStatus, error)`, `markScheduledPublishFailed(id, error)`
- [ ] **T-5.9** Implement `recoverStalePublishingClaims(olderThanMinutes)` — clear claim, keep status, set `last_error`, return rows for notification
- [ ] **T-5.10** Implement `getStats`, `getScheduled(limit)`, `getPosted(limit)` for command handlers
- [ ] **T-5.11** Enforce valid status transitions in repository (reject invalid `(from, to)` pairs)

---

## Phase 6 — Docker and Deployment

- [ ] **T-6.1** Create multi-stage `Dockerfile` — both stages use pinned `node:20-bookworm-slim`
- [ ] **T-6.2** Builder stage: `npm ci`, compile TypeScript; production stage: `npm ci --omit=dev`, copy `dist/`
- [ ] **T-6.3** Create `docker-compose.yml` — service `content-bot`, `restart: unless-stopped`, `env_file: .env`, volume `content-bot-data:/app/data`
- [ ] **T-6.4** Set container env defaults for `DATABASE_PATH` and `BACKUP_DIR` under `/app/data`
- [ ] **T-6.5** Verify `docker compose up --build` starts within 30s with valid `.env` (TP-1.1)

---

## Phase 7 — Telegram Client Utilities

- [ ] **T-7.1** Implement `src/services/telegram.ts` — retry wrapper (3 attempts, exponential backoff for non-publish calls)
- [ ] **T-7.2** Implement `sendByType(post)` mapping: text/link → `sendMessage`, photo/video/animation → respective methods, poll → `sendPoll`
- [ ] **T-7.3** Implement `buildPostLink(channelUsername, messageId)` and `sendTestMessage`
- [ ] **T-7.4** Implement `verifyTelegramConnection(api, 30s timeout)` for startup

---

## Phase 8 — Bot Initialization

- [ ] **T-8.1** Implement `src/bot/index.ts` — create grammY `Bot`, register middleware and handlers
- [ ] **T-8.2** Register global `bot.catch()` — log errors, do not crash process
- [ ] **T-8.3** Implement `src/index.ts` — load config → init schema → create bot → verify Telegram → run stale claim recovery → start scheduler → `bot.start()` long polling
- [ ] **T-8.4** Log ready state on successful start (TP-1.1)
- [ ] **T-8.5** Confirm no HTTP server or inbound ports are opened (TP-8.2)

---

## Phase 9 — Auth Middleware

- [ ] **T-9.1** Implement `src/bot/middleware/auth.ts` — check `ctx.from.id` against `ADMIN_TELEGRAM_IDS`
- [ ] **T-9.2** Unauthorized message → reply `Доступ запрещён` (TP-2.1)
- [ ] **T-9.3** Unauthorized callback → `answerCallbackQuery` with `Доступ запрещён`, no side effects (TP-2.2)
- [ ] **T-9.4** Register auth middleware before all handlers

---

## Phase 10 — Russian Messages

- [ ] **T-10.1** Create `src/bot/messages.ts` — centralize all user-facing Russian strings
- [ ] **T-10.2** Include: access denied, welcome, help, errors, schedule prompts, queue warning (>50), publish confirmations, unsupported type message
- [ ] **T-10.3** Ensure no English strings are sent to Admins in command/callback responses (except URLs/t.me links)

---

## Phase 11 — Session Store

- [ ] **T-11.1** Implement `src/bot/session.ts` — in-memory `Map<adminUserId, SessionState>`
- [ ] **T-11.2** Support states: `idle`, `schedule`, `edit_caption`, `rewrite_select`
- [ ] **T-11.3** Store queue pagination page per admin for `/queue` Prev/Next

---

## Phase 12 — Optional AI Module

- [ ] **T-12.1** Implement `src/ai/module.ts` — instantiate **only** when `OPENAI_API_KEY` present; export `ai: AiModule | null` to bot layer
- [ ] **T-12.2** Methods: `rewriteCaption` (3 variants, Russian, ≤1024), `scoreContent`, `assessRisk`, `classify`, `generatePoll`, `generateCta`
- [ ] **T-12.3** Classify into predefined category slugs only (TP-7.2)
- [ ] **T-12.4** CTA uses `MAIN_BOT_USERNAME` when set; generic fallback otherwise
- [ ] **T-12.5** 30s timeout per call; errors to Admin in Russian; no mutation on failure (TP-7.3)
- [ ] **T-12.6** **When key absent:** no AI module instance, no AI commands, no Rewrite button, no background eval — bot starts without error (TP-1.4)
- [ ] **T-12.7** **When key present:** register AI commands, show ♻️ Rewrite on Moderation_Card, enable background eval on create
- [ ] **T-12.8** Risk score > 7 → append warning with `risk_reason` on Moderation_Card (when AI enabled)

---

## Phase 13 — Command Handlers

- [ ] **T-13.1** Implement `src/bot/handlers/commands.ts` — register all v1 commands
- [ ] **T-13.2** `/start` — Russian welcome + v1 command list; **exclude AI commands when key absent** (TP-2.3, TP-1.4)
- [ ] **T-13.3** `/help` — same command list as `/start` (respects AI enablement rules from Phase 12)
- [ ] **T-13.4** `/add <text>` — validate 1–4096 chars, create `text` Candidate (Req 3.4–3.5)
- [ ] **T-13.5** `/scheduled` — list up to 10 scheduled, sorted ASC (TP-6.2)
- [ ] **T-13.6** `/posted` — list up to 10 posted with t.me links, sorted DESC (TP-6.3)
- [ ] **T-13.7** `/stats` — counts by status, today / 7d / all-time (TP-6.1)
- [ ] **T-13.8** `/testpost` — send test message to channel, confirm or error (TP-6.4)
- [ ] **T-13.9** `/backup` — delegate to BackupService, confirm filename and size (TP-6.5)
- [ ] **T-13.10** Do **not** register `/find` (TP-6.6)
- [ ] **T-13.11** Register AI commands only when `OPENAI_API_KEY` set: `/ai_rewrite`, `/ai_score`, `/ai_classify`, `/ai_poll`, `/ai_cta` (TP-1.4)

---

## Phase 14 — Poll Command

- [ ] **T-14.1** Implement `/poll Question | Opt1 | Opt2 [| Opt3 …]` parser in commands handler
- [ ] **T-14.2** Validate: question ≤255 chars, 2–10 options, pipe-separated format (TP-3.6, TP-3.7)
- [ ] **T-14.3** Save Candidate: `type=poll`, `poll_question`, `poll_options_json`, `status=pending`
- [ ] **T-14.4** Confirm creation with Candidate ID in Russian

---

## Phase 15 — Manual Content Input

- [ ] **T-15.1** Implement `src/bot/handlers/content.ts` for non-command messages
- [ ] **T-15.2** Plain text → `type=text`, max 4096 chars (TP-3.1)
- [ ] **T-15.3** URL-only message (full entity coverage) → validate URL → `type=link`, `source_url` (TP-3.2, TP-3.3)
- [ ] **T-15.4** Photo / video / animation → save `media_file_id` + optional caption (TP-3.4)
- [ ] **T-15.5** Forwarded messages → map to text/photo/video/animation/link when content accessible
- [ ] **T-15.6** Reject unsupported types with Russian list message (TP-3.5)
- [ ] **T-15.7** Confirm save with Candidate ID within 2 seconds; include queue warning if pending > 50 (TP-4.10)
- [ ] **T-15.8** Implement `src/services/content-filter.ts` — keyword forbidden-category warnings on ingest
- [ ] **T-15.9** When `OPENAI_API_KEY` present only — fire-and-forget background AI risk/category evaluation via Phase 12 module (non-blocking, TP-7.4); **skip entirely when key absent**

---

## Phase 16 — Moderation Cards and Callbacks

- [ ] **T-16.1** Implement `src/bot/keyboards.ts` — Moderation_Card formatter and inline keyboards
- [ ] **T-16.2** Display: id, type, category, source_url, caption/poll_question (200 char truncate), scores, last_error, scheduled_at, status, warnings
- [ ] **T-16.3** Buttons: Post Now, Schedule, Edit Caption, Skip, Delete; **♻️ Rewrite only when `OPENAI_API_KEY` present** (Phase 12); Prev/Next when queue > 1
- [ ] **T-16.4** Implement `src/bot/handlers/moderation.ts` — `/queue` one card per page + queue warning if pending > 50 (TP-4.1, TP-4.9)
- [ ] **T-16.5** Implement `src/bot/handlers/callbacks.ts` — wire all `mod:*`, `queue:*`, `rewrite:*` callbacks
- [ ] **T-16.6** Skip → `skipped`; Delete → `deleted` + `deleted_at`; show next queue item (TP-4.8)
- [ ] **T-16.7** Edit Caption session — prompt and save caption ≤1024 chars
- [ ] **T-16.8** Rewrite flow — **only when AI enabled** (Phase 12): call AI, show 3 variants, pick button updates caption (TP-7.1); no `mod:rewrite` callback registered when key absent
- [ ] **T-16.9** Reject Post Now on already `posted` Candidate (TP-4.5)

---

## Phase 17 — Schedule Parser and Scheduling UI

- [ ] **T-17.1** Implement `src/services/schedule-parser.ts`
- [ ] **T-17.2** Accept formats: `DD.MM HH:mm` and `DD.MM.YYYY HH:mm` only (TP-5.4 rejects ISO)
- [ ] **T-17.3** Interpret in `TIMEZONE`; default current year when year omitted (TP-5.2)
- [ ] **T-17.4** Reject past datetimes and times < now + 5 minutes; max now + 30 days (TP-5.3)
- [ ] **T-17.5** Schedule callback — set session, prompt accepted formats in Russian (Req 7.14)
- [ ] **T-17.6** On valid input: save `scheduled_at` (ISO UTC), status → `scheduled`, confirm `DD.MM.YYYY HH:mm` (TP-5.1)
- [ ] **T-17.7** Reject scheduling if status is not `pending` (Req 7.8)

---

## Phase 18 — Publisher Service

- [ ] **T-18.1** Implement `src/services/publisher.ts` — `publishManual` and `publishScheduled`
- [ ] **T-18.2** `claimPublishing(id)` in short transaction — set `publishing_started_at` only if status in (`pending`,`scheduled`) and claim NULL; commit before Telegram call
- [ ] **T-18.3** Reject concurrent attempts when `publishing_started_at IS NOT NULL` (TP-4.6)
- [ ] **T-18.4** Never hold SQLite transaction during Telegram API calls (ARCHITECTURE §8.2)
- [ ] **T-18.5** Manual Post Now: 3 Telegram attempts, 5s interval; success → `markPosted`; failure → `releasePublishingAfterManualFailure` (TP-4.7)
- [ ] **T-18.6** Scheduled publish: 3 attempts, 2 min interval; success → `markPosted`; failure → `markScheduledPublishFailed` (TP-5.7)
- [ ] **T-18.7** Publish all types correctly (TP-4.2 text, TP-4.3 poll, TP-4.4 link)
- [ ] **T-18.8** Notify initiating Admin on manual success with t.me link (Req 6.3)

---

## Phase 19 — Stale Publishing Claim Recovery

- [ ] **T-19.1** On every startup, query posts where `publishing_started_at IS NOT NULL` and older than 10 minutes
- [ ] **T-19.2** Do **not** auto-publish recovered posts (TP-5.9)
- [ ] **T-19.3** Clear `publishing_started_at`, keep `pending`/`scheduled` status, set `last_error` (Russian message)
- [ ] **T-19.4** Notify all Admins via private message in Russian
- [ ] **T-19.5** Implement as callable service invoked from `index.ts` **before** scheduler startup and before bot handles publish callbacks
- [ ] **T-19.6** Wire `recoverStalePublishingClaims(10)` into startup sequence (Phase 8)

---

## Phase 20 — Scheduler

- [ ] **T-20.1** Implement `src/services/scheduler.ts` — 30s tick loop + startup recovery within 60s (**depends on Phase 19**)
- [ ] **T-20.2** Due query via `getDueScheduled(now)` — `scheduled_at <= now` and `publishing_started_at IS NULL`; never publish early (TP-5.5)
- [ ] **T-20.3** Exclude posts with active publish claims from due processing — scheduler must not pick up posts where `publishing_started_at IS NOT NULL`
- [ ] **T-20.4** Decision rules for due unclaimed posts: missed ≤60 min → publish; missed >60 min → `missed` + notify (TP-5.6)
- [ ] **T-20.5** Dispatch `publishScheduled` asynchronously per due post — do not block tick loop on 2-min retry cycles (ARCHITECTURE §8.5)
- [ ] **T-20.6** Startup scheduled recovery runs **after** stale claim recovery (Phase 19), within 60s of boot
- [ ] **T-20.7** Notify all Admins in Russian on `missed` and scheduled `failed` outcomes

---

## Phase 21 — Backup Service

- [ ] **T-21.1** Implement `src/services/backup.ts`
- [ ] **T-21.2** Run `PRAGMA wal_checkpoint(FULL)` before copy
- [ ] **T-21.3** Copy main `.db` file only to `BACKUP_DIR` (not `-wal`/`-shm` sidecars)
- [ ] **T-21.4** Filename pattern `content_bot_{ISO-timestamp}.db`; return size for Admin confirmation
- [ ] **T-21.5** On checkpoint/copy failure — error to Admin + log; no silent partial backup

---

## Phase 22 — Automated Tests (Test Plan Mapping)

### P0 — Unit tests

- [ ] **T-22.1** `config.ts` — TP-1.2 missing token, TP-1.3 invalid admin IDs
- [ ] **T-22.2** `schedule-parser.ts` — TP-5.1–TP-5.4 (formats, year default, past reject, ISO reject)
- [ ] **T-22.3** Status transition validation in repository
- [ ] **T-22.4** `claimPublishing` — success, reject when claim held, reject when already posted (TP-4.5, TP-4.6)
- [ ] **T-22.5** `logger.ts` — secret redaction (TP-8.1)
- [ ] **T-22.6** URL-only detection and `link` type assignment (TP-3.2, TP-3.3)
- [ ] **T-22.7** `/poll` parser validation (TP-3.6, TP-3.7)

### P0 — Integration tests

- [ ] **T-22.8** `PostRepository.getDueScheduled(now)` — excludes future posts (TP-5.5) **and** posts with `publishing_started_at IS NOT NULL`
- [ ] **T-22.8a** Scheduler integration — due post with active claim is not dispatched until claim cleared
- [ ] **T-22.9** `releasePublishingAfterManualFailure` — status restored, `last_error` set, claim cleared (TP-4.7)
- [ ] **T-22.10** `markScheduledPublishFailed` — status `failed`, claim cleared (TP-5.7)
- [ ] **T-22.11** `recoverStalePublishingClaims` — no status change to posted, claim cleared, `last_error` set (TP-5.9)
- [ ] **T-22.12** `PublisherService` with mocked Telegram — concurrent publish simulation (TP-4.6)
- [ ] **T-22.13** Queue warning logic — count > 50 (TP-4.9, TP-4.10)
- [ ] **T-22.14** `/find` not in registered command list (TP-6.6)
- [ ] **T-22.15** AI disabled — no AI commands registered; Moderation_Card keyboard has no Rewrite button; no background eval on create (TP-1.4)
- [ ] **T-22.16** AI enabled — AI commands registered; Rewrite button present; background eval invoked on create

### P1 — Manual / E2E (see Phase 23)

- [ ] **T-22.17** Document how to run unit/integration tests in README

---

## Phase 23 — Manual Smoke Test Checklist

Run against a real test bot + test channel with Docker. Check each item before considering v1 done.

### Startup and infrastructure

- [ ] **SM-1** `docker compose up --build` succeeds with valid `.env` (TP-1.1)
- [ ] **SM-2** Missing `CONTENT_BOT_TOKEN` → container exits non-zero, no secret in logs (TP-1.2)
- [ ] **SM-3** Bot starts without `OPENAI_API_KEY`; no AI commands in `/help`; no ♻️ Rewrite on Moderation_Card (TP-1.4)
- [ ] **SM-4** `docker compose restart` — data persists in volume (TP-1.5)
- [ ] **SM-5** Logs are JSON on stdout; no tokens visible (TP-8.1)
- [ ] **SM-6** No inbound ports listening (TP-8.2)

### Authorization

- [ ] **SM-7** Non-admin `/start` → `Доступ запрещён` (TP-2.1)
- [ ] **SM-8** Non-admin inline button → callback `Доступ запрещён` (TP-2.2)
- [ ] **SM-9** Admin `/start` → Russian welcome with command list (TP-2.3)

### Content input

- [ ] **SM-10** Send plain text → `text` Candidate confirmed (TP-3.1)
- [ ] **SM-11** Send URL-only → `link` Candidate (TP-3.2)
- [ ] **SM-12** Send invalid URL-only → error, no Candidate (TP-3.3)
- [ ] **SM-13** Send photo with caption (TP-3.4)
- [ ] **SM-14** Send sticker → unsupported type error (TP-3.5)
- [ ] **SM-15** `/poll Q | A | B` → poll Candidate (TP-3.6)
- [ ] **SM-16** `/poll` with one option → format error (TP-3.7)

### Moderation and publishing

- [ ] **SM-17** `/queue` shows Moderation_Card with buttons; **no Rewrite button when AI key absent** (TP-4.1, TP-1.4)
- [ ] **SM-18** Post Now text → channel post + link (TP-4.2)
- [ ] **SM-19** Post Now poll → `sendPoll` in channel (TP-4.3)
- [ ] **SM-20** Post Now link → URL in channel (TP-4.4)
- [ ] **SM-21** Post Now on already posted → rejected (TP-4.5)
- [ ] **SM-22** Skip and Delete advance queue (TP-4.8)
- [ ] **SM-23** Queue warning visible when pending > 50 (TP-4.9)

### Scheduling

- [ ] **SM-24** Schedule with `DD.MM.YYYY HH:mm` → confirmed, status `scheduled` (TP-5.1)
- [ ] **SM-25** Schedule with `DD.MM HH:mm` → current year applied (TP-5.2)
- [ ] **SM-26** Past datetime rejected (TP-5.3)
- [ ] **SM-27** ISO format rejected (TP-5.4)
- [ ] **SM-28** Post publishes only after `scheduled_at`, not before (TP-5.5)
- [ ] **SM-29** Manually set old scheduled post (>60 min) → `missed` + notification (TP-5.6)

- [ ] **SM-29a** Due scheduled post with active `publishing_started_at` is not picked up by scheduler tick until claim cleared

### Commands

- [ ] **SM-30** `/stats`, `/scheduled`, `/posted` work (TP-6.1–6.3)
- [ ] **SM-31** `/testpost` reaches channel (TP-6.4)
- [ ] **SM-32** `/backup` creates restorable file in backup dir (TP-6.5)
- [ ] **SM-33** `/find` not listed in `/help` (TP-6.6)

### AI (if `OPENAI_API_KEY` set)

- [ ] **SM-34** ♻️ Rewrite shows 3 variants; pick updates caption (TP-7.1)
- [ ] **SM-35** New Candidate gets AI risk score when available (TP-7.4)
- [ ] **SM-36** AI timeout shows error; caption unchanged (TP-7.3)

### Recovery

- [ ] **SM-37** Kill bot mid-publish (claim set) → restart after 10+ min → claim cleared, Admins notified, no auto-publish (TP-5.9)
- [ ] **SM-38** Scheduled posts due during downtime publish within 60s of restart (TP-1.5)

---

## Implementation Order Summary

Phases **1–23** are numbered in implementation order. Key dependencies:

| Phase | Depends on |
|-------|------------|
| 1 — Project Setup | — |
| 2 — TypeScript Configuration | 1 |
| 3 — Environment Configuration | 1 |
| 4 — Logger | 1 |
| 5 — SQLite Schema and Repository | 3, 4 |
| 6 — Docker and Deployment | 1, 2 |
| 7 — Telegram Client Utilities | 3, 5 |
| 8 — Bot Initialization | 3–7 |
| 9 — Auth Middleware | 8 |
| 10 — Russian Messages | 1 |
| 11 — Session Store | 8 |
| 12 — Optional AI Module | 3, 10 |
| 13 — Command Handlers | 8–12 |
| 14 — Poll Command | 13 |
| 15 — Manual Content Input | 5, 10–12 |
| 16 — Moderation Cards and Callbacks | 5, 10–12 |
| 17 — Schedule Parser and Scheduling UI | 10–11, 16 |
| 18 — Publisher Service | 5, 7 |
| 19 — Stale Publishing Claim Recovery | 5, 18 |
| 20 — Scheduler | 18, **19** |
| 21 — Backup Service | 5 |
| 22 — Automated Tests | 3–21 |
| 23 — Manual Smoke Test Checklist | 1–22 |

**Note:** Stale claim recovery (Phase 19) MUST be complete before scheduler startup logic (Phase 20).

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-28 | Initial task breakdown for v1 implementation |
| 1.1 | 2026-06-28 | AI enablement rules; publisher/stale-recovery/scheduler reorder; getDueScheduled excludes active claims |
| 1.2 | 2026-06-28 | Optional AI Module moved before Command Handlers (phase numbers not yet renumbered) |
| 1.3 | 2026-06-28 | Full renumber: Optional AI Module → Phase 12; Phases 12–20 shifted to 13–21; task IDs updated |
