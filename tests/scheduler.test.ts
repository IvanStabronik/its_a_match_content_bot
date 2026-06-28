import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Bot } from 'grammy';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { PostRepository } from '../src/services/posts.js';
import { PublisherService } from '../src/services/publisher.js';
import { SchedulerService } from '../src/services/scheduler.js';

function callTick(scheduler: SchedulerService, bot: Bot): void {
  (scheduler as unknown as { tick(bot: Bot): void }).tick(bot);
}

describe('SchedulerService dispatch', () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;
  let posts: PostRepository;
  let publishScheduled: ReturnType<typeof vi.fn>;
  let publisher: PublisherService;
  let scheduler: SchedulerService;
  let bot: Bot;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `sched-test-${Date.now()}.db`);
    db = openDatabase(dbPath);
    initSchema(db);
    posts = new PostRepository(db);

    publishScheduled = vi.fn();
    publisher = { publishScheduled } as unknown as PublisherService;
    scheduler = new SchedulerService(posts, publisher, [111], 'Europe/Warsaw');
    bot = { api: { sendMessage: vi.fn().mockResolvedValue({}) } } as unknown as Bot;
  });

  afterEach(() => {
    scheduler.stop();
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('dispatches two due posts without waiting for the first long retry cycle', async () => {
    const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const post1 = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'one',
    });
    const post2 = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'two',
    });

    let releaseFirst!: () => void;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const dispatchOrder: number[] = [];
    publishScheduled.mockImplementation(async (_api, postId: number) => {
      dispatchOrder.push(postId);
      if (postId === post1.id) {
        await firstBlocked;
      }
    });

    callTick(scheduler, bot);
    await vi.waitFor(() => expect(dispatchOrder).toEqual([post1.id, post2.id]));

    releaseFirst();
    await vi.waitFor(() => expect(publishScheduled).toHaveBeenCalledTimes(2));
  });

  it('does not dispatch posts with an active publishing claim', async () => {
    const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const claimed = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'claimed',
    });
    const due = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'due',
    });

    posts.claimPublishing(claimed.id);

    callTick(scheduler, bot);
    await vi.waitFor(() => expect(publishScheduled).toHaveBeenCalledTimes(1));
    expect(publishScheduled).toHaveBeenCalledWith(bot.api, due.id, bot, [111]);
  });
});
