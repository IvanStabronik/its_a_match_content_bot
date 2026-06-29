# Manual Content Publisher Bot — Implementation Status

**Version:** 2.0  
**Last updated:** 2026-06-29

This file replaces the v1 phased task list. It tracks what is **implemented**, **removed**, and **not planned**.

References: [REQUIREMENTS.md](./REQUIREMENTS.md), [ARCHITECTURE.md](./ARCHITECTURE.md), [README.md](./README.md).

---

## ✅ Implemented (v2.0)

### Core platform

- [x] Node.js 20 + TypeScript + grammY
- [x] SQLite with migrations and persistent Docker volume
- [x] Long polling (no HTTP server)
- [x] Admin-only auth middleware
- [x] Env-only configuration (8 variables)
- [x] Structured JSON logging
- [x] Docker multi-stage build + `docker compose`

### Commands

- [x] `/start`, `/help`, `/queue`, `/add`, `/poll`
- [x] `/scheduled`, `/posted`, `/stats`, `/testpost`, `/backup`
- [x] `/skip_caption`, `/ai_edit` (when OpenAI enabled)

### Manual intake

- [x] Text, link (no fetch), photo, video, GIF, forward
- [x] Pending caption session for media without caption
- [x] Forward warning
- [x] Forbidden keyword warnings

### Moderation queue

- [x] Moderation card (simplified fields)
- [x] Publish, schedule, edit, skip, delete, pagination
- [x] Queue size warning (>50)

### AI (editing only)

- [x] AI-варианты (3 variants)
- [x] Сократить, Сделать живее, Исправить ошибки (preview + apply)
- [x] `/ai_edit` with preview + apply

### Publishing & scheduling

- [x] Duplicate publish protection (`publishing_started_at`)
- [x] Video `supports_streaming=true`
- [x] Link caption + URL formatting
- [x] Schedule parser (DD.MM formats, timezone, 5 min / 30 day rules)
- [x] Scheduler for due posts + missed handling
- [x] Stale claim recovery on startup
- [x] Admin notify failure does not retry channel send

### Operations

- [x] `/backup` with WAL checkpoint
- [x] Test suite (42 tests)

### Documentation

- [x] README.md (Manual Content Publisher)
- [x] REQUIREMENTS.md v2.0
- [x] ARCHITECTURE.md v2.0
- [x] Russian user guide PDF

---

## 🗑 Removed (deprecated, do not reintroduce without new requirements)

| Feature | Removed in |
|---------|------------|
| YouTube / RSS / Reddit / Pikabu discovery | v2.0 |
| `/sources`, `/discover`, `/source_add*` | v2.0 |
| Daily content pack (`/today`, `/schedule_day`, …) | v2.0 |
| Discovery scheduler | v2.0 |
| Daily pack scheduler | v2.0 |
| URL metadata crawler | v2.0 |
| Background AI scoring on create | v2.0 |
| `/ai_score`, `/ai_classify`, `/ai_poll`, `/ai_cta` | v2.0 |
| `/caption` command | v2.0 (replaced by caption session + edit) |
| `rss-parser` dependency | v2.0 |
| `reconnect` CLI | v2.0 |

Legacy DB tables from old migrations remain on disk but are **not used** by active code.

---

## ⏸ Not planned

- Web admin panel
- Webhook mode
- Media albums / groups
- Automatic content discovery
- Multi-channel publishing
- PostgreSQL / Redis
- Public API

---

## Verification checklist (release)

```bash
npm run build
npm test
docker compose build --no-cache
docker compose up -d
docker compose logs --tail 20   # expect: Scheduler started, NO discovery-scheduler
```

Telegram smoke test:

1. `/help` — only final command list
2. Send text → appears in `/queue`
3. Send photo without caption → caption prompt + `/skip_caption`
4. Publish or schedule from queue card

---

## Maintenance notes

- When changing commands, update: `messages.ts`, `REQUIREMENTS.md`, user PDF
- When changing publish logic, update: `publisher.test.ts`, ARCHITECTURE §6
- Do not add env vars without updating `.env.example`, `config.ts`, REQUIREMENTS §3
