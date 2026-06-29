# Manual Content Publisher Bot

Telegram bot for manually moderating and publishing content to [@itsamatchchannel](https://t.me/itsamatchchannel).

Send or forward content to the bot, review it in `/queue`, edit captions manually or with AI, then publish immediately or schedule for later.

**No automatic internet discovery. No Reddit/YouTube/RSS. No daily content packs.**

## Workflow

1. Send or forward content to the bot in private chat.
2. The bot saves it as a candidate in the queue.
3. Open `/queue`.
4. Edit text manually or with AI (optional).
5. Publish now or schedule.

## Supported content

| Type | How to add |
|------|------------|
| Text | Send a text message or `/add <text>` |
| Link | Send a URL (optional caption text around the URL) — **no page fetching** |
| Photo | Send a photo (caption optional; bot asks if missing) |
| Video | Send a video — published with `supports_streaming=true` |
| GIF | Send an animation |
| Poll | `/poll Question \| Opt1 \| Opt2` |
| Forwarded post | Forward from another chat — bot preserves media/text |

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Short menu |
| `/help` | Help |
| `/queue` | Moderation queue |
| `/add <text>` | Add text candidate |
| `/poll Question \| Opt1 \| Opt2` | Create poll |
| `/scheduled` | Scheduled posts |
| `/posted` | Recently published |
| `/stats` | Statistics |
| `/testpost` | Test channel post |
| `/backup` | Database backup |
| `/skip_caption` | Leave caption empty for pending media |
| `/ai_edit <id> <instruction>` | AI edit (requires OpenAI) |

## AI text editing (optional)

Set `OPENAI_API_KEY` to enable:

- **AI-варианты** — 3 caption variants (Russian, Its A Match style)
- **Сократить** — shorter Telegram-friendly text
- **Сделать живее** — more engaging rewrite (same meaning)
- **Исправить ошибки** — grammar/typos fix
- **`/ai_edit`** — custom instruction for a specific candidate

OpenAI is used **only** for editing text/captions you already provided. It does not search the web or invent external content.

## Stack

- Node.js 20, TypeScript, grammY
- SQLite (`better-sqlite3`)
- Docker Compose + long polling
- Admin-only access, manual approval required

## Environment

Copy `.env.example` to `.env`:

```env
CONTENT_BOT_TOKEN=...
ADMIN_TELEGRAM_IDS=123456789
CHANNEL_USERNAME=itsamatchchannel
OPENAI_API_KEY=          # optional
MAIN_BOT_USERNAME=       # optional
DATABASE_PATH=./data/content_bot.db
BACKUP_DIR=./data/backups
TIMEZONE=Europe/Warsaw
```

## Quick start

```bash
cp .env.example .env
# edit .env with your tokens

docker compose up --build
# or locally:
npm ci && npm run build && npm start
```

1. Add the bot as an admin of your channel.
2. Send `/start` from an admin account.
3. Forward or send content, then open `/queue`.

## Scheduling

From the queue card, tap **Запланировать** and enter:

- `DD.MM HH:mm`
- `DD.MM.YYYY HH:mm`

Rules: not in the past, at least 5 minutes ahead, max 30 days.

## Safety

- Duplicate publish protection (`publishing_started_at` claim)
- Admin notification failure does not retry channel send
- Forbidden content keyword warnings
- Forwarded posts get a rights/source reminder

## Development

```bash
npm run build
npm test
docker compose build --no-cache
```

## Documentation

| Document | Language | Audience |
|----------|----------|----------|
| [REQUIREMENTS.md](./REQUIREMENTS.md) | English | Product requirements (v2.0) |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | English | Technical architecture |
| [TASKS.md](./TASKS.md) | English | Implementation status |
| [docs/RUKOVODSTVO-POLZOVATELYA.pdf](./docs/RUKOVODSTVO-POLZOVATELYA.pdf) | **Russian** | Admin user guide (PDF) |
