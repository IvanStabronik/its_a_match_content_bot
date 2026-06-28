# Its a Match Content Bot — Requirements Document

## 1. Introduction

Telegram bot for moderating and publishing content to the public Telegram channel [@itsamatchchannel](https://t.me/itsamatchchannel). The bot helps administrators review, edit, schedule, and publish light-hearted content about relationships and dating. This is a standalone project, not connected to the main Its a Match dating bot.

**Bot handle:** [@itsamatch_content_bot](https://t.me/itsamatch_content_bot)

**Documentation language:** This document is in English. Telegram bot user-facing messages are in Russian.

---

## 2. Glossary

| Term | Definition |
|------|------------|
| **Content_Bot** | Telegram bot @itsamatch_content_bot that performs content moderation and publishing |
| **Admin** | Authorized Telegram user whose ID is listed in the `ADMIN_TELEGRAM_IDS` environment variable |
| **Channel** | Public Telegram channel @itsamatchchannel, the target channel for content publication |
| **Candidate** | A unit of content (text, photo, video, GIF, poll, link) stored in the database and awaiting review |
| **Moderation_Card** | Content card shown to an Admin with metadata and inline action buttons |
| **Queue** | Queue of Candidates with `pending` status awaiting Admin review |
| **Scheduler** | Component responsible for publishing content at scheduled times |
| **AI_Module** | Optional module based on OpenAI API for content generation, scoring, and classification |
| **SQLite_Database** | Local SQLite database storing all bot data |
| **Docker_Container** | Docker container in which Content_Bot runs |
| **Source_Adapter** | Module for fetching content from external sources (RSS, YouTube, Reddit, Telegram) — **Phase 2 only; not present in v1** |
| **Risk_Score** | Score from 1 to 10 reflecting the likelihood of content policy violation |
| **AI_Score** | Score from 1 to 10 reflecting content quality and relevance for the Channel |
| **last_error** | Text field storing the most recent publication error for a Candidate |

---

## 3. User Roles

### 3.1 Admin

- Authorized user with a Telegram ID from `ADMIN_TELEGRAM_IDS`
- Maximum 1–2 administrators (`ADMIN_TELEGRAM_IDS` must contain 1 to 2 IDs)
- Full access to all v1 bot commands and features

### 3.2 Unauthorized_User

- Any Telegram user whose ID is not in `ADMIN_TELEGRAM_IDS`
- No access to bot functionality
- Receives the response: **"Доступ запрещён"** (Access denied) for messages and callback queries

---

## 4. Functional Requirements

### Requirement 1: Bot Startup and Configuration

**User Story:** As an Admin, I want to run the bot locally in Docker on Windows so that it operates 24/7 without complex server setup.

| ID | Acceptance Criteria |
|----|---------------------|
| 1.1 | WHEN Content_Bot starts, THE Content_Bot SHALL read the bot token exclusively from the `CONTENT_BOT_TOKEN` environment variable |
| 1.2 | WHEN Content_Bot starts, THE Content_Bot SHALL read the admin ID list from `ADMIN_TELEGRAM_IDS` as comma-separated numeric Telegram IDs; the list MUST contain 1 to 2 IDs |
| 1.3 | WHEN Content_Bot starts, THE Content_Bot SHALL read the channel name from `CHANNEL_USERNAME` |
| 1.4 | WHEN Content_Bot starts, THE Content_Bot SHALL read `DATABASE_PATH`, `BACKUP_DIR`, and `TIMEZONE` from environment variables (with documented defaults when optional) |
| 1.5 | THE Content_Bot SHALL use long polling to receive updates from the Telegram API |
| 1.6 | THE Content_Bot SHALL run in a Docker_Container with restart policy `unless-stopped` |
| 1.7 | THE Docker_Container SHALL use a persistent volume for SQLite_Database storage |
| 1.8 | IF `CONTENT_BOT_TOKEN` is missing or empty, THEN Content_Bot SHALL exit with a non-zero code and log an error indicating the missing variable name |
| 1.9 | IF `ADMIN_TELEGRAM_IDS` is missing or empty, THEN Content_Bot SHALL exit with a non-zero code and log an error indicating the missing variable name |
| 1.10 | IF `CHANNEL_USERNAME` is missing or empty, THEN Content_Bot SHALL exit with a non-zero code and log an error indicating the missing variable name |
| 1.11 | IF `ADMIN_TELEGRAM_IDS` contains a non-numeric value, THEN Content_Bot SHALL exit with a non-zero code and log an error indicating invalid ID format |
| 1.12 | IF Content_Bot cannot establish a connection to the Telegram API within 30 seconds after startup, THEN Content_Bot SHALL exit with a non-zero code and log an error indicating Telegram API unavailability |
| 1.13 | THE Content_Bot SHALL never write token or secret values to logs |
| 1.14 | IF `OPENAI_API_KEY` is missing or empty, THE Content_Bot SHALL start normally and disable AI features without error |
| 1.15 | IF `MAIN_BOT_USERNAME` is missing or empty, THE Content_Bot SHALL start normally; CTA generation SHALL use a generic fallback reference when AI is enabled |
| 1.16 | IN v1, ALL runtime configuration SHALL be managed exclusively through environment variables; THE Content_Bot SHALL NOT read bot configuration from a database `settings` table |

See [Section 5: Environment Variables](#5-environment-variables) for the full variable list.

---

### Requirement 2: Authorization and Access Control

**User Story:** As an Admin, I want only authorized users to manage the bot so that unauthorized users cannot publish or delete content.

| ID | Acceptance Criteria |
|----|---------------------|
| 2.1 | WHEN a user sends a command or message to Content_Bot, THE Content_Bot SHALL verify the sender's Telegram ID against `ADMIN_TELEGRAM_IDS` before processing the request |
| 2.2 | IF the sender's Telegram ID is not in `ADMIN_TELEGRAM_IDS`, THEN Content_Bot SHALL reply with **"Доступ запрещён"** and stop processing without performing any action |
| 2.3 | WHEN an Admin presses an inline callback button, THE Content_Bot SHALL verify the user's Telegram ID is in `ADMIN_TELEGRAM_IDS` before executing the callback action |
| 2.4 | IF the callback user's Telegram ID is not in `ADMIN_TELEGRAM_IDS`, THEN Content_Bot SHALL answer the callback with notification **"Доступ запрещён"** and SHALL NOT execute the requested action |
| 2.5 | IF `ADMIN_TELEGRAM_IDS` is missing or empty at startup, THEN Content_Bot SHALL refuse to start and log a message indicating missing required configuration |

---

### Requirement 3: Bot Commands

**User Story:** As an Admin, I want to manage the bot through a set of commands to quickly perform common actions.

| ID | Acceptance Criteria |
|----|---------------------|
| 3.1 | WHEN Admin sends `/start`, THE Content_Bot SHALL reply with a welcome message (Russian) describing the bot and listing all v1 available commands |
| 3.2 | WHEN Admin sends `/help`, THE Content_Bot SHALL reply with a list of all v1 available commands and brief one-line descriptions (Russian) |
| 3.3 | WHEN Admin sends `/queue`, THE Content_Bot SHALL show one Candidate with `pending` status as a Moderation_Card; IF the Queue contains more than 1 Candidate, THE Content_Bot SHALL provide **Prev** and **Next** pagination buttons; IF pending queue size exceeds 50 Candidates, THE Content_Bot SHALL include a warning message to Admin indicating the queue size |
| 3.4 | WHEN Admin sends `/add` with text between 1 and 4096 characters, THE Content_Bot SHALL save the text as a new Candidate with type `text`, status `pending`, and confirm creation with the Candidate ID |
| 3.5 | IF Admin sends `/add` without text or with text longer than 4096 characters, THEN Content_Bot SHALL reply with an error message specifying the allowed text length |
| 3.6 | WHEN Admin sends `/poll Question \| Option 1 \| Option 2 [\| Option 3 …]`, THE Content_Bot SHALL parse the command, validate input, and save a new Candidate with type `poll`, status `pending`, populated `poll_question` and `poll_options_json`, and confirm creation with the Candidate ID |
| 3.7 | IF Admin sends `/poll` with fewer than 2 options, more than 10 options, a question longer than 255 characters, or malformed pipe-separated input, THEN Content_Bot SHALL reply with an error message describing valid format and limits |
| 3.8 | WHEN Admin sends `/scheduled`, THE Content_Bot SHALL show up to 10 Candidates with `scheduled` status including scheduled date/time, sorted by publication time ascending |
| 3.9 | WHEN Admin sends `/posted`, THE Content_Bot SHALL show up to 10 most recently published posts, sorted by publication date descending |
| 3.10 | WHEN Admin sends `/stats`, THE Content_Bot SHALL reply with statistics: post count by status, publications today, in the last 7 days, and all time |
| 3.11 | WHEN Admin sends `/testpost`, THE Content_Bot SHALL send a test message to the Channel and confirm success to the Admin |
| 3.12 | IF test message delivery to the Channel fails during `/testpost`, THEN Content_Bot SHALL reply to Admin with an error message including the failure reason |
| 3.13 | WHEN Admin sends `/backup`, THE Content_Bot SHALL create a backup of SQLite_Database and confirm with the backup file size |
| 3.14 | IF backup creation fails during `/backup`, THEN Content_Bot SHALL reply to Admin with an error message including the failure reason |
| 3.15 | WHEN a new Candidate is saved and pending queue size exceeds 50 after save, THE Content_Bot SHALL notify Admin with a queue size warning in the confirmation message |

> **Note:** `/find` and content discovery from external sources are **not** included in v1. See Requirement 11 and Out of Scope.

---

### Requirement 4: Manual Content Input

**User Story:** As an Admin, I want to send content directly to the bot to quickly add posts for the Channel.

| ID | Acceptance Criteria |
|----|---------------------|
| 4.1 | WHEN Admin sends a text message (not a command and not consisting solely of a URL), THE Content_Bot SHALL save the text (up to 4096 characters) as a new Candidate with type `text` and status `pending` |
| 4.2 | WHEN Admin sends a photo, THE Content_Bot SHALL save the Telegram `file_id` as a new Candidate with type `photo` and status `pending`, including caption if present |
| 4.3 | WHEN Admin sends a video, THE Content_Bot SHALL save the Telegram `file_id` as a new Candidate with type `video` and status `pending`, including caption if present |
| 4.4 | WHEN Admin sends a GIF/animation, THE Content_Bot SHALL save the Telegram `file_id` as a new Candidate with type `animation` and status `pending`, including caption if present |
| 4.5 | WHEN Admin sends a message consisting entirely of a single URL (determined by a Telegram entity of type `url` or `text_link` covering the entire message), THE Content_Bot SHALL validate URL format and save the URL as a new Candidate with type `link`, populated `source_url`, and status `pending` |
| 4.6 | IF Admin sends a URL-only message with invalid URL format, THEN Content_Bot SHALL reject the input and display an error indicating invalid URL format |
| 4.7 | WHEN Admin forwards a message to Content_Bot and the forwarded message contains accessible text, media, or `file_id`, THE Content_Bot SHALL save the forwarded content as a new Candidate with status `pending`, assigning type (`text`, `photo`, `video`, `animation`, or `link` for URL-only forwards) according to the forwarded content |
| 4.8 | IF Admin forwards a message where Telegram does not provide accessible text, media, or `file_id`, THEN Content_Bot SHALL notify Admin that the forwarded message cannot be processed and SHALL NOT create a Candidate |
| 4.9 | WHEN a Candidate is successfully saved, THE Content_Bot SHALL confirm to Admin with the Candidate ID within 2 seconds |
| 4.10 | IF saving a Candidate fails, THEN Content_Bot SHALL notify Admin with an error message including the failure reason and log the error |
| 4.11 | IF Admin sends unsupported content type (sticker, voice message, document, audio, contact, geolocation), THEN Content_Bot SHALL reply listing supported content types and SHALL NOT create a Candidate |

---

### Requirement 5: Content Moderation

**User Story:** As an Admin, I want to review Candidates and make decisions on each so that only quality content is published.

| ID | Acceptance Criteria |
|----|---------------------|
| 5.1 | THE Moderation_Card SHALL display: ID, type, category, `source_url` (if any), current caption or poll question (up to 200 characters with option to view full text), AI_Score (if any), Risk_Score (if any), `last_error` (if any), scheduled time (if any), status |
| 5.2 | THE Moderation_Card SHALL contain inline buttons: ✅ Post Now, 🕒 Schedule, ♻️ Rewrite, 📝 Edit Caption, ❌ Skip, 🗑 Delete |
| 5.3 | WHEN Admin presses ✅ Post Now on a Candidate with status `pending` or `scheduled`, THE Content_Bot SHALL publish the Candidate to the Channel within 5 seconds and display confirmation with a link to the published post |
| 5.4 | WHEN Admin presses 🕒 Schedule on a Candidate with status `pending`, THE Content_Bot SHALL request publication date/time from Admin in one of the accepted formats (see Requirement 7.10) and accept a value no earlier than 5 minutes from now and no later than 30 days |
| 5.5 | WHEN Admin presses ♻️ Rewrite, THE Content_Bot SHALL send the caption to AI_Module and display new caption variants within 15 seconds |
| 5.6 | WHEN Admin presses 📝 Edit Caption, THE Content_Bot SHALL request a new caption from Admin with maximum length of 1024 characters |
| 5.7 | WHEN Admin presses ❌ Skip, THE Content_Bot SHALL change Candidate status to `skipped` and display the next Candidate from the Queue |
| 5.8 | WHEN Admin presses 🗑 Delete, THE Content_Bot SHALL change Candidate status to `deleted` and display the next Candidate from the Queue |
| 5.9 | WHEN the Queue contains more than 1 Candidate, THE Moderation_Card SHALL show ⬅️ Prev and ➡️ Next navigation buttons |
| 5.10 | IF manual ✅ Post Now publication fails after retries, THEN Content_Bot SHALL display an error message to Admin with the reason, SHALL keep the Candidate in its pre-attempt status (`pending` or `scheduled`), SHALL NOT set status to `failed`, and SHALL save the error text in `last_error` |
| 5.11 | IF AI_Module is unavailable or does not respond within 15 seconds, THEN Content_Bot SHALL display a message to Admin about AI unavailability and keep the current caption unchanged |
| 5.12 | IF Admin enters an invalid schedule format, a resolved datetime in the past, or a time less than 5 minutes from now during Schedule, THEN Content_Bot SHALL display an error message describing accepted formats and constraints and re-request date and time |
| 5.13 | IF a Candidate already has status `posted` when ✅ Post Now is pressed, THEN Content_Bot SHALL reject the publish attempt and notify Admin that the content was already published |

---

### Requirement 6: Content Publishing

**User Story:** As an Admin, I want the bot to publish content to the Channel to automate the publication process.

| ID | Acceptance Criteria |
|----|---------------------|
| 6.1 | WHEN a Candidate is published (via Post Now or Scheduler), THE Content_Bot SHALL send content to the Channel using the appropriate Telegram API method by type: `sendMessage` for `text` and `link`, `sendPhoto` for `photo`, `sendVideo` for `video`, `sendAnimation` for `animation`, `sendPoll` for `poll` (using `poll_question` and `poll_options_json`) |
| 6.2 | WHEN publication succeeds, THE Content_Bot SHALL update Candidate status to `posted`, save `telegram_message_id` and `posted_at`, and clear `last_error` |
| 6.3 | WHEN publication succeeds, THE Content_Bot SHALL send Admin a private confirmation including a link to the published post |
| 6.4 | IF publication fails due to a Telegram API error, THE Content_Bot SHALL retry up to 3 times with a 5-second interval between attempts (manual Post Now and Scheduler) |
| 6.5 | IF manual ✅ Post Now publication fails after all retries are exhausted, THEN Content_Bot SHALL keep the Candidate in its pre-attempt status (`pending` or `scheduled`), save the error in `last_error`, log the error, and notify Admin — SHALL NOT set status to `failed` |
| 6.6 | IF scheduled publication fails after all retries are exhausted, THEN Content_Bot SHALL update Candidate status to `failed`, save the error in `last_error`, log the error, and notify Admin |
| 6.7 | IF a Candidate already has status `posted` at publish attempt, THEN Content_Bot SHALL reject publication and notify Admin that the content was already published |
| 6.8 | THE Content_Bot SHALL only accept Candidates with status `pending` or `scheduled` for publication |
| 6.9 | BEFORE publishing a Candidate, THE Content_Bot SHALL use a database transaction or row-level lock to ensure atomic publish: only one Admin/process may transition a Candidate from publishable status to `posted`; concurrent publish attempts on the same Candidate SHALL result in exactly one successful publication and all others rejected with an already-published or in-progress notification |

---

### Requirement 7: Publication Scheduling

**User Story:** As an Admin, I want to schedule publications for specific times so content goes out at optimal hours.

| ID | Acceptance Criteria |
|----|---------------------|
| 7.1 | WHEN Admin specifies a schedule time, THE Scheduler SHALL save `scheduled_at` in timezone configured by `TIMEZONE` (default `Europe/Warsaw`); the specified time MUST be at least 5 minutes after the current moment |
| 7.2 | WHEN Admin schedules a Candidate with status `pending`, THE Content_Bot SHALL change Candidate status to `scheduled` |
| 7.3 | WHEN the scheduled time (`scheduled_at`) arrives with a tolerance of no more than 5 minutes, THE Scheduler SHALL publish the Candidate to the Channel |
| 7.4 | THE Scheduler SHALL publish only Candidates with status `scheduled` |
| 7.5 | IF scheduled time was missed by 60 minutes or less, THEN THE Scheduler SHALL immediately publish the Candidate to the Channel |
| 7.6 | IF scheduled time was missed by more than 60 minutes, THEN THE Scheduler SHALL change Candidate status to `missed` and notify Admin via Content_Bot instead of publishing |
| 7.7 | WHEN Admin schedules a Candidate, THE Content_Bot SHALL confirm the scheduled time to Admin in format `DD.MM.YYYY HH:mm` (configured timezone) |
| 7.8 | IF Admin attempts to schedule a Candidate with status other than `pending`, THEN Content_Bot SHALL reject the request and inform Admin that status `pending` is required |
| 7.9 | IF scheduled publication to the Channel fails, THEN THE Scheduler SHALL retry no more than 3 times at 2-minute intervals; if all attempts fail, change status to `failed`, save `last_error`, and notify Admin |
| 7.10 | WHEN Admin enters a schedule datetime, THE Content_Bot SHALL accept ONLY these formats: `DD.MM HH:mm` and `DD.MM.YYYY HH:mm` (e.g. `25.01 14:30`, `25.01.2026 14:30`) |
| 7.11 | THE Content_Bot SHALL interpret entered schedule datetimes in the timezone configured by `TIMEZONE` |
| 7.12 | IF the year is omitted (`DD.MM HH:mm`), THE Content_Bot SHALL use the current year in the configured timezone |
| 7.13 | IF the resolved datetime (after applying year default and timezone) is in the past, THEN Content_Bot SHALL reject the input with an error message and re-request date and time |
| 7.14 | WHEN prompting Admin for schedule input, THE Content_Bot SHALL display the accepted formats and reference the configured timezone |

---

### Requirement 8: Content Rules and Filtering

**User Story:** As an Admin, I want the bot to filter prohibited content so unacceptable material does not reach the Channel.

| ID | Acceptance Criteria |
|----|---------------------|
| 8.1 | WHEN a Candidate contains content from forbidden categories (politics, religion, NSFW, hate speech, demeaning men or women, harsh dark humor, illegal content, overtly sexual content, violent content), THE Content_Bot SHALL flag the Candidate with a warning indicating the triggered category and display the warning to Admin during moderation, leaving the final decision to Admin |
| 8.2 | WHILE AI_Module is available, THE Content_Bot SHALL automatically evaluate Risk_Score on a 1–10 scale for each new Candidate within 30 seconds of receipt |
| 8.3 | WHEN Risk_Score exceeds threshold 7 (strictly greater than 7 out of 10), THE Content_Bot SHALL flag the Candidate with a warning for Admin during moderation displaying the numeric Risk_Score and `risk_reason` |
| 8.4 | THE Content_Bot SHALL accept content in Russian in a light, meme-oriented tone |
| 8.5 | IF AI_Module is unavailable, THEN Content_Bot SHALL skip Risk_Score evaluation and save the Candidate without AI scoring, leaving moderation to Admin discretion |

---

### Requirement 9: AI Module (Optional)

**User Story:** As an Admin, I want to use AI to improve content and automate evaluation to speed up moderation.

| ID | Acceptance Criteria |
|----|---------------------|
| 9.1 | IF `OPENAI_API_KEY` is present and non-empty, THEN AI_Module SHALL expose AI commands (rewrite, score, classify, poll, CTA) in the Admin interface and accept requests for them |
| 9.2 | IF `OPENAI_API_KEY` is missing or empty, THEN Content_Bot SHALL hide AI commands from the Admin interface and perform all other functions (publishing, moderation, scheduling) without errors |
| 9.3 | WHEN Admin requests caption rewrite, THE AI_Module SHALL within 30 seconds generate 3 caption variants in Russian, each no longer than 1024 characters |
| 9.4 | WHEN AI_Module scores content, THE AI_Module SHALL assign AI_Score as an integer from 1 to 10 (1 = lowest quality, 10 = highest quality) |
| 9.5 | WHEN AI_Module assesses content risk, THE AI_Module SHALL assign Risk_Score as an integer from 1 to 10 (1 = minimal risk, 10 = maximum risk) |
| 9.6 | WHEN AI_Module classifies content, THE AI_Module SHALL assign exactly one category from the predefined category list (see Section 7.4) |
| 9.7 | WHEN Admin requests poll generation via AI, THE AI_Module SHALL within 30 seconds create poll data with a question (up to 255 characters) and 2 to 10 answer options in Russian |
| 9.8 | WHEN Admin requests CTA generation, THE AI_Module SHALL generate a call-to-action in Russian no longer than 200 characters referencing the main Its a Match dating bot; IF `MAIN_BOT_USERNAME` is set, THE CTA SHALL reference that username |
| 9.9 | IF an OpenAI API call fails or does not respond within 30 seconds, THEN AI_Module SHALL display an error message to Admin with the reason (timeout, rate limit, service unavailable) and keep the original content unchanged |

---

### Requirement 10: Database and Storage

**User Story:** As an Admin, I want all data stored reliably and to survive restarts so nothing is lost.

| ID | Acceptance Criteria |
|----|---------------------|
| 10.1 | IN v1, THE SQLite_Database SHALL store ONLY the `posts` table with fields: `id`, `type`, `status`, `category`, `source_url`, `media_file_id`, `media_url`, `caption`, `raw_text`, `ai_score`, `risk_score`, `risk_reason`, `warnings`, `poll_question`, `poll_options_json`, `scheduled_at`, `posted_at`, `telegram_message_id`, `last_error`, `created_by`, `created_at`, `updated_at`, `deleted_at` |
| 10.2 | IN v1, THE SQLite_Database SHALL NOT include a `settings` table; runtime configuration SHALL come from environment variables only |
| 10.3 | THE SQLite_Database SHALL support Candidate statuses: `pending`, `scheduled`, `posted`, `skipped`, `deleted`, `failed`, `missed` |
| 10.4 | THE Docker_Container SHALL mount a persistent volume for the SQLite_Database directory |
| 10.5 | WHEN Content_Bot restarts, THE Content_Bot SHALL restore all data from SQLite_Database without loss |

> **Note:** `sources` and `settings` tables are deferred to **Phase 2** if needed for external content sources and dynamic configuration.

---

### Requirement 11: Content Sources (Phase 2 — Not v1)

**User Story:** As an Admin, I want automatic content collection from external sources in the future.

| ID | Acceptance Criteria |
|----|---------------------|
| 11.1 | IN v1, THE Content_Bot SHALL support manual content input as the only active content source |
| 11.2 | THE `/find` command, content discovery UI, and external source fetching SHALL NOT be available in v1 |
| 11.3 | WHEN Admin manually adds a link, THE Content_Bot SHALL validate URL format and save with type `link` on successful validation |
| 11.4 | IN v1, THE Content_Bot SHALL NOT include Source_Adapter skeleton code, external fetch interfaces, or any callable code paths for RSS, YouTube, Reddit, or Telegram list sources unless a later architecture document explicitly requires minimal scaffolding |
| 11.5 | IF minimal scaffolding is approved in architecture for Phase 2 preparation, IT SHALL NOT be exposed via bot commands, callbacks, or runtime entry points in v1 |

> **Note:** Source_Adapter interfaces, `/find`, and automatic collection from RSS, YouTube, Reddit, and Telegram lists are planned for **Phase 2**.

> **Note:** Media group / album support (`sendMediaGroup`) is planned for **Phase 1.5**.

---

### Requirement 12: Reliability and Recovery

**User Story:** As an Admin, I want the bot to run stably and recover from failures without manual intervention.

| ID | Acceptance Criteria |
|----|---------------------|
| 12.1 | IF Telegram API returns a transient error (timeout, rate limit, 5xx), THEN Content_Bot SHALL retry the request up to 3 times with exponential backoff; if all attempts fail, log the error and continue running without terminating the process |
| 12.2 | IF Content_Bot receives input that does not match the expected command format or exceeds 4096 characters, THEN Content_Bot SHALL reject the input, send the user a message with the rejection reason, and continue running without crashing |
| 12.3 | THE Content_Bot SHALL use structured JSON logging with fields `timestamp`, `level`, `module`, and `message`, outputting logs to stdout for all Telegram API, database, and user command operations |
| 12.4 | WHEN Admin sends `/backup`, THE Content_Bot SHALL create a copy of the SQLite_Database file in the directory specified by `BACKUP_DIR` and send Admin confirmation with the filename and file size |
| 12.5 | THE Docker_Container SHALL use restart policy `unless-stopped` for automatic recovery |
| 12.6 | WHEN Content_Bot restarts after a failure, THE Scheduler SHALL within 60 seconds resume processing scheduled publications: for posts missed by 60 minutes or less — publish immediately; for posts missed by more than 60 minutes — set status `missed` and notify Admin |
| 12.7 | IF backup creation via `/backup` fails, THEN Content_Bot SHALL send Admin a message with the failure reason and log the error |

---

### Requirement 13: Security

**User Story:** As an Admin, I want the bot to not expose sensitive data and to be protected from unauthorized access.

| ID | Acceptance Criteria |
|----|---------------------|
| 13.1 | THE Content_Bot SHALL read all secrets (tokens, API keys, chat identifiers) exclusively from environment variables |
| 13.2 | IF any required environment variable is missing or empty at startup, THEN Content_Bot SHALL refuse to start and log a message naming the missing variable without revealing its expected value |
| 13.3 | THE Content_Bot SHALL never write token values, API keys, or chat identifiers to logs or messages — only variable names may be logged |
| 13.4 | THE Content_Bot SHALL include `.env` in `.gitignore` to prevent it from entering version control |
| 13.5 | THE Content_Bot SHALL provide a `.env.example` file containing all environment variable names with a comment describing each, without real values |
| 13.6 | THE Content_Bot SHALL NOT start an HTTP server or open network ports for incoming connections |
| 13.7 | WHEN Content_Bot receives a callback action, THE Content_Bot SHALL verify the sender's Telegram user ID matches an authorized Admin |
| 13.8 | IF a callback action is received from an unauthorized user, THEN Content_Bot SHALL answer the callback with **"Доступ запрещён"**, SHALL NOT execute the action, and SHALL NOT perform any side effects |

---

### Requirement 14: Infrastructure and Deployment

**User Story:** As an Admin, I want simple deployment instructions to quickly run the bot on a local machine or VPS.

| ID | Acceptance Criteria |
|----|---------------------|
| 14.1 | THE Content_Bot SHALL provide a Dockerfile using multi-stage build with a pinned Node.js base image version; the final image MUST contain production dependencies only |
| 14.2 | THE Content_Bot SHALL provide `docker-compose.yml` with bot service configuration, persistent data volume, and reference to the `.env` file |
| 14.3 | THE Content_Bot SHALL provide a README where **technical sections are in English** (architecture overview, configuration reference, deployment, troubleshooting); a **short Russian quickstart section** is allowed (clone, configure `.env`, run `docker compose up`, verify `/start`) |
| 14.4 | THE Content_Bot SHALL provide `.env.example` with all environment variables, a descriptive comment for each, and placeholder example values |
| 14.5 | WHEN Admin runs `docker compose up` after configuring `.env`, THE Content_Bot SHALL start without errors and be ready to handle Telegram commands within 30 seconds |
| 14.6 | THE Docker_Container SHALL run on any Linux system with Docker and Docker Compose installed without modifying Dockerfile or `docker-compose.yml`, requiring only `.env` configuration from Admin |
| 14.7 | THE Content_Bot SHALL use TypeScript and Node.js as the technology stack |
| 14.8 | THE Content_Bot SHALL use the grammY library for Telegram API interaction |
| 14.9 | WHEN the Docker container is restarted (`docker compose restart`), THE Content_Bot SHALL preserve all user data from the persistent volume without loss |
| 14.10 | ALL Telegram bot user-facing messages and command responses SHALL be in **Russian** |

---

## 5. Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CONTENT_BOT_TOKEN` | **Yes** | — | Telegram bot token from @BotFather |
| `ADMIN_TELEGRAM_IDS` | **Yes** | — | Comma-separated numeric Telegram user IDs (1–2 admins) |
| `CHANNEL_USERNAME` | **Yes** | — | Target channel username without `@` (e.g. `itsamatchchannel`) |
| `DATABASE_PATH` | No | `/app/data/content_bot.db` | Path to SQLite database file |
| `BACKUP_DIR` | No | `/app/data/backups` | Directory for `/backup` output |
| `TIMEZONE` | No | `Europe/Warsaw` | IANA timezone for scheduling and display |
| `OPENAI_API_KEY` | No | — | OpenAI API key; when absent, AI features are disabled |
| `MAIN_BOT_USERNAME` | No | — | Username of the main Its a Match bot (without `@`) for CTA generation |

**Rules:**

- Required variables MUST be validated at startup; missing required variables cause non-zero exit.
- Secrets MUST NOT appear in logs or user messages.
- `.env.example` MUST document all variables above.
- IN v1, environment variables are the **only** source of runtime configuration (no `settings` table).

---

## 6. Primary User Flows

### Flow 1: Manual Content Addition

1. Admin sends text/photo/video/GIF/link to Content_Bot
2. Content_Bot saves as Candidate with status `pending`
3. Content_Bot confirms save with Candidate ID

### Flow 2: Poll Creation via Command

1. Admin sends `/poll Кто платит на первом свидании? | Я | Он/она | Пополам`
2. Content_Bot validates question and 2–10 options
3. Content_Bot saves Candidate with type `poll`, `poll_question`, `poll_options_json`, status `pending`
4. Content_Bot confirms save with Candidate ID

### Flow 3: Moderation and Publishing

1. Admin sends `/queue`
2. Content_Bot shows Moderation_Card for the first Candidate in the queue
3. Admin presses ✅ Post Now
4. Content_Bot acquires publish lock / transaction
5. Content_Bot publishes to Channel
6. Content_Bot updates status to `posted`
7. Content_Bot notifies Admin of success with post link

### Flow 4: Schedule Publication

1. Admin views Moderation_Card
2. Admin presses 🕒 Schedule
3. Content_Bot requests date and time in formats `DD.MM HH:mm` or `DD.MM.YYYY HH:mm` (configured `TIMEZONE`)
4. Admin enters e.g. `25.01 14:30` or `25.01.2026 14:30`
5. Content_Bot resolves year (current year if omitted), validates not in past and ≥5 min ahead
6. Content_Bot saves `scheduled_at` and changes status from `pending` to `scheduled`
7. Scheduler publishes at the scheduled time

### Flow 5: AI Rewrite

1. Admin views Moderation_Card
2. Admin presses ♻️ Rewrite
3. AI_Module generates 3 caption variants
4. Admin selects one variant
5. Content_Bot updates the Candidate caption

### Flow 6: Content Rejection

1. Admin views Moderation_Card
2. Admin presses ❌ Skip or 🗑 Delete
3. Content_Bot updates status accordingly

### Flow 7: Concurrent Publish Protection

1. Two Admins open the same Candidate in `/queue`
2. Both press ✅ Post Now at nearly the same time
3. Exactly one publication succeeds; the other receives a rejection notification
4. Channel contains exactly one post for that Candidate

---

## 7. Data Requirements

### 7.1 v1 Database Scope

IN v1, THE SQLite_Database SHALL contain **only** the `posts` table. No `settings` or `sources` tables.

### 7.2 Table: `posts`

| Field | Type | Description |
|-------|------|-------------|
| `id` | INTEGER PRIMARY KEY | Unique identifier |
| `type` | TEXT | `text`, `photo`, `video`, `animation`, `poll`, `link` |
| `status` | TEXT | `pending`, `scheduled`, `posted`, `skipped`, `deleted`, `failed`, `missed` |
| `category` | TEXT | Content category (from predefined list) |
| `source_url` | TEXT | Source URL (for type `link`) |
| `media_file_id` | TEXT | Telegram media `file_id` |
| `media_url` | TEXT | Media URL (if any) |
| `caption` | TEXT | Content caption |
| `raw_text` | TEXT | Original content text |
| `ai_score` | REAL | AI score 1–10 |
| `risk_score` | REAL | Risk score 1–10 |
| `risk_reason` | TEXT | Reason for assigned `risk_score` |
| `warnings` | TEXT | JSON array of AI/filter warnings |
| `poll_question` | TEXT | Poll question (up to 255 characters); used when `type` = `poll` |
| `poll_options_json` | TEXT | JSON array of poll option strings (2–10 items); used when `type` = `poll` |
| `scheduled_at` | TEXT | Scheduled publication time (ISO 8601, configured timezone) |
| `posted_at` | TEXT | Actual publication time |
| `telegram_message_id` | INTEGER | Message ID in Telegram channel |
| `last_error` | TEXT | Most recent publication error message (nullable) |
| `created_by` | TEXT | Creator Telegram ID |
| `created_at` | TEXT | Record creation time |
| `updated_at` | TEXT | Last update time |
| `deleted_at` | TEXT | Soft delete time (optional) |

### 7.3 Candidate Statuses

| Status | Description |
|--------|-------------|
| `pending` | Awaiting Admin review (ready for moderation) |
| `scheduled` | Scheduled for a specific time |
| `posted` | Published to Channel |
| `skipped` | Skipped by Admin |
| `deleted` | Deleted |
| `failed` | Scheduled publication failed after all retries |
| `missed` | Scheduled time missed (>60 min) |

### 7.4 Predefined Content Categories

THE Content_Bot SHALL use the following predefined categories. AI classification and manual assignment MUST use values from this list:

| Category | Description |
|----------|-------------|
| `dating_meme` | Dating-related memes |
| `relationship_joke` | Jokes about relationships |
| `cat` | Cat content |
| `news` | News and updates |
| `poll` | Poll content |
| `promo` | Promotional content |
| `quote` | Quotes |
| `observation` | Observations and thoughts |
| `link` | Link shares |

---

## 8. Security Requirements (Summary)

1. All secrets stored exclusively in environment variables
2. `.env` file not committed to repository (listed in `.gitignore`)
3. Tokens and keys not logged
4. Access to all commands and actions restricted to `ADMIN_TELEGRAM_IDS`
5. Unauthorized callbacks answered with **"Доступ запрещён"**
6. No HTTP server started
7. `.env.example` contains variable descriptions only, no real values
8. Atomic publish protection prevents duplicate Channel posts

---

## 9. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | **Availability:** Content_Bot runs 24/7 on a local Windows machine with Docker Desktop |
| NFR-2 | **Portability:** Configuration portable to VPS without modification |
| NFR-3 | **Resilience:** Automatic restart on failure (`unless-stopped`) |
| NFR-4 | **Persistence:** Data survives restarts via persistent volume |
| NFR-5 | **UI language:** Telegram bot user-facing messages in Russian |
| NFR-6 | **Documentation language:** README technical sections in English; optional short Russian quickstart |
| NFR-7 | **Content language:** Russian as primary content language |
| NFR-8 | **Content tone:** Light, meme-oriented, occasionally educational |
| NFR-9 | **Logging:** Structured JSON logs to stdout for all operations |
| NFR-10 | **Performance:** Bot responds to commands within reasonable time (Telegram API limits apply) |
| NFR-11 | **Scalability:** Support 1–2 Admins concurrently with safe concurrent publish handling |

---

## 10. Scope (v1)

Version 1 includes **only** the following:

- Admin-only access (1–2 people)
- Manual content input: text, photo, video, GIF, link
- Poll creation via `/poll` command
- Queue with Moderation_Cards (one card per page with pagination)
- Caption editing (📝 Edit Caption)
- AI rewrite (♻️ Rewrite) — when `OPENAI_API_KEY` is set
- Publishing (✅ Post Now) with atomic duplicate protection
- Scheduling (🕒 Schedule)
- Skip / delete (❌ Skip / 🗑 Delete)
- Statistics (`/stats`)
- Database backup (`/backup`)
- Test post (`/testpost`)
- Docker deployment (`docker compose`)
- Long polling for Telegram updates
- SQLite as the sole database
- JSON logging to stdout
- Predefined content categories
- Queue size warning when pending count exceeds 50
- Schedule input formats: `DD.MM HH:mm`, `DD.MM.YYYY HH:mm`

---

## 11. Out of Scope (v1)

The following are **not** included in v1:

- `/find` command and content discovery UI
- Automatic content collection from RSS / YouTube / Reddit / Telegram lists (**Phase 2**)
- Source_Adapter skeleton, interfaces, or any external source fetching code (**Phase 2**)
- `settings` database table (runtime config via environment variables only)
- `sources` database table (**Phase 2**)
- Hard daily publication limit
- Web admin panel
- Webhook mode
- HTTP server
- PostgreSQL
- Redis
- n8n integration
- Telegram Mini App
- Integration with the main Its a Match dating bot (except optional CTA text via `MAIN_BOT_USERNAME`)
- Albums / media groups (**Phase 1.5**)

---

## 12. Test Plan

### 12.1 Startup and Configuration

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-1.1 | Start bot with valid `.env` | Bot starts, connects to Telegram within 30s, logs ready state |
| TP-1.2 | Start bot without `CONTENT_BOT_TOKEN` | Non-zero exit, log names missing variable, no secret values in log |
| TP-1.3 | Start bot with invalid `ADMIN_TELEGRAM_IDS` (non-numeric) | Non-zero exit, format error logged |
| TP-1.4 | Start bot without `OPENAI_API_KEY` | Bot starts; AI commands hidden; no errors |
| TP-1.5 | Restart container | Data persisted in volume; scheduled jobs recovered within 60s |

### 12.2 Authorization

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-2.1 | Unauthorized user sends `/start` | Reply: **"Доступ запрещён"** |
| TP-2.2 | Unauthorized user presses inline button | Callback answer: **"Доступ запрещён"**; no side effects |
| TP-2.3 | Authorized Admin sends `/start` | Welcome message in Russian with command list |

### 12.3 Content Input

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-3.1 | Admin sends plain text | Candidate type `text`, status `pending`, ID returned |
| TP-3.2 | Admin sends URL-only message | Candidate type `link`, `source_url` set |
| TP-3.3 | Admin sends invalid URL-only message | Error message; no Candidate created |
| TP-3.4 | Admin sends photo with caption | Candidate type `photo`, `media_file_id` and caption saved |
| TP-3.5 | Admin sends sticker | Error listing supported types; no Candidate |
| TP-3.6 | Admin sends `/poll Q \| A \| B` | Candidate type `poll`, `poll_question` and `poll_options_json` saved |
| TP-3.7 | Admin sends `/poll` with 1 option | Error with format/limits description |

### 12.4 Moderation and Publishing

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-4.1 | `/queue` with pending items | Moderation_Card shown with action buttons |
| TP-4.2 | ✅ Post Now on text Candidate | Post in Channel; status `posted`; Admin receives link |
| TP-4.3 | ✅ Post Now on poll Candidate | Poll published via `sendPoll`; options match `poll_options_json` |
| TP-4.4 | ✅ Post Now on link Candidate | URL published via `sendMessage` |
| TP-4.5 | ✅ Post Now on already `posted` Candidate | Rejected; no duplicate Channel post |
| TP-4.6 | Two Admins publish same Candidate simultaneously | Exactly one Channel post; second attempt rejected |
| TP-4.7 | Manual Post Now fails (simulate API error) | Status remains `pending`/`scheduled`; `last_error` saved; not `failed` |
| TP-4.8 | ❌ Skip / 🗑 Delete | Status updated; next queue item shown |
| TP-4.9 | `/queue` with 51+ pending Candidates | Warning about queue size (>50) shown to Admin |
| TP-4.10 | Save Candidate when queue exceeds 50 | Confirmation includes queue size warning |

### 12.5 Scheduling

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-5.1 | Schedule Candidate with `25.01.2026 14:30` (10 min ahead) | Status `scheduled`; confirmation in `DD.MM.YYYY HH:mm` |
| TP-5.2 | Schedule with `25.01 14:30` (year omitted, valid future time) | Current year applied; status `scheduled` |
| TP-5.3 | Schedule with past datetime | Rejected with error; re-prompt |
| TP-5.4 | Schedule with invalid format (e.g. `2026-01-25 14:30`) | Format error listing accepted formats; re-prompt |
| TP-5.5 | Scheduled time arrives | Candidate published; status `posted` |
| TP-5.6 | Scheduled time missed >60 min | Status `missed`; Admin notified |
| TP-5.7 | Scheduled publish fails after retries | Status `failed`; `last_error` saved; Admin notified |

### 12.6 Commands

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-6.1 | `/stats` | Counts by status and publication periods returned |
| TP-6.2 | `/scheduled` | Up to 10 scheduled items listed |
| TP-6.3 | `/posted` | Up to 10 recent posts with links |
| TP-6.4 | `/testpost` | Test message in Channel; confirmation to Admin |
| TP-6.5 | `/backup` | Backup file created in `BACKUP_DIR`; size reported |
| TP-6.6 | `/find` | Command not available in v1 (unknown command or not listed in help) |

### 12.7 AI Module (when `OPENAI_API_KEY` set)

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-7.1 | ♻️ Rewrite on Moderation_Card | 3 variants within 15s; selection updates caption |
| TP-7.2 | AI classify | Category assigned from predefined list |
| TP-7.3 | AI unavailable / timeout | Error message; original content unchanged |
| TP-7.4 | New Candidate with AI enabled | Risk_Score evaluated within 30s when possible |

### 12.8 Security and Logging

| Test ID | Scenario | Expected Result |
|---------|----------|-----------------|
| TP-8.1 | Inspect logs during operation | JSON format; no tokens or API keys present |
| TP-8.2 | Verify no inbound ports | No HTTP server listening |
| TP-8.3 | `.env` in `.gitignore` | `.env` not tracked by git |

---

## 13. Resolved Decisions (v1)

| Topic | Decision |
|-------|----------|
| Schedule input format | Accept `DD.MM HH:mm` and `DD.MM.YYYY HH:mm`; interpret in `TIMEZONE`; default to current year when year omitted; reject past datetimes |
| Daily publication limit | No hard daily limit in v1 |
| Queue size warning | Warn Admin when pending queue exceeds **50** Candidates |
| Runtime configuration | Environment variables only; no `settings` table in v1 |
| External content sources | No Source_Adapter skeleton or fetch code in v1 unless architecture explicitly requires minimal scaffolding (not exposed at runtime) |

---

## 14. Open Questions

| # | Question |
|---|----------|
| OQ-1 | Is a notification system needed (reminders about scheduled posts N minutes before)? |
| OQ-2 | Is a duplicate (clone) feature needed for reusing Candidate templates? |

---

## 15. Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-28 | Initial requirements based on stakeholder input |
| 1.1 | 2026-06-28 | Final revisions: removed `/find` from v1; `link` type; `/poll` command; env vars section; predefined categories; publish failure rules; atomic publish; README language policy; unauthorized callback policy; Test Plan |
| 1.2 | 2026-06-28 | Removed `settings` table from v1; no Source_Adapter skeleton in v1; schedule format resolved; no daily publish limit; queue warning at 50; Resolved Decisions section |
