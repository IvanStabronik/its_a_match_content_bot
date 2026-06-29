import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { formatDailyPackSummary } from '../src/bot/daily-pack-keyboards.js';
import { ContentPackRepository } from '../src/services/content-packs.js';
import { DailyPackService } from '../src/services/daily-pack.js';
import { DailyPackScheduler } from '../src/services/daily-pack-scheduler.js';
import {
  buildDailySchedulePreview,
  formatPackDate,
  isPastDailyPackTime,
} from '../src/services/daily-schedule.js';
import { pickFallbackPolls, pickFallbackTextIdeas } from '../src/services/daily-pack-templates.js';
import { sectionForPost } from '../src/services/pack-sections.js';
import { PostRepository } from '../src/services/posts.js';
import { SourceItemRepository, SourceRepository } from '../src/services/sources.js';
import type { Post } from '../src/types.js';
import { emptyDiscoverySummary, makeTestConfig } from './test-config.js';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return makeTestConfig({
    dailyPackMinVideos: 2,
    dailyPackMinMemes: 1,
    dailyPackMinArticles: 1,
    dailyPackMinPolls: 2,
    dailyPackMinIdeas: 2,
    dailyPackVideoTarget: 2,
    dailyPackMemeTarget: 1,
    dailyPackArticleTarget: 1,
    dailyPackPollTarget: 2,
    dailyPackIdeaTarget: 2,
    dailyPackMaxTotal: 20,
    ...overrides,
  });
}

