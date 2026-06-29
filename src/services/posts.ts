import type { Db } from '../db/connection.js';
import {
  InvalidTransitionError,
  PublishClaimError,
  type CreatePostInput,
  type Post,
  type PostStats,
  type PostStatus,
} from '../types.js';

const TERMINAL_STATUSES = new Set<PostStatus>(['posted', 'skipped', 'deleted', 'failed', 'missed']);

const VALID_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  pending: ['scheduled', 'posted', 'skipped', 'deleted'],
  scheduled: ['posted', 'failed', 'missed'],
  posted: [],
  skipped: [],
  deleted: [],
  failed: [],
  missed: [],
};

function nowIso(): string {
  return new Date().toISOString();
}

function rowToPost(row: Record<string, unknown>): Post {
  return row as unknown as Post;
}

export interface ClaimResult {
  post: Post;
  originalStatus: PostStatus;
}

export class PostRepository {
  constructor(private readonly db: Db) {}

  create(input: CreatePostInput): Post {
    const ts = nowIso();
    const stmt = this.db.prepare(`
      INSERT INTO posts (
        type, status, category, source_url, media_file_id, media_url,
        caption, raw_text, created_by, created_at, updated_at,
        poll_question, poll_options_json, scheduled_at,
        discovery_source_id, discovery_item_id, source_title, source_author,
        thumbnail_url, discovered_at, ai_score, risk_score, risk_reason, warnings,
        discovery_format, language, duration_seconds, quality_score,
        content_angle, publish_recommendation, shorts_url, pack_section, selected_for_today
      ) VALUES (
        @type, @status, @category, @source_url, @media_file_id, @media_url,
        @caption, @raw_text, @created_by, @created_at, @updated_at,
        @poll_question, @poll_options_json, @scheduled_at,
        @discovery_source_id, @discovery_item_id, @source_title, @source_author,
        @thumbnail_url, @discovered_at, @ai_score, @risk_score, @risk_reason, @warnings,
        @discovery_format, @language, @duration_seconds, @quality_score,
        @content_angle, @publish_recommendation, @shorts_url, @pack_section, @selected_for_today
      )
    `);
    const result = stmt.run({
      type: input.type,
      status: input.status ?? 'pending',
      category: input.category ?? null,
      source_url: input.source_url ?? null,
      media_file_id: input.media_file_id ?? null,
      media_url: input.media_url ?? null,
      caption: input.caption ?? null,
      raw_text: input.raw_text ?? null,
      created_by: input.created_by ?? null,
      created_at: ts,
      updated_at: ts,
      poll_question: input.poll_question ?? null,
      poll_options_json: input.poll_options_json ?? null,
      scheduled_at: input.scheduled_at ?? null,
      discovery_source_id: input.discovery_source_id ?? null,
      discovery_item_id: input.discovery_item_id ?? null,
      source_title: input.source_title ?? null,
      source_author: input.source_author ?? null,
      thumbnail_url: input.thumbnail_url ?? null,
      discovered_at: input.discovered_at ?? null,
      ai_score: input.ai_score ?? null,
      risk_score: input.risk_score ?? null,
      risk_reason: input.risk_reason ?? null,
      warnings: input.warnings ?? null,
      discovery_format: input.discovery_format ?? null,
      language: input.language ?? null,
      duration_seconds: input.duration_seconds ?? null,
      quality_score: input.quality_score ?? null,
      content_angle: input.content_angle ?? null,
      publish_recommendation: input.publish_recommendation ?? null,
      shorts_url: input.shorts_url ?? null,
      pack_section: input.pack_section ?? null,
      selected_for_today: input.selected_for_today ?? 0,
    });
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Post | null {
    const row = this.db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    return row ? rowToPost(row as Record<string, unknown>) : null;
  }

  update(id: number, fields: Partial<Post>): Post | null {
    const allowed = [
      'type', 'status', 'category', 'caption', 'raw_text', 'ai_score', 'risk_score',
      'risk_reason', 'warnings', 'scheduled_at', 'posted_at', 'telegram_message_id',
      'deleted_at', 'poll_question', 'poll_options_json', 'media_file_id', 'source_url',
      'last_error', 'publishing_started_at', 'media_url', 'discovery_format', 'language',
      'duration_seconds', 'quality_score', 'content_angle', 'publish_recommendation', 'shorts_url',
      'pack_section', 'selected_for_today',
    ] as const;

    const current = this.getById(id);
    if (!current) return null;

    if (fields.status && fields.status !== current.status) {
      this.assertTransition(current.status, fields.status);
    }

    const sets: string[] = [];
    const params: Record<string, unknown> = { id, updated_at: nowIso() };
    for (const key of allowed) {
      if (key in fields) {
        sets.push(`${key} = @${key}`);
        params[key] = fields[key as keyof Post];
      }
    }
    if (sets.length === 0) return current;
    sets.push('updated_at = @updated_at');
    this.db.prepare(`UPDATE posts SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return this.getById(id);
  }

  assertTransition(from: PostStatus, to: PostStatus): void {
    if (TERMINAL_STATUSES.has(from)) {
      throw new InvalidTransitionError(from, to);
    }
    if (!VALID_TRANSITIONS[from].includes(to)) {
      throw new InvalidTransitionError(from, to);
    }
  }

  countPending(): number {
    return this.countByStatus('pending');
  }

  countByStatus(status: PostStatus): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM posts WHERE status = ?')
      .get(status) as { cnt: number };
    return row.cnt;
  }

  getPendingPage(offset: number, limit = 1): Post[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM posts WHERE status = 'pending' ORDER BY created_at ASC LIMIT ? OFFSET ?`,
      )
      .all(limit, offset);
    return rows.map((r) => rowToPost(r as Record<string, unknown>));
  }

  getScheduled(limit = 10): Post[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM posts WHERE status = 'scheduled' AND scheduled_at IS NOT NULL
         ORDER BY scheduled_at ASC LIMIT ?`,
      )
      .all(limit);
    return rows.map((r) => rowToPost(r as Record<string, unknown>));
  }

  getPosted(limit = 10): Post[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM posts WHERE status = 'posted' ORDER BY posted_at DESC LIMIT ?`,
      )
      .all(limit);
    return rows.map((r) => rowToPost(r as Record<string, unknown>));
  }

