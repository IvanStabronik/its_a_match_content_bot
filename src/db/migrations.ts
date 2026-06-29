import type { Db } from './connection.js';
import { logger } from '../logger.js';

const CATEGORY_CHECK = `'dating_meme','relationship_joke','cat','news','poll','promo','quote','observation','link'`;

type Migration = {
  version: number;
  name: string;
  up: (db: Db) => void;
};

function tableExists(db: Db, table: string): boolean {
  const row = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`)
    .get(table) as { name: string } | undefined;
  return row !== undefined;
}

function columnExists(db: Db, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((r) => r.name === column);
}

function addColumnIfMissing(db: Db, table: string, column: string, definition: string): void {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'initial_posts',
    up(db) {
      db.exec(`
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
      `);
    },
  },
  {
    version: 2,
    name: 'discovery_sources',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS sources (
          id              INTEGER PRIMARY KEY AUTOINCREMENT,
          type            TEXT NOT NULL CHECK (type IN ('youtube_channel','youtube_search','rss','reddit')),
          name            TEXT NOT NULL,
          config_json     TEXT NOT NULL,
          enabled         INTEGER NOT NULL DEFAULT 1,
          last_checked_at TEXT,
          last_success_at TEXT,
          last_error      TEXT,
          created_at      TEXT NOT NULL,
          updated_at      TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);

        CREATE TABLE IF NOT EXISTS source_items (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id         INTEGER NOT NULL,
          platform          TEXT NOT NULL,
          external_id       TEXT NOT NULL,
          url               TEXT NOT NULL,
          title             TEXT,
          description       TEXT,
          author            TEXT,
          published_at      TEXT,
          thumbnail_url     TEXT,
          raw_json          TEXT,
          candidate_post_id INTEGER,
          created_at        TEXT NOT NULL,
          UNIQUE(platform, external_id),
          FOREIGN KEY (source_id) REFERENCES sources(id)
        );

        CREATE INDEX IF NOT EXISTS idx_source_items_source ON source_items(source_id);
        CREATE INDEX IF NOT EXISTS idx_source_items_candidate ON source_items(candidate_post_id);
      `);

      if (tableExists(db, 'posts')) {
        addColumnIfMissing(db, 'posts', 'discovery_source_id', 'INTEGER');
        addColumnIfMissing(db, 'posts', 'discovery_item_id', 'INTEGER');
        addColumnIfMissing(db, 'posts', 'source_title', 'TEXT');
        addColumnIfMissing(db, 'posts', 'source_author', 'TEXT');
        addColumnIfMissing(db, 'posts', 'thumbnail_url', 'TEXT');
        addColumnIfMissing(db, 'posts', 'discovered_at', 'TEXT');
      }
    },
  },
  {
    version: 3,
    name: 'content_quality_layer',
    up(db) {
      const postCols: Array<[string, string]> = [
        ['discovery_format', 'TEXT'],
        ['language', 'TEXT'],
        ['duration_seconds', 'INTEGER'],
        ['quality_score', 'REAL'],
        ['content_angle', 'TEXT'],
        ['publish_recommendation', 'TEXT'],
        ['shorts_url', 'TEXT'],
      ];
      if (tableExists(db, 'posts')) {
        for (const [col, def] of postCols) addColumnIfMissing(db, 'posts', col, def);
      }

      const itemCols: Array<[string, string]> = [
        ['skip_reason', 'TEXT'],
        ['discovery_format', 'TEXT'],
        ['language', 'TEXT'],
        ['duration_seconds', 'INTEGER'],
        ['quality_score', 'REAL'],
        ['shorts_url', 'TEXT'],
        ['image_url', 'TEXT'],
      ];
      if (tableExists(db, 'source_items')) {
        for (const [col, def] of itemCols) addColumnIfMissing(db, 'source_items', col, def);
      }

      if (tableExists(db, 'sources')) {
        db.pragma('foreign_keys = OFF');
        try {
          db.exec(`
            CREATE TABLE sources_v3 (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              type            TEXT NOT NULL,
              name            TEXT NOT NULL,
              config_json     TEXT NOT NULL,
              enabled         INTEGER NOT NULL DEFAULT 1,
              last_checked_at TEXT,
              last_success_at TEXT,
              last_error      TEXT,
              created_at      TEXT NOT NULL,
              updated_at      TEXT NOT NULL
            );
            INSERT INTO sources_v3 SELECT * FROM sources;
            DROP TABLE sources;
            ALTER TABLE sources_v3 RENAME TO sources;
            CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);
          `);
        } finally {
          db.pragma('foreign_keys = ON');
        }
      }
    },
  },
];

export function runMigrations(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  const applied = new Set(
    (db.prepare('SELECT version FROM schema_migrations').all() as Array<{ version: number }>).map(
      (r) => r.version,
    ),
  );

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    logger.info('database', `Applying migration v${migration.version}: ${migration.name}`);
    const apply = db.transaction(() => {
      migration.up(db);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
        migration.version,
        new Date().toISOString(),
      );
    });
    apply();
  }
}
