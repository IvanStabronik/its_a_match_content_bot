# Its a Match Content Bot

Telegram bot for moderating and publishing content to [@itsamatchchannel](https://t.me/itsamatchchannel).

**v2** adds content discovery from YouTube and RSS. The bot **never auto-posts** — discovered items become `pending` candidates for manual approval via `/queue`.

## Stack

- Node.js 20, TypeScript, grammY
- SQLite (`better-sqlite3`)
- Optional OpenAI (captions, scoring, variants)
- Optional YouTube Data API
- RSS feeds (no API key required)
- Docker Compose + long polling

## Quick start (English)

1. Clone the repository and copy `.env.example` to `.env`.
2. Set `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, and `CHANNEL_USERNAME`.
3. Optional: `YOUTUBE_API_KEY`, `OPENAI_API_KEY` for discovery + AI captions.
4. Run `docker compose up --build` or locally: `npm ci && npm run build && npm start`.
5. Add the bot as a channel admin, then send `/start` from an admin account.

### Content discovery

1. **YouTube** — set `YOUTUBE_API_KEY` in `.env`, then:
   ```
   /source_add youtube_channel @channelhandle My Channel
   /source_add youtube_search dating red flags
   ```
2. **RSS** — works without YouTube key:
   ```
   /source_add rss https://example.com/feed.xml Blog Name
   ```
3. Run discovery manually: `/discover` (or wait for the scheduler — default every 6 hours).
4. Review candidates: `/queue` → approve, schedule, edit caption, or use **AI-варианты**.
5. Publish manually — nothing is posted without admin action.

## Быстрый старт (RU)

1. Скопируйте `.env.example` в `.env`.
2. Укажите `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`.
3. Для YouTube-источников добавьте `YOUTUBE_API_KEY`.
4. Запустите: `docker compose up --build`
5. Добавьте бота админом канала и отправьте `/start`.

### Поиск контента

```
/source_add youtube_channel @handle Имя
/source_add rss https://site.com/rss.xml Имя
/discover
/queue
```

Бот **никогда не публикует** найденный контент автоматически — только после вашего одобрения.

## Discovery commands

| Command | Description |
|---------|-------------|
| `/sources` | List configured sources |
| `/source_add youtube_channel …` | Add YouTube channel |
| `/source_add youtube_search …` | Add YouTube search query |
| `/source_add rss …` | Add RSS feed |
| `/source_pause` / `/source_resume` / `/source_remove` | Manage sources |
| `/source_check <id>` | Check one source now |
| `/discover` | Check all enabled sources |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled bot |
| `npm run dev` | Dev mode with hot reload |
| `npm test` | Run unit/integration tests |

## Environment variables

See `.env.example`. Required: `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`.

Discovery: `YOUTUBE_API_KEY`, `DISCOVERY_ENABLED`, `DISCOVERY_INTERVAL_MINUTES`, `DISCOVERY_MAX_ITEMS_PER_SOURCE`, `DISCOVERY_LOOKBACK_HOURS`, `DISCOVERY_MIN_SCORE`, `DISCOVERY_AUTO_CREATE_CANDIDATES`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [REQUIREMENTS.md](./REQUIREMENTS.md).

## Out of scope

No Reddit scraping, Telegram channel scraping, TikTok/Reels, browser automation, video downloading, webhook, web admin, Redis, or PostgreSQL.
