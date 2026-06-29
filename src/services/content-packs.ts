import type { Db } from '../db/connection.js';
import type {
  ContentPack,
  ContentPackItem,
  ContentPackStatus,
  PackSection,
  PackSummary,
  SectionBreakdown,
} from '../types.js';
import { classifyPostForSection } from './pack-diagnostics.js';
import type { PostRepository } from './posts.js';

function nowIso(): string {
  return new Date().toISOString();
}

function rowToPack(row: Record<string, unknown>): ContentPack {
  return row as unknown as ContentPack;
}

function rowToItem(row: Record<string, unknown>): ContentPackItem {
  return row as unknown as ContentPackItem;
}

export class ContentPackRepository {
  constructor(private readonly db: Db) {}

  getByDate(packDate: string): ContentPack | null {
    const row = this.db.prepare('SELECT * FROM content_packs WHERE pack_date = ?').get(packDate);
    return row ? rowToPack(row as Record<string, unknown>) : null;
  }

  getById(id: number): ContentPack | null {
    const row = this.db.prepare('SELECT * FROM content_packs WHERE id = ?').get(id);
    return row ? rowToPack(row as Record<string, unknown>) : null;
  }

  create(packDate: string): ContentPack {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO content_packs (pack_date, status, created_at, updated_at)
         VALUES (?, 'draft', ?, ?)`,
      )
      .run(packDate, ts, ts);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  createOrGet(packDate: string): ContentPack {
    return this.getByDate(packDate) ?? this.create(packDate);
  }

  update(
    id: number,
    fields: Partial<
      Pick<
        ContentPack,
        'status' | 'generated_at' | 'notified_at' | 'summary_json' | 'diagnostics_json' | 'last_error'
      >
    >,
  ): ContentPack {
    const sets: string[] = ['updated_at = @updated_at'];
    const params: Record<string, unknown> = { id, updated_at: nowIso() };
    for (const key of [
      'status',
      'generated_at',
      'notified_at',
      'summary_json',
      'diagnostics_json',
      'last_error',
    ] as const) {
      if (key in fields) {
        sets.push(`${key} = @${key}`);
        params[key] = fields[key] ?? null;
      }
    }
    this.db.prepare(`UPDATE content_packs SET ${sets.join(', ')} WHERE id = @id`).run(params);
    return this.getById(id)!;
  }

  clearItems(packId: number): void {
    this.db.prepare('DELETE FROM content_pack_items WHERE pack_id = ?').run(packId);
  }

  addItem(
    packId: number,
    postId: number,
    section: PackSection,
    position: number,
  ): ContentPackItem {
    const ts = nowIso();
    const result = this.db
      .prepare(
        `INSERT INTO content_pack_items (pack_id, post_id, section, selected, position, created_at)
         VALUES (?, ?, ?, 0, ?, ?)`,
      )
      .run(packId, postId, section, position, ts);
    return this.getItemById(Number(result.lastInsertRowid))!;
  }

  getItemById(id: number): ContentPackItem | null {
    const row = this.db.prepare('SELECT * FROM content_pack_items WHERE id = ?').get(id);
    return row ? rowToItem(row as Record<string, unknown>) : null;
  }

  getItemByPostId(packId: number, postId: number): ContentPackItem | null {
    const row = this.db
      .prepare('SELECT * FROM content_pack_items WHERE pack_id = ? AND post_id = ?')
      .get(packId, postId);
    return row ? rowToItem(row as Record<string, unknown>) : null;
  }

  listItemsBySection(packId: number, section: PackSection): ContentPackItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM content_pack_items WHERE pack_id = ? AND section = ?
         ORDER BY position ASC, id ASC`,
      )
      .all(packId, section);
    return rows.map((r) => rowToItem(r as Record<string, unknown>));
  }

  listAllItems(packId: number): ContentPackItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM content_pack_items WHERE pack_id = ? ORDER BY section, position ASC, id ASC`,
      )
      .all(packId);
    return rows.map((r) => rowToItem(r as Record<string, unknown>));
  }

  listSelectedItems(packId: number): ContentPackItem[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM content_pack_items WHERE pack_id = ? AND selected = 1
         ORDER BY section, position ASC, id ASC`,
      )
      .all(packId);
    return rows.map((r) => rowToItem(r as Record<string, unknown>));
  }

  setSelected(packId: number, postId: number, selected: boolean): ContentPackItem | null {
    this.db
      .prepare(
        `UPDATE content_pack_items SET selected = ? WHERE pack_id = ? AND post_id = ?`,
      )
      .run(selected ? 1 : 0, packId, postId);
    return this.getItemByPostId(packId, postId);
  }

  countSelected(packId: number): number {
    const row = this.db
      .prepare('SELECT COUNT(*) as cnt FROM content_pack_items WHERE pack_id = ? AND selected = 1')
      .get(packId) as { cnt: number };
    return row.cnt;
  }

  countBySection(packId: number): Record<PackSection, number> {
    const rows = this.db
      .prepare(
        `SELECT section, COUNT(*) as cnt FROM content_pack_items WHERE pack_id = ?
         GROUP BY section`,
      )
      .all(packId) as Array<{ section: PackSection; cnt: number }>;
    const counts: Record<PackSection, number> = {
      videos: 0,
      memes: 0,
      articles: 0,
      polls: 0,
      ideas: 0,
      other: 0,
    };
    for (const row of rows) counts[row.section] = row.cnt;
    return counts;
  }

  buildSummary(packId: number): PackSummary {
    const counts = this.countBySection(packId);
    const selected = this.countSelected(packId);
    const total =
      counts.videos + counts.memes + counts.articles + counts.polls + counts.ideas + counts.other;
    return { ...counts, selected, total };
  }

  buildDetailedSummary(packId: number, posts: PostRepository): PackSummary {
    const base = this.buildSummary(packId);
    const items = this.listAllItems(packId);
    const breakdown: Partial<Record<PackSection, SectionBreakdown>> = {};

    for (const section of ['videos', 'memes', 'articles', 'polls', 'ideas'] as PackSection[]) {
      const sectionItems = items.filter((i) => i.section === section);
      let real = 0;
      let backfill = 0;
      for (const item of sectionItems) {
        const post = posts.getById(item.post_id);
        if (!post) continue;
        if (classifyPostForSection(post, section) === 'real') real++;
        else backfill++;
      }
      breakdown[section] = { total: sectionItems.length, real, backfill };
    }

    return { ...base, breakdown };
  }

  markScheduled(packId: number): void {
    this.update(packId, { status: 'scheduled' as ContentPackStatus });
  }
}
