import type { Db } from '../db/connection.js';
import type {
  CreateSourceInput,
  DiscoveryFormat,
  ContentLanguage,
  Post,
  SkipReason,
  Source,
  SourceItem,
  SourceType,
} from '../types.js';
import type { PostRepository } from './posts.js';

export interface SourceItemInput {
  sourceId: number;
  platform: string;
  externalId: string;
  url: string;
  title?: string | null;
  description?: string | null;
  author?: string | null;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  raw?: unknown;
  skipReason?: SkipReason | null;
  discoveryFormat?: DiscoveryFormat | null;
  language?: ContentLanguage | null;
  durationSeconds?: number | null;
  qualityScore?: number | null;
  shortsUrl?: string | null;
  imageUrl?: string | null;
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToSource(row: Record<string, unknown>): Source {
  return row as unknown as Source;
}

function rowToSourceItem(row: Record<string, unknown>): SourceItem {
  return row as unknown as SourceItem;
}

export class SourceRepository {
  constructor(private readonly db: Db) {}

  create(input: CreateSourceInput): Source {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO sources (type, name, config_json, enabled, created_at, updated_at)
         VALUES (@type, @name, @config_json, @enabled, @created_at, @updated_at)`,
      )
      .run({
        type: input.type,
        name: input.name,
        config_json: JSON.stringify(input.config),
        enabled: input.enabled === false ? 0 : 1,
        created_at: ts,
        updated_at: ts,
      });
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Source | null {
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ?').get(id);
    return row ? rowToSource(row as Record<string, unknown>) : null;
  }

  listAll(): Source[] {
    const rows = this.db.prepare('SELECT * FROM sources ORDER BY id ASC').all();
    return rows.map((r) => rowToSource(r as Record<string, unknown>));
  }

  listEnabled(): Source[] {
    const rows = this.db
      .prepare('SELECT * FROM sources WHERE enabled = 1 ORDER BY id ASC')
      .all();
    return rows.map((r) => rowToSource(r as Record<string, unknown>));
  }

  updateConfig(id: number, config: Record<string, unknown>): Source | null {
    const ts = nowIso();
    this.db
      .prepare('UPDATE sources SET config_json = ?, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(config), ts, id);
    return this.getById(id);
  }

  setEnabled(id: number, enabled: boolean): Source | null {
    const ts = nowIso();
    this.db
      .prepare('UPDATE sources SET enabled = ?, updated_at = ? WHERE id = ?')
      .run(enabled ? 1 : 0, ts, id);
    return this.getById(id);
  }

  markChecked(id: number, error: string | null): void {
    const ts = nowIso();
    if (error) {
      this.db
        .prepare(
          `UPDATE sources SET last_checked_at = ?, last_error = ?, updated_at = ? WHERE id = ?`,
        )
        .run(ts, error, ts, id);
    } else {
      this.db
        .prepare(
          `UPDATE sources SET last_checked_at = ?, last_success_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`,
        )
        .run(ts, ts, ts, id);
    }
  }

  countCandidatesCreated(sourceId: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) as cnt FROM source_items WHERE source_id = ? AND candidate_post_id IS NOT NULL`,
      )
      .get(sourceId) as { cnt: number };
    return row.cnt;
  }

  getConfig(source: Source): Record<string, unknown> {
    return JSON.parse(source.config_json) as Record<string, unknown>;
  }
}

export class SourceItemRepository {
  constructor(private readonly db: Db) {}

  findByPlatformExternalId(platform: string, externalId: string): SourceItem | null {
    const row = this.db
      .prepare('SELECT * FROM source_items WHERE platform = ? AND external_id = ?')
      .get(platform, externalId);
    return row ? rowToSourceItem(row as Record<string, unknown>) : null;
  }

  create(input: SourceItemInput): SourceItem {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO source_items (
          source_id, platform, external_id, url, title, description, author,
          published_at, thumbnail_url, raw_json, created_at,
          skip_reason, discovery_format, language, duration_seconds,
          quality_score, shorts_url, image_url
        ) VALUES (
          @source_id, @platform, @external_id, @url, @title, @description, @author,
          @published_at, @thumbnail_url, @raw_json, @created_at,
          @skip_reason, @discovery_format, @language, @duration_seconds,
          @quality_score, @shorts_url, @image_url
        )`,
      )
      .run({
        source_id: input.sourceId,
        platform: input.platform,
        external_id: input.externalId,
        url: input.url,
        title: input.title ?? null,
        description: input.description ?? null,
        author: input.author ?? null,
        published_at: input.publishedAt ?? null,
        thumbnail_url: input.thumbnailUrl ?? null,
        raw_json: input.raw ? JSON.stringify(input.raw) : null,
        created_at: ts,
        skip_reason: input.skipReason ?? null,
        discovery_format: input.discoveryFormat ?? null,
        language: input.language ?? null,
        duration_seconds: input.durationSeconds ?? null,
        quality_score: input.qualityScore ?? null,
        shorts_url: input.shortsUrl ?? null,
        image_url: input.imageUrl ?? null,
      });
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): SourceItem | null {
    const row = this.db.prepare('SELECT * FROM source_items WHERE id = ?').get(id);
    return row ? rowToSourceItem(row as Record<string, unknown>) : null;
  }

  linkCandidate(itemId: number, postId: number): void {
    this.db
      .prepare('UPDATE source_items SET candidate_post_id = ? WHERE id = ?')
      .run(postId, itemId);
  }

  createSkippedItem(input: SourceItemInput): SourceItem {
    return this.create({ ...input, skipReason: input.skipReason ?? 'low_quality' });
  }

  createCandidateWithPost(
    posts: PostRepository,
    itemInput: SourceItemInput,
    buildPostInput: (sourceItemId: number) => import('../types.js').CreatePostInput,
  ): { sourceItem: SourceItem; post: Post } {
    const txn = this.db.transaction(() => {
      const sourceItem = this.create(itemInput);
      const post = posts.create(buildPostInput(sourceItem.id));
      this.linkCandidate(sourceItem.id, post.id);
      return { sourceItem, post };
    });
    return txn();
  }
}

export function sourceTypeLabel(type: SourceType): string {
  switch (type) {
    case 'youtube_channel':
      return 'YouTube канал';
    case 'youtube_search':
      return 'YouTube поиск';
    case 'youtube_short_search':
      return 'YouTube Shorts поиск';
    case 'rss':
      return 'RSS';
    case 'rss_article':
      return 'RSS статьи';
    case 'rss_article_ru':
      return 'RSS RU статьи';
    case 'public_feed':
      return 'Public RSS/Atom';
    case 'pikabu_rss':
      return 'Pikabu RSS';
    case 'manual_source_link':
      return 'Ручная ссылка';
    case 'reddit':
      return 'Reddit';
    case 'reddit_subreddit':
      return 'Reddit subreddit';
    default:
      return type;
  }
}

export function sourceStatusLabel(enabled: number): string {
  return enabled ? 'активен' : 'на паузе';
}
