import type { Db } from './connection.js';
import { logger } from '../logger.js';

const CATEGORY_CHECK = `'dating_meme','relationship_joke','cat','news','poll','promo','quote','observation','link'`;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS posts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  type                  TEXT NOT NULL CHECK (type IN ('text','photo','video','animation','poll','link')),
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','scheduled','posted','skipped','deleted','failed','missed')),
  category              TEXT CHECK (category IS NULL OR category IN (${CATEGORY_CHECK})),
  source_url            TEXT,
  media_file_id         TEXT,
  media_url             TEXT,
  caption               TEXT,
  raw_text              TEXT,
  ai_score              REAL,
  risk_score            REAL,
  risk_reason           TEXT,
  warnings              TEXT,
  poll_question         TEXT,
  poll_options_json     TEXT,
  scheduled_at          TEXT,
  posted_at             TEXT,
  telegram_message_id   INTEGER,
  last_error            TEXT,
  publishing_started_at TEXT,
  created_by            TEXT,
  created_at            TEXT NOT NULL,
  updated_at            TEXT NOT NULL,
  deleted_at            TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_scheduled_at ON posts(scheduled_at) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_posts_posted_at ON posts(posted_at) WHERE status = 'posted';
CREATE INDEX IF NOT EXISTS idx_posts_pending_created ON posts(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_posts_publishing ON posts(publishing_started_at)
  WHERE publishing_started_at IS NOT NULL;
`;

export function initSchema(db: Db): void {
  db.exec(SCHEMA);
  logger.info('database', 'Schema initialized');
}