  getDueScheduled(nowIso: string): Post[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM posts
         WHERE status = 'scheduled'
           AND scheduled_at <= ?
           AND publishing_started_at IS NULL
         ORDER BY scheduled_at ASC`,
      )
      .all(nowIso);
    return rows.map((r) => rowToPost(r as Record<string, unknown>));
  }

  claimPublishing(id: number): ClaimResult {
    const claim = this.db.transaction(() => {
      const existing = this.getById(id);
      if (!existing) {
        throw new PublishClaimError('Кандидат не найден');
      }
      if (existing.status === 'posted') {
        throw new PublishClaimError('Данный контент уже был опубликован');
      }
      if (existing.publishing_started_at) {
        throw new PublishClaimError('Публикация уже выполняется');
      }
      if (existing.status !== 'pending' && existing.status !== 'scheduled') {
        throw new PublishClaimError(`Публикация невозможна для статуса: ${existing.status}`);
      }

      const ts = nowIso();
      const result = this.db
        .prepare(
          `UPDATE posts SET publishing_started_at = ?, updated_at = ?
           WHERE id = ? AND status IN ('pending', 'scheduled') AND publishing_started_at IS NULL`,
        )
        .run(ts, ts, id);

      if (result.changes === 0) {
        const refreshed = this.getById(id);
        if (refreshed?.status === 'posted') {
          throw new PublishClaimError('Данный контент уже был опубликован');
        }
        throw new PublishClaimError('Публикация уже выполняется');
      }

      return { post: this.getById(id)!, originalStatus: existing.status };
    });

    return claim();
  }

  markPosted(id: number, messageId: number): Post {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `UPDATE posts SET status = 'posted', telegram_message_id = ?, posted_at = ?,
         last_error = NULL, publishing_started_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(messageId, ts, ts, id);
    if (result.changes === 0) throw new Error(`Post ${id} not found`);
    return this.getById(id)!;
  }

  releasePublishingAfterManualFailure(
    id: number,
    originalStatus: PostStatus,
    error: string,
  ): Post {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `UPDATE posts SET status = ?, last_error = ?, publishing_started_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(originalStatus, error, ts, id);
    if (result.changes === 0) throw new Error(`Post ${id} not found`);
    return this.getById(id)!;
  }

  markScheduledPublishFailed(id: number, error: string): Post {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `UPDATE posts SET status = 'failed', last_error = ?, publishing_started_at = NULL, updated_at = ?
         WHERE id = ?`,
      )
      .run(error, ts, id);
    if (result.changes === 0) throw new Error(`Post ${id} not found`);
    return this.getById(id)!;
  }

  recoverStalePublishingClaims(olderThanMinutes: number): Post[] {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000).toISOString();
    const stale = this.db
      .prepare(
        `SELECT * FROM posts WHERE publishing_started_at IS NOT NULL AND publishing_started_at < ?`,
      )
      .all(cutoff) as Record<string, unknown>[];

    const recovered: Post[] = [];
    const ts = nowIso();
    const errorMsg = 'Публикация прервана из-за перезапуска бота. Повторите вручную.';

    for (const row of stale) {
      const post = rowToPost(row);
      this.db
        .prepare(
          `UPDATE posts SET publishing_started_at = NULL, last_error = ?, updated_at = ?
           WHERE id = ?`,
        )
        .run(errorMsg, ts, post.id);
      recovered.push({ ...post, last_error: errorMsg, publishing_started_at: null });
    }
    return recovered;
  }

  getStats(): PostStats {
    const statuses: PostStatus[] = [
      'pending', 'scheduled', 'posted', 'skipped', 'deleted', 'failed', 'missed',
    ];
    const byStatus = {} as Record<PostStatus, number>;
    for (const s of statuses) {
      byStatus[s] = this.countByStatus(s);
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const today = (
      this.db
        .prepare(`SELECT COUNT(*) as cnt FROM posts WHERE status = 'posted' AND posted_at >= ?`)
        .get(todayStart.toISOString()) as { cnt: number }
    ).cnt;

    const last7Days = (
      this.db
        .prepare(`SELECT COUNT(*) as cnt FROM posts WHERE status = 'posted' AND posted_at >= ?`)
        .get(sevenDaysAgo.toISOString()) as { cnt: number }
    ).cnt;

    return { byStatus, today, last7Days, allTime: byStatus.posted };
  }

  findRecentPendingSince(sinceIso: string, excludePostIds: number[] = []): Post[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM posts WHERE status = 'pending'
         AND datetime(created_at) >= datetime(@since)
         ORDER BY COALESCE(quality_score, 0) DESC, created_at DESC`,
      )
      .all({ since: sinceIso }) as Record<string, unknown>[];
    const excluded = new Set(excludePostIds);
    return rows
      .map((r) => rowToPost(r))
      .filter((p) => !excluded.has(p.id));
  }

  listPendingInPack(packId: number): number[] {
    const rows = this.db
      .prepare('SELECT post_id FROM content_pack_items WHERE pack_id = ?')
      .all(packId) as Array<{ post_id: number }>;
    return rows.map((r) => r.post_id);
  }
}