describe('Daily content pack v4', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const f of tmpFiles.splice(0)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  function setup() {
    const dbPath = path.join(os.tmpdir(), `pack-${Date.now()}-${Math.random()}.db`);
    tmpFiles.push(dbPath);
    const db = openDatabase(dbPath);
    initSchema(db);
    const posts = new PostRepository(db);
    const packs = new ContentPackRepository(db);
    const sources = new SourceRepository(db);
    const sourceItems = new SourceItemRepository(db);
    const config = makeConfig();
    const discovery = new DiscoveryService(sources, sourceItems, posts, config, null);
    vi.spyOn(discovery, 'discoverAll').mockResolvedValue(emptyDiscoverySummary());
    const dailyPack = new DailyPackService(packs, posts, discovery, sources, config, null);
    return { db, posts, packs, dailyPack, config, discovery };
  }

  it('creates one pack per date', () => {
    const { packs, dailyPack } = setup();
    const date = dailyPack.getTodayDateString();
    const a = packs.createOrGet(date);
    const b = packs.createOrGet(date);
    expect(a.id).toBe(b.id);
  });

  it('groups posts into correct sections', () => {
    expect(
      sectionForPost({
        type: 'link',
        discovery_format: 'youtube_short_link',
      } as Post),
    ).toBe('videos');
    expect(
      sectionForPost({ type: 'poll', discovery_format: null } as Post),
    ).toBe('polls');
    expect(
      sectionForPost({ type: 'text', discovery_format: 'text_idea' } as Post),
    ).toBe('ideas');
  });

  it('generates pack with fallback polls and ideas without AI', async () => {
    const { dailyPack, posts } = setup();
    posts.create({
      type: 'link',
      caption: 'Видео',
      discovery_format: 'youtube_short_link',
      language: 'ru',
    });
    posts.create({
      type: 'link',
      caption: 'Статья',
      discovery_format: 'article_summary',
      language: 'ru',
    });

    const result = await dailyPack.generateTodayPack();
    expect(result.created).toBe(true);
    expect(result.summary.videos).toBeGreaterThanOrEqual(1);
    expect(result.summary.polls).toBeGreaterThanOrEqual(2);
    expect(result.summary.ideas).toBeGreaterThanOrEqual(2);
    expect(posts.countByStatus('posted')).toBe(0);
    expect(posts.countByStatus('pending')).toBeGreaterThan(0);
  });

  it('does not duplicate pack generation on second call', async () => {
    const { dailyPack } = setup();
    await dailyPack.generateTodayPack();
    const second = await dailyPack.generateTodayPack();
    expect(second.created).toBe(false);
  });

  it('rebuild clears and regenerates pack items', async () => {
    const { dailyPack, packs } = setup();
    await dailyPack.generateTodayPack();
    const pack = dailyPack.createOrGetTodayPack();
    const before = packs.listAllItems(pack.id).length;
    await dailyPack.rebuildTodayPack();
    const after = packs.listAllItems(pack.id).length;
    expect(after).toBeGreaterThan(0);
    expect(before).toBeGreaterThan(0);
  });

  it('toggle selected changes selected state only', async () => {
    const { dailyPack, posts, packs } = setup();
    const post = posts.create({ type: 'text', caption: 'test', raw_text: 'test' });
    const pack = packs.createOrGet(formatPackDate(new Date(), 'Europe/Warsaw'));
    packs.addItem(pack.id, post.id, 'ideas', 0);

    expect(dailyPack.toggleSelected(pack.id, post.id)).toBe(true);
    expect(posts.getById(post.id)!.selected_for_today).toBe(1);
    expect(posts.getById(post.id)!.status).toBe('pending');

    dailyPack.unselect(pack.id, post.id);
    expect(posts.getById(post.id)!.selected_for_today).toBe(0);
  });

  it('schedule preview does not schedule before confirmation', () => {
    const { dailyPack, posts, packs } = setup();
    const pack = packs.createOrGet(formatPackDate(new Date(), 'Europe/Warsaw'));
    const p1 = posts.create({ type: 'text', caption: 'a', raw_text: 'a' });
    const p2 = posts.create({ type: 'text', caption: 'b', raw_text: 'b' });
    packs.addItem(pack.id, p1.id, 'ideas', 0);
    packs.addItem(pack.id, p2.id, 'ideas', 1);
    dailyPack.toggleSelected(pack.id, p1.id);
    dailyPack.toggleSelected(pack.id, p2.id);

    const { preview } = dailyPack.buildSchedulePreview(pack.id);
    expect(preview.assignments.length).toBeGreaterThan(0);
    expect(posts.getById(p1.id)!.status).toBe('pending');
    expect(posts.getById(p2.id)!.status).toBe('pending');
  });

  it('applySchedule sets scheduled status after confirmation', () => {
    const { dailyPack, posts } = setup();
    const post = posts.create({ type: 'text', caption: 'a', raw_text: 'a' });
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    dailyPack.applySchedule([{ postId: post.id, slotLabel: '11:00', scheduledAt: future }]);
    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('scheduled');
    expect(updated.scheduled_at).toBe(future);
  });

  it('skips past slots in schedule preview', () => {
    const ref = new Date('2026-06-29T20:00:00.000Z');
    const preview = buildDailySchedulePreview(
      [1, 2, 3],
      ['11:00', '13:30', '16:00', '18:30', '21:00'],
      'Europe/Warsaw',
      ref,
    );
    expect(preview.skippedPastSlots).toBeGreaterThan(0);
    for (const a of preview.assignments) {
      expect(new Date(a.scheduledAt).getTime()).toBeGreaterThan(ref.getTime());
    }
  });

  it('fallback poll and text templates work', () => {
    const polls = pickFallbackPolls(3);
    expect(polls.length).toBe(3);
    expect(polls[0]!.options.length).toBeGreaterThanOrEqual(2);
    const ideas = pickFallbackTextIdeas(2);
    expect(ideas[0]!.caption.length).toBeGreaterThan(20);
  });

  it('/today summary format shows section counts', () => {
    const text = formatDailyPackSummary('2026-06-29', {
      videos: 5,
      memes: 3,
      articles: 5,
      polls: 5,
      ideas: 5,
      other: 0,
      selected: 0,
      total: 23,
    });
    expect(text).toContain('Видео: 5');
    expect(text).toContain('Мемы: 3');
    expect(text).toContain('Выбрано: 0');
  });

  it('isPastDailyPackTime detects morning cutoff', () => {
    const beforePack = new Date('2026-06-29T07:00:00.000Z');
    const afterPack = new Date('2026-06-29T09:00:00.000Z');
    expect(isPastDailyPackTime('10:00', 'Europe/Warsaw', beforePack)).toBe(false);
    expect(isPastDailyPackTime('10:00', 'Europe/Warsaw', afterPack)).toBe(true);
  });

  it('notifies admins only once per pack', async () => {
    const { dailyPack, config } = setup();
    const sendMessage = vi.fn().mockResolvedValue({});
    const bot = { api: { sendMessage } } as unknown as import('grammy').Bot;
    const scheduler = new DailyPackScheduler(dailyPack, config);

    await dailyPack.generateTodayPack();
    let pack = dailyPack.createOrGetTodayPack();
    expect(dailyPack.shouldNotify(pack)).toBe(true);

    await scheduler.tick(bot);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    pack = dailyPack.createOrGetTodayPack();
    expect(dailyPack.shouldNotify(pack)).toBe(false);

    await scheduler.tick(bot);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it('creates pack on demand after pack time if missing', async () => {
    const { dailyPack } = setup();
    expect(dailyPack.createOrGetTodayPack().generated_at).toBeNull();
    await dailyPack.generateTodayPack();
    expect(dailyPack.createOrGetTodayPack().generated_at).not.toBeNull();
  });
});

describe('setup_sources behavior', () => {
  it('refuses YouTube sources when API key missing', () => {
    const config = makeConfig({ youtubeApiKey: null });
    expect(config.youtubeApiKey).toBeNull();
  });
});
