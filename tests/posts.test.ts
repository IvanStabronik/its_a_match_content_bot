import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { PostRepository } from '../src/services/posts.js';
import { PublishClaimError } from '../src/types.js';

describe('PostRepository', () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;
  let posts: PostRepository;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `test-${Date.now()}.db`);
    db = openDatabase(dbPath);
    initSchema(db);
    posts = new PostRepository(db);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('getDueScheduled excludes future and claimed posts', () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const past = new Date(Date.now() - 60 * 1000).toISOString();

    posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: future,
      caption: 'future',
    });
    const due = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'due',
    });
    const claimedPost = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'claimed',
    });
    posts.claimPublishing(claimedPost.id);

    const now = new Date().toISOString();
    const result = posts.getDueScheduled(now);
    const ids = result.map((p) => p.id);

    expect(ids).toContain(due.id);
    expect(ids).not.toContain(claimedPost.id);
    expect(result.every((p) => p.scheduled_at! <= now)).toBe(true);
  });

  it('claimPublishing rejects already posted', () => {
    const post = posts.create({ type: 'text', caption: 'x' });
    posts.markPosted(post.id, 123);
    expect(() => posts.claimPublishing(post.id)).toThrow(PublishClaimError);
  });

  it('releasePublishingAfterManualFailure restores status', () => {
    const post = posts.create({ type: 'text', caption: 'x' });
    posts.claimPublishing(post.id);
    posts.releasePublishingAfterManualFailure(post.id, 'pending', 'test error');
    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('pending');
    expect(updated.last_error).toBe('test error');
    expect(updated.publishing_started_at).toBeNull();
  });

  it('recoverStalePublishingClaims clears claim without changing status', () => {
    const post = posts.create({ type: 'text', caption: 'x', status: 'scheduled', scheduled_at: new Date().toISOString() });
    db.prepare(`UPDATE posts SET publishing_started_at = ? WHERE id = ?`).run(
      new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      post.id,
    );
    const recovered = posts.recoverStalePublishingClaims(10);
    expect(recovered).toHaveLength(1);
    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('scheduled');
    expect(updated.publishing_started_at).toBeNull();
    expect(updated.last_error).toBeTruthy();
  });
});
