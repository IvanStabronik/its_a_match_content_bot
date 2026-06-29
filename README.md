# Its a Match Content Bot

Telegram bot for moderating and publishing content to [@itsamatchchannel](https://t.me/itsamatchchannel).

**v4** adds a **daily content pack** workflow: every morning the bot prepares a curated pack (videos, memes, articles, polls, text ideas) and notifies admins. Review via `/today`, select items, and schedule across the day. **Nothing is auto-published.**

**v3** adds a Russian-first content quality layer: YouTube Shorts links, RSS article summaries, Reddit meme candidates, language filtering, and quality scoring.

## Stack

- Node.js 20, TypeScript, grammY
- SQLite (`better-sqlite3`)
- Optional OpenAI (captions, scoring, variants, Russian adaptation)
- Optional YouTube Data API, Reddit API
- RSS feeds (no API key required)
- Docker Compose + long polling

## YouTube links vs native Telegram video

| Approach | Autoplay in channel | How |
|----------|---------------------|-----|
| **YouTube Shorts / video link** | No inline playback | Bot creates a `link` candidate with URL only — **videos are never downloaded** |
| **Native Telegram video** | Yes (streaming) | Admin uploads video manually, or you use a direct MP4 URL / existing `file_id` |

For autoplay-like behavior in the channel, upload the video to the bot directly or provide a legitimate direct MP4 source. YouTube, TikTok, Reels, and Instagram videos are **not** downloaded or re-uploaded.

## Daily workflow (v4)

1. Configure `.env` (see `DAILY_PACK_*` variables).
2. Run `/setup_sources` once (YouTube Shorts starters; Reddit optional).
3. Every morning (~`DAILY_PACK_TIME`) the bot sends: «Контент-пакет готов».
4. Open `/today` — browse sections (🎬 Видео, 😂 Мемы, 📰 Статьи, 📊 Опросы, 💬 Идеи).
5. Select posts, edit captions, use AI variants.
6. `/schedule_day` or **🗓 Запланировать выбранное** — preview slots, confirm manually.

The bot **never auto-publishes**. YouTube links do not autoplay in the channel — upload native video manually for autoplay-like behavior. Polls and text ideas can be AI-generated when real sources are insufficient.

## Quick start (English)

1. Clone the repository and copy `.env.example` to `.env`.
2. Set `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, and `CHANNEL_USERNAME`.
3. Optional: `YOUTUBE_API_KEY`, `OPENAI_API_KEY`, `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.
4. Run `docker compose up --build` or locally: `npm ci && npm run build && npm start`.
5. Add the bot as a channel admin, then send `/start` from an admin account.

### Recommended Russian-first source strategy

1. **YouTube Shorts search** (links only, RU targeting):
   ```
   /source_add youtube_short_search красные флаги в отношениях
   /source_add youtube_short_search первое свидание
   ```
2. **RSS articles** (Russian summaries with AI when enabled):
   ```
   /source_add rss_article https://your-feed.example/rss.xml Blog Name
   ```
3. **Reddit memes/ideas** (official API, no scraping):
   ```
   /source_add reddit_subreddit relationshipmemes
   ```
4. Run `/source_presets` for ready-to-copy examples.
5. Discover: `/discover` → review: `/queue` → approve manually.

## Быстрый старт (RU)

1. Скопируйте `.env.example` в `.env`.
2. Укажите `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`.
3. Для YouTube Shorts: `YOUTUBE_API_KEY`. Для Reddit: `REDDIT_CLIENT_ID` и `REDDIT_CLIENT_SECRET`.
4. Запустите: `docker compose up --build`
5. Добавьте бота админом канала и отправьте `/start`.

### Поиск контента

```
/source_presets
/source_add youtube_short_search токсичные отношения
/source_add rss_article https://site.com/rss.xml Имя
/discover
/queue
```

Бот **никогда не публикует** найденный контент автоматически — только после вашего одобрения в `/queue`.

## Discovery commands

| Command | Description |
|---------|-------------|
| `/sources` | List configured sources |
| `/source_add youtube_channel …` | Add YouTube channel (long videos as links) |
| `/source_add youtube_search …` | Add YouTube search query |
| `/source_add youtube_short_search …` | Add YouTube Shorts search (RU, short duration) |
| `/source_add rss …` | Add RSS feed (legacy) |
| `/source_add rss_article …` | Add RSS feed for article summaries |
| `/source_add reddit_subreddit …` | Add Reddit subreddit (memes/ideas) |
| `/source_presets` | Recommended source commands |
| `/source_pause` / `/source_resume` / `/source_remove` | Manage sources |
| `/source_check <id>` | Check one source now |
| `/discover` | Check all enabled sources |
| `/caption <id> <brief>` | Regenerate caption from admin note |

## Queue moderation

Each candidate shows format, language, duration (for video), source, quality score, and risk. Buttons include **🇷🇺 Адаптировать на русский**, **🧠 Сделать текст-пост**, and **✨ AI-варианты** (when OpenAI is enabled). Nothing publishes without **✅ Опубликовать**.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled bot |
| `npm run dev` | Dev mode with hot reload |
| `npm test` | Run unit/integration tests |

## Environment variables

See `.env.example`. Required: `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`.

Discovery: `YOUTUBE_API_KEY`, `DISCOVERY_*`, `YOUTUBE_REGION_CODE`, `YOUTUBE_RELEVANCE_LANGUAGE`, `DISCOVERY_ALLOWED_LANGUAGES`, `DISCOVERY_MIN_QUALITY_SCORE`.

Reddit: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_ALLOWED_SUBREDDITS`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [REQUIREMENTS.md](./REQUIREMENTS.md).

## Out of scope

No browser automation, TikTok/Reels/Instagram scraping, YouTube video downloading, webhook, web admin, Redis, PostgreSQL, or n8n. Reddit and YouTube use official APIs only.
