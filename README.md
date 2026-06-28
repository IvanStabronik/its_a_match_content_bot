# Its a Match Content Bot

Telegram bot for moderating and publishing content to [@itsamatchchannel](https://t.me/itsamatchchannel).

## Stack

- Node.js 20, TypeScript, grammY
- SQLite (`better-sqlite3`)
- Optional OpenAI
- Docker Compose

## Quick start (English)

1. Clone the repository and copy `.env.example` to `.env`.
2. Set `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, and `CHANNEL_USERNAME`.
3. Run `docker compose up --build` or locally: `npm ci && npm run build && npm start`.
4. Send `/start` to the bot from an admin account.

## Быстрый старт (RU)

1. Скопируйте `.env.example` в `.env`.
2. Укажите `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`.
3. Запустите: `docker compose up --build`
4. Отправьте боту `/start` с аккаунта админа.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled bot |
| `npm run dev` | Dev mode with hot reload |
| `npm test` | Run unit/integration tests |

## Environment variables

See `.env.example` for all variables. Required: `CONTENT_BOT_TOKEN`, `ADMIN_TELEGRAM_IDS`, `CHANNEL_USERNAME`.

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) and [REQUIREMENTS.md](./REQUIREMENTS.md).

## Out of scope (v1)

No `/find`, external sources, webhook, web admin, or main bot API integration.
