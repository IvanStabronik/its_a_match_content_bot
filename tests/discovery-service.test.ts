import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AiModule } from '../src/ai/module.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { DiscoveryService, buildTemplateCaption } from '../src/discovery/service.js';
import type { DiscoveredItem } from '../src/discovery/types.js';
import type { AppConfig } from '../src/config.js';
import { PostRepository } from '../src/services/posts.js';
import { SourceItemRepository, SourceRepository } from '../src/services/sources.js';
import * as youtubeAdapter from '../src/discovery/adapters/youtube.js';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    contentBotToken: 'token',
    adminTelegramIds: [1],
    channelUsername: 'testchannel',
    openaiApiKey: null,
    mainBotUsername: null,
    databasePath: ':memory:',
    backupDir: '/tmp',
    timezone: 'Europe/Warsaw',
    youtubeApiKey: null,
    discoveryEnabled: true,
    discoveryIntervalMinutes: 360,
    discoveryMaxItemsPerSource: 5,
    discoveryLookbackHours: 168,
    discoveryMinScore: 0,
    discoveryAutoCreateCandidates: true,
    ...overrides,
  };
}

const sampleItem: DiscoveredItem = {
  platform: 'rss',
  externalId: 'item-1',
  url: 'https://example.com/a',
  title: 'Dating tips',
  description: 'About relationships',
  author: 'Blog',
  publishedAt: new Date().toISOString(),
  thumbnailUrl: null,
  raw: {},
};

describe('DiscoveryService', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const f of tmpFiles) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  function setupDb() {
    const dbPath = path.join(os.tmpdir(), `disc-${Date.now()}-${Math.random()}.db`);
    tmpFiles.push(dbPath);
    const db = openDatabase(dbPath);
    initSchema(db);
    return {
      db,
      posts: new PostRepository(db),
      sources: new SourceRepository(db),
      sourceItems: new SourceItemRepository(db),
    };
  }

  function svc(discovery: DiscoveryService) {
    return discovery as unknown as {
      createCandidate: (
        source: ReturnType<SourceRepository['create']>,
        item: DiscoveredItem,
        warnings: [],
      ) => Promise<'created' | 'duplicate' | 'skipped_low_score'>;
      processSource: (source: ReturnType<SourceRepository['create']>) => Promise<unknown>;
    };
  }

  it('creates pending link candidate from discovered item', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);

    expect(await svc(discovery).createCandidate(source, sampleItem, [])).toBe('created');
    const pending = posts.getPendingPage(0, 10);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('link');
    expect(pending[0].status).toBe('pending');
    expect(pending[0].source_url).toBe(sampleItem.url);
    expect(pending[0].discovery_source_id).toBe(source.id);

    const stored = sourceItems.findByPlatformExternalId('rss', 'item-1');
    expect(stored?.candidate_post_id).toBe(pending[0].id);
  });

  it('skips duplicate platform+external_id', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);
    const service = svc(discovery);

    expect(await service.createCandidate(source, sampleItem, [])).toBe('created');
    expect(await service.createCandidate(source, sampleItem, [])).toBe('duplicate');
    expect(posts.countPending()).toBe(1);
  });

  it('persists low-score items in source_items without creating posts', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const ai = {
      generateDiscoveryCaption: vi.fn().mockResolvedValue({
        caption: 'A'.repeat(60),
        category: 'link',
        aiScore: 3,
        riskScore: 2,
        riskReason: 'ok',
        warnings: [],
      }),
    } as unknown as AiModule;

    const discovery = new DiscoveryService(
      sources,
      sourceItems,
      posts,
      makeConfig({ discoveryMinScore: 5 }),
      ai,
    );
    const service = svc(discovery);

    expect(await service.createCandidate(source, sampleItem, [])).toBe('skipped_low_score');
    expect(posts.countPending()).toBe(0);

    const stored = sourceItems.findByPlatformExternalId('rss', 'item-1');
    expect(stored).not.toBeNull();
    expect(stored?.candidate_post_id).toBeNull();

    expect(await service.createCandidate(source, sampleItem, [])).toBe('duplicate');
    expect(posts.countPending()).toBe(0);
  });

  it('rolls back source_items when post creation fails', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);

    vi.spyOn(posts, 'create').mockImplementation(() => {
      throw new Error('post insert failed');
    });

    await expect(svc(discovery).createCandidate(source, sampleItem, [])).rejects.toThrow(
      'post insert failed',
    );
    expect(sourceItems.findByPlatformExternalId('rss', 'item-1')).toBeNull();
    expect(posts.countPending()).toBe(0);
  });

  it('never auto-publishes discovered candidates', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);
    await svc(discovery).createCandidate(source, sampleItem, []);
    expect(posts.countByStatus('posted')).toBe(0);
    expect(posts.countByStatus('pending')).toBe(1);
  });

  it('uses template caption when AI is disabled', () => {
    const caption = buildTemplateCaption(sampleItem);
    expect(caption).toContain('Нашёл материал');
    expect(caption).toContain('Dating tips');
    expect(caption).toContain('Что думаете?');
  });

  it('persists resolved YouTube channelId before fetch', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'youtube_channel',
      name: 'YT',
      config: { input: '@mychannel' },
    });

    vi.spyOn(youtubeAdapter, 'resolveChannelId').mockResolvedValue('UCresolvedchannelid00');
    vi.spyOn(youtubeAdapter.youtubeChannelAdapter, 'fetchRecentItems').mockResolvedValue([]);

    const discovery = new DiscoveryService(
      sources,
      sourceItems,
      posts,
      makeConfig({ youtubeApiKey: 'test-key' }),
      null,
    );

    await svc(discovery).processSource(source);

    const updated = sources.getById(source.id)!;
    const config = sources.getConfig(updated);
    expect(config.channelId).toBe('UCresolvedchannelid00');
    expect(youtubeAdapter.resolveChannelId).toHaveBeenCalled();
  });
});

describe('SourceItemRepository dedupe', () => {
  const dedupeTmpFiles: string[] = [];

  afterEach(() => {
    for (const f of dedupeTmpFiles.splice(0)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  it('enforces unique platform+external_id', () => {
    const dbPath = path.join(os.tmpdir(), `si-${Date.now()}.db`);
    dedupeTmpFiles.push(dbPath);
    const db = openDatabase(dbPath);
    initSchema(db);
    const sources = new SourceRepository(db);
    const items = new SourceItemRepository(db);
    const source = sources.create({ type: 'rss', name: 'R', config: { feedUrl: 'x' } });

    items.create({
      sourceId: source.id,
      platform: 'rss',
      externalId: 'abc',
      url: 'https://a.com',
    });

    expect(() =>
      items.create({
        sourceId: source.id,
        platform: 'rss',
        externalId: 'abc',
        url: 'https://b.com',
      }),
    ).toThrow();
  });
});
