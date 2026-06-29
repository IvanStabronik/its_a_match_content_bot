# Manual Content Publisher Bot — Architecture

**Version:** 2.0  
**Aligns with:** [REQUIREMENTS.md](./REQUIREMENTS.md) v2.0

---

## 1. Overview

Standalone Telegram bot for [@itsamatchchannel](https://t.me/itsamatchchannel). Admins send content manually; the bot stores candidates, shows a moderation queue, optionally edits text via OpenAI, and publishes or schedules posts.

**No discovery layer. No background fetchers. No daily pack schedulers.**

### 1.1 Stack

| Layer | Choice |
|-------|--------|
| Runtime | Node.js 20 |
| Language | TypeScript |
| Telegram | grammY, long polling |
| Database | SQLite (`better-sqlite3`) |
| AI (optional) | OpenAI SDK — caption editing only |
| Deploy | Docker multi-stage + Compose |

### 1.2 Principles

1. **Single process** — bot + post scheduler in one Node process  
2. **Env-only config** — eight variables max (see REQUIREMENTS §3)  
3. **Manual approval** — every channel post requires admin action  
4. **Fail fast at startup** — missing env or Telegram unreachable → exit  
5. **Russian UI** — user strings in `src/bot/messages.ts`  
6. **Minimal surface** — no HTTP server, no webhook, no external integrations except optional OpenAI  

---

## 2. Component Diagram

```mermaid
flowchart TB
    subgraph External
        TG[Telegram API]
        OAI[OpenAI optional]
        CH[@itsamatchchannel]
    end

    subgraph Container["Docker: content-bot"]
        ENTRY[index.ts]
        CFG[config.ts]

        subgraph Bot["bot/"]
            AUTH[auth middleware]
            CMD[commands.ts]
            CONTENT[content.ts]
            MOD[moderation.ts]
            CB[callbacks.ts]
            SESS[session.ts]
            KB[keyboards.ts]
        end

        subgraph Services["services/"]
            POSTS[PostRepository]
            PUB[PublisherService]
            SCHED[SchedulerService]
            FILT[content-filter]
            TGWR[telegram.ts]
            BAK[backup.ts]
        end

        AI[ai/module.ts optional]
        DB[(SQLite)]
    end

    ENTRY --> CFG --> Bot
    ENTRY --> SCHED
    Bot --> Services
    CB --> AI
    AI -.-> OAI
    PUB --> TGWR --> TG
    PUB --> CH
    POSTS --> DB
    SCHED --> PUB
```

---

## 3. Directory Layout

```
src/
├── index.ts                 # Entry point
├── config.ts                # AppConfig (8 env vars)
├── logger.ts
├── types.ts                 # Post, SessionState, statuses
│
├── db/
│   ├── connection.ts
│   ├── schema.ts            # Migrations (legacy tables kept)
│   └── migrations.ts
│
├── bot/
│   ├── index.ts             # createBot(), startBot()
│   ├── session.ts           # In-memory admin sessions
│   ├── keyboards.ts         # Queue card + inline keyboards
│   ├── messages.ts          # Russian strings, command list
│   ├── moderation-card.ts
│   ├── middleware/auth.ts
│   └── handlers/
│       ├── commands.ts      # /start … /ai_edit
│       ├── content.ts       # Intake + caption/schedule sessions
│       ├── moderation.ts    # /queue pagination
│       ├── callbacks.ts     # Publish, schedule, AI actions
│       └── poll.ts
│
├── services/
│   ├── posts.ts             # PostRepository
│   ├── publisher.ts         # Claim + publish + retries
│   ├── scheduler.ts         # Scheduled post tick
│   ├── schedule-parser.ts
│   ├── content-filter.ts    # URL extract, forbidden keywords
│   ├── publish-content.ts   # Link caption+URL formatting
│   ├── telegram.ts          # sendByType, verify connection
│   ├── backup.ts
│   └── stale-recovery.ts
│
└── ai/
    └── module.ts            # rewrite, shorten, livelier, proofread, editWithInstruction
```

**Removed modules (v2.0):** `src/discovery/`, daily-pack services, source handlers, discovery/daily schedulers, URL crawler, pack diagnostics.

---

## 4. Startup Sequence

```
loadConfig()
  → openDatabase() + initSchema()
  → createAiModule() | null
  → new PostRepository, PublisherService, SchedulerService
  → register handlers (commands, queue, content, callbacks)
  → verifyTelegramConnection(30s)
  → recoverStaleClaimsOnStartup()
  → scheduler.start(bot)
  → bot.start() long polling
```

Only **SchedulerService** runs periodic work (due scheduled posts). No discovery or daily-pack timers.

---

## 5. Session States

| State | Purpose |
|-------|---------|
| `idle` | Default |
| `schedule` | Awaiting datetime for post ID |
| `edit_caption` | Awaiting manual caption text |
| `waiting_for_caption` | Media without caption |
| `rewrite_select` | AI variant picker |
| `ai_preview` | Shorten/livelier/proofread/custom preview before apply |

Stored in-memory per admin ID (`bot/session.ts`). Lost on restart (acceptable).

---

## 6. Publish Flow

```
Admin presses ✅ Опубликовать
  → PublisherService.publishManual()
  → PostRepository.claimPublishing()  // sets publishing_started_at
  → sendByType() up to 3 retries
  → markPosted() or releasePublishingAfterManualFailure()
  → admin notification (failure here does NOT re-send to channel)
```

**sendByType mapping:**

| type | API |
|------|-----|
| text | sendMessage(caption \|\| raw_text) |
| link | sendMessage(buildLinkPublishText) |
| photo | sendPhoto(file_id, caption) |
| video | sendVideo(file_id, caption, supports_streaming: true) |
| animation | sendAnimation(file_id, caption) |
| poll | sendPoll(question, options) |

---

## 7. Content Intake Flow

```
message event (non-command)
  → if session: schedule | edit_caption | waiting_for_caption
  → else handleIncomingContent()
       forward → extractForwardedContent + forward warning
       photo/video/animation → file_id + optional caption session
       text → link extract OR text candidate
  → checkForbiddenContent() → warnings JSON
  → PostRepository.create()
```

Link extraction (`content-filter.extractLinkFromText`) does **not** perform HTTP requests.

---

## 8. Database

- **Active table:** `posts`
- **Legacy tables:** may exist from migrations v2–v5 (`sources`, `content_packs`, …) — unused by v2.0 code
- **WAL mode**, foreign keys, busy timeout
- **Indexes:** status, scheduled_at, pending created_at, publishing_started_at

See REQUIREMENTS §11 for active column set.

---

## 9. AI Integration

`AiModule` methods (all return edited text, never publish):

| Method | Trigger |
|--------|---------|
| `rewriteCaption` | ✨ AI-варианты |
| `shortenCaption` | ✂️ Сократить |
| `makeLivelier` | 🎭 Сделать живее |
| `proofreadCaption` | 🧹 Исправить ошибки |
| `editWithInstruction` | `/ai_edit` |

Model: `gpt-4o-mini`, JSON response format, 30s timeout.

When `OPENAI_API_KEY` is null → `createAiModule()` returns null; AI buttons and `/ai_edit` not registered.

---

## 10. Docker

```yaml
services:
  content-bot:
    build: .
    restart: unless-stopped
    env_file: .env
    volumes:
      - content-bot-data:/app/data
```

- No exposed ports  
- `DATABASE_PATH=/app/data/content_bot.db` in compose  

---

## 11. Testing

Vitest in `tests/`:

- `manual-publisher.test.ts` — commands, intake, AI, wiring
- `publisher.test.ts` — duplicate publish safety
- `scheduler.test.ts` — due post dispatch
- `backup.test.ts`, `posts.test.ts`, `schedule-parser.test.ts`, …

Run: `npm test`

---

## 12. Security

- Admin gate on all handlers  
- Secrets never logged  
- No inbound network listeners  
- Forwarded content warning for rights review  

---

## 13. Revision History

| Version | Change |
|---------|--------|
| 1.x | Discovery, daily packs, multiple schedulers |
| 2.0 | Manual publisher only; single scheduler; AI edit-only |
