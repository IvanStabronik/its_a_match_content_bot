import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Bot } from 'grammy';
import type { Api, RawApi } from 'grammy';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { PublisherService } from '../src/services/publisher.js';
import { PostRepository } from '../src/services/posts.js';
import { sendByType } from '../src/services/telegram.js';

vi.mock('../src/services/telegram.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/telegram.js')>();
  return {
    ...actual,
    sendByType: vi.fn(),
  };
});

const mockedSendByType = vi.mocked(sendByType);
const api = {} as Api<RawApi>;

describe('PublisherService duplicate-safety', () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;
  let posts: PostRepository;
  let publisher: PublisherService;

  beforeEach(() => {
    vi.clearAllMocks();
    dbPath = path.join(os.tmpdir(), `pub-test-${Date.now()}.db`);
    db = openDatabase(dbPath);
    initSchema(db);
    posts = new PostRepository(db);
    publisher = new PublisherService(posts, 'testchannel');
  });

  afterEach(() => {
    vi.useRealTimers();
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('manual publish: channel send once when admin notification fails', async () => {
    const post = posts.create({ type: 'text', caption: 'hello' });
    mockedSendByType.mockResolvedValue(1001);

    const bot = {
      api: {
        sendMessage: vi.fn().mockRejectedValue(new Error('notify fail')),
      },
    } as unknown as Bot;

    const result = await publisher.publishManual(api, post.id, 999, bot);

    expect(mockedSendByType).toHaveBeenCalledTimes(1);
    expect(result.post.status).toBe('posted');
    expect(posts.getById(post.id)!.telegram_message_id).toBe(1001);
  });

  it('scheduled publish: channel send once when admin notification fails', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const post = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'scheduled',
    });
    mockedSendByType.mockResolvedValue(2002);

    const bot = {
      api: {
        sendMessage: vi.fn().mockRejectedValue(new Error('notify fail')),
      },
    } as unknown as Bot;

    await publisher.publishScheduled(api, post.id, bot, [111, 222]);

    expect(mockedSendByType).toHaveBeenCalledTimes(1);
    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('posted');
    expect(updated.telegram_message_id).toBe(2002);
  });

  it('manual publish: restores pending status after 3 failed sends', async () => {
    const post = posts.create({ type: 'text', caption: 'fail me' });
    mockedSendByType.mockRejectedValue(new Error('send fail'));

    vi.useFakeTimers();
    const promise = publisher.publishManual(api, post.id);
    const assertion = expect(promise).rejects.toThrow('send fail');
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockedSendByType).toHaveBeenCalledTimes(3);

    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('pending');
    expect(updated.last_error).toBe('send fail');
    expect(updated.publishing_started_at).toBeNull();
  });

  it('manual publish: restores scheduled status after 3 failed sends', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const post = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'scheduled fail',
    });
    mockedSendByType.mockRejectedValue(new Error('scheduled send fail'));

    vi.useFakeTimers();
    const promise = publisher.publishManual(api, post.id);
    const assertion = expect(promise).rejects.toThrow('scheduled send fail');
    await vi.runAllTimersAsync();
    await assertion;
    expect(mockedSendByType).toHaveBeenCalledTimes(3);

    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('scheduled');
    expect(updated.last_error).toBe('scheduled send fail');
    expect(updated.publishing_started_at).toBeNull();
  });

  it('scheduled publish: marks failed after 3 failed sends', async () => {
    const past = new Date(Date.now() - 60 * 1000).toISOString();
    const post = posts.create({
      type: 'text',
      status: 'scheduled',
      scheduled_at: past,
      caption: 'scheduled fail',
    });
    mockedSendByType.mockRejectedValue(new Error('scheduled send fail'));

    const bot = {
      api: { sendMessage: vi.fn().mockResolvedValue({}) },
    } as unknown as Bot;

    vi.useFakeTimers();
    const promise = publisher.publishScheduled(api, post.id, bot, [111]);
    await vi.runAllTimersAsync();
    await promise;

    expect(mockedSendByType).toHaveBeenCalledTimes(3);

    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('failed');
    expect(updated.last_error).toBe('scheduled send fail');
    expect(updated.publishing_started_at).toBeNull();
  });
});
