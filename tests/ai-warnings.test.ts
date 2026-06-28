import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AiModule, evaluateNewPostInBackground } from '../src/ai/module.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { PostRepository } from '../src/services/posts.js';
import type { Warning } from '../src/types.js';

describe('AI warning merge', () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;
  let posts: PostRepository;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `ai-test-${Date.now()}.db`);
    db = openDatabase(dbPath);
    initSchema(db);
    posts = new PostRepository(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('appends risk warning without deleting existing keyword warnings', async () => {
    const existingWarnings: Warning[] = [
      {
        type: 'category',
        category: 'политика',
        message: 'Обнаружена запрещённая категория: политика',
      },
    ];
    const post = posts.create({
      type: 'text',
      caption: 'test content',
    });
    posts.update(post.id, { warnings: JSON.stringify(existingWarnings) });

    const ai = {
      scoreContent: vi.fn().mockResolvedValue(8),
      assessRisk: vi.fn().mockResolvedValue({ riskScore: 8, riskReason: 'опасный контент' }),
      classify: vi.fn().mockResolvedValue('dating_meme'),
    } as unknown as AiModule;

    evaluateNewPostInBackground(ai, posts, post.id, 'test content');

    await vi.waitFor(() => {
      const updated = posts.getById(post.id)!;
      expect(updated.warnings).toBeTruthy();
      const warnings = JSON.parse(updated.warnings!) as Warning[];
      expect(warnings).toHaveLength(2);
      expect(warnings[0].message).toContain('политика');
      expect(warnings[1].type).toBe('risk_score');
      expect(warnings[1].message).toContain('Риск: 8/10');
    });
  });
});
