# Manual Content Publisher Bot — Requirements

**Version:** 2.0 (Manual Publisher)  
**Status:** Current product direction  
**Bot:** [@itsamatch_content_bot](https://t.me/itsamatch_content_bot)  
**Channel:** [@itsamatchchannel](https://t.me/itsamatchchannel)

This document defines functional and non-functional requirements for the **Manual Content Publisher Bot** — a minimal Telegram bot for admin-only manual content intake, moderation, optional AI text editing, scheduling, and publishing.

**User-facing bot messages:** Russian.  
**Technical documentation:** English (this file, ARCHITECTURE.md, README.md).  
**End-user guide:** Russian PDF — `docs/RUKOVODSTVO-POLZOVATELYA.pdf`.

---

## 1. Product Scope

### 1.1 In scope

| Area | Description |
|------|-------------|
| Manual intake | Text, link, photo, video, GIF, poll, forwarded posts |
| Queue | `/queue` moderation cards with pagination |
| Editing | Manual caption edit; optional OpenAI text editing only |
| Publishing | Manual approval required; duplicate publish protection |
| Scheduling | Per-post schedule; scheduler tick |
| Storage | SQLite, Docker volume, `/backup` |
| Access | Admin-only (`ADMIN_TELEGRAM_IDS`) |
| Transport | Long polling only |

### 1.2 Explicitly out of scope

The following MUST NOT be implemented, wired, or exposed in `/help`:

- Automatic content discovery (YouTube, RSS, Reddit, Pikabu, public feeds)
- Daily content packs (`/today`, `/schedule_day`, etc.)
- Source management commands (`/sources`, `/source_add`, …)
- URL crawling / page metadata fetching
- Background internet calls for content collection
- Web admin, webhook mode, HTTP server
- Auto-publish without admin action
- AI content invention (polls, ideas, CTA generation from scratch)
- AI scoring/classification on candidate creation

Legacy DB tables from older migrations MAY remain for compatibility but MUST NOT be used by active bot code.

---

## 2. Glossary

| Term | Definition |
|------|------------|
| **Content_Bot** | Telegram bot @itsamatch_content_bot |
| **Admin** | User whose Telegram ID is in `ADMIN_TELEGRAM_IDS` (1–2 IDs) |
| **Channel** | Target channel @itsamatchchannel |
| **Candidate** | Content unit stored in `posts` awaiting review |
| **Moderation_Card** | Queue UI card with metadata and inline buttons |
| **Queue** | Candidates with status `pending` |
| **Scheduler** | Component publishing due `scheduled` posts |
| **AI_Module** | Optional OpenAI integration for **text editing only** |

---

## 3. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONTENT_BOT_TOKEN` | Yes | — | Bot token from @BotFather |
| `ADMIN_TELEGRAM_IDS` | Yes | — | 1–2 comma-separated numeric admin IDs |
| `CHANNEL_USERNAME` | Yes | — | Channel username without `@` |
| `DATABASE_PATH` | No | `./data/content_bot.db` | SQLite file path |
| `BACKUP_DIR` | No | `./data/backups` | Backup output directory |
| `TIMEZONE` | No | `Europe/Warsaw` | IANA timezone for scheduling |
| `OPENAI_API_KEY` | No | — | Enables AI editing features |
| `MAIN_BOT_USERNAME` | No | — | Reserved; not used for content generation |

Missing required variables → non-zero exit with log naming the variable (no secret values in logs).

---

## 4. Authorization

| ID | Requirement |
|----|-------------|
| AUTH-1 | Only Admins may use commands, messages, and callbacks |
| AUTH-2 | Unauthorized users receive **«Доступ запрещён»** |
| AUTH-3 | Unauthorized callbacks are answered without side effects |

---

## 5. Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome + command list |
| `/help` | Command reference |
| `/queue` | Moderation queue (primary screen) |
| `/add <text>` | Create text candidate (1–4096 chars) |
| `/poll Q \| A \| B` | Create poll candidate (2–10 options) |
| `/scheduled` | Up to 10 scheduled posts |
| `/posted` | Up to 10 recently published posts |
| `/stats` | Statistics by status |
| `/testpost` | Send test message to channel |
| `/backup` | SQLite backup |
| `/skip_caption` | Leave caption empty for pending media session |
| `/ai_edit <id> <instruction>` | AI edit with preview/apply (if OpenAI enabled) |

No other commands SHALL appear in `/help`.

---

## 6. Manual Content Intake

| ID | Requirement |
|----|-------------|
| IN-1 | **Text message** → type `text`, `raw_text` and `caption` = message text |
| IN-2 | **URL-only or mostly-URL message** → type `link`, `source_url` = URL, optional `caption` from surrounding text; **no HTTP fetch** |
| IN-3 | **Photo** → type `photo`, `media_file_id`; if no caption → pending caption session |
| IN-4 | **Video** → type `video`, `media_file_id`; publish with `supports_streaming=true` |
| IN-5 | **Animation/GIF** → type `animation`, `media_file_id`; pending caption if missing |
| IN-6 | **Forwarded post** → preserve Telegram-provided content; add forward warning |
| IN-7 | **Unsupported types** (sticker, voice, document, etc.) → error listing supported types |
| IN-8 | Forbidden keyword categories → warning on card; admin decides |

### 6.1 Pending caption workflow

When photo/video/GIF arrives without caption:

1. Create candidate with empty caption
2. Set session `waiting_for_caption` for that post ID
3. Reply: «Добавьте подпись к кандидату #ID или отправьте /skip_caption»
4. Next plain text → updates caption (not a new candidate)
5. `/skip_caption` → clears session, caption stays empty

---

## 7. Moderation Queue

### 7.1 Moderation card fields

ID, type (text/link/photo/video/GIF/poll), status, caption/text preview, URL (if link), warnings, scheduled time (if any), `last_error` (if any).

Discovery/source/daily-pack metadata MUST NOT be shown.

### 7.2 Inline buttons

| Button | Action |
|--------|--------|
| ✅ Опубликовать | Publish now (manual claim) |
| 🕒 Запланировать | Enter schedule datetime |
| 📝 Изменить текст | Admin sends new caption |
| ✨ AI-варианты | 3 variants (OpenAI only) |
| ✂️ Сократить | Shorten with apply preview |
| 🎭 Сделать живее | Engaging rewrite with apply |
| 🧹 Исправить ошибки | Proofread with apply |
| ❌ Пропустить | Status → `skipped` |
| 🗑 Удалить | Status → `deleted` |
| ⬅️ / ➡️ | Queue pagination |

AI buttons hidden when `OPENAI_API_KEY` absent.

Selecting an AI variant or applying preview updates caption/text **only** — never publishes.

---

## 8. AI Module (Optional, Editing Only)

| ID | Requirement |
|----|-------------|
| AI-1 | Used only for editing admin-provided or forwarded captions/text |
| AI-2 | Style: Its A Match channel — light, smart, mildly meme-ish, Russian |
| AI-3 | No politics, religion, NSFW, gender humiliation |
| AI-4 | No new facts, no fake claims, no external content search |
| AI-5 | Timeout 30s; on failure show error, keep original text |
| AI-6 | `/ai_edit` edits specified candidate only; preview + apply/cancel |

Removed AI features: `/ai_score`, `/ai_classify`, `/ai_poll`, `/ai_cta`, background scoring, CTA generation.

---

## 9. Publishing

| ID | Requirement |
|----|-------------|
| PUB-1 | Types: text, link, photo, video (`supports_streaming=true`), animation, poll |
| PUB-2 | Link: `caption\n\nURL` if both; URL only or caption only otherwise |
| PUB-3 | Atomic claim via `publishing_started_at`; reject duplicate/in-progress |
| PUB-4 | Success → `posted`, save `telegram_message_id`, `posted_at` |
| PUB-5 | Manual publish failure → restore prior status, set `last_error` |
| PUB-6 | Scheduled failure after retries → status `failed` |
| PUB-7 | Admin notification failure MUST NOT retry channel send |

---

## 10. Scheduling

| ID | Requirement |
|----|-------------|
| SCH-1 | Formats: `DD.MM HH:mm`, `DD.MM.YYYY HH:mm` in `TIMEZONE` |
| SCH-2 | Reject past time, &lt; 5 min ahead, &gt; 30 days |
| SCH-3 | `pending` → `scheduled` with `scheduled_at` |
| SCH-4 | Scheduler publishes due posts; missed window → `missed` (+ admin notify) |
| SCH-5 | No daily schedule packs |

---

## 11. Database

Active code uses `posts` table columns:

`id`, `type`, `status`, `category`, `source_url`, `media_file_id`, `media_url`, `caption`, `raw_text`, `warnings`, `poll_question`, `poll_options_json`, `scheduled_at`, `posted_at`, `telegram_message_id`, `last_error`, `publishing_started_at`, `created_by`, `created_at`, `updated_at`, `deleted_at`

Extra legacy columns MAY exist from migrations but MUST NOT drive active UI.

Statuses: `pending`, `scheduled`, `posted`, `skipped`, `deleted`, `failed`, `missed`.

---

## 12. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Docker + long polling; restart `unless-stopped` |
| NFR-2 | Structured JSON logs to stdout |
| NFR-3 | No inbound HTTP ports |
| NFR-4 | Secrets from env only; `.env` gitignored |
| NFR-5 | Startup Telegram check within 30s |
| NFR-6 | Stale publish claim recovery on startup |

---

## 13. Documentation Deliverables

| Document | Language | Purpose |
|----------|----------|---------|
| README.md | English (+ brief RU ok) | Developer quickstart |
| ARCHITECTURE.md | English | Technical structure |
| REQUIREMENTS.md | English | This file |
| TASKS.md | English | Implementation status |
| docs/RUKOVODSTVO-POLZOVATELYA.pdf | **Russian** | Admin user guide |

All documents MUST describe the **Manual Content Publisher** product consistently. References to discovery, daily packs, and external sources are historical only.

---

## 14. Revision History

| Version | Date | Change |
|---------|------|--------|
| 1.x | 2025–2026 | Initial bot, discovery, daily packs (deprecated) |
| 2.0 | 2026-06 | Simplified to manual publisher; AI editing only |
