import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { DiscoveryService, buildTemplateCaption } from '../src/discovery/service.js';
import type { DiscoveredItem } from '../src/discovery/types.js';
import type { AppConfig } from '../src/config.js';
import { PostRepository } from '../src/services/posts.js';
import { SourceItemRepository, SourceRepository } from '../src/services/sources.js';

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

  it('creates pending link candidate from discovered item', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);

    const created = await (
      discovery as unknown as {
        createCandidate: (
          source: typeof source,
          item: DiscoveredItem,
          warnings: [],
        ) => Promise<boolean>;
      }
    ).createCandidate(source, sampleItem, []);

    expect(created).toBe(true);
    const pending = posts.getPendingPage(0, 10);
    expect(pending).toHaveLength(1);
    expect(pending[0].type).toBe('link');
    expect(pending[0].status).toBe('pending');
    expect(pending[0].source_url).toBe(sampleItem.url);
    expect(pending[0].discovery_source_id).toBe(source.id);
    expect(pending[0].caption).toContain('Dating tips');
  });

  it('skips duplicate platform+external_id', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);
    const svc = discovery as unknown as {
      createCandidate: (s: typeof source, i: DiscoveredItem, w: []) => Promise<boolean>;
    };

    expect(await svc.createCandidate(source, sampleItem, [])).toBe(true);
    expect(await svc.createCandidate(source, sampleItem, [])).toBe(false);
    expect(posts.countPending()).toBe(1);
  });

  it('never auto-publishes discovered candidates', async () => {
    const { posts, sources, sourceItems } = setupDb();
    const source = sources.create({
      type: 'rss',
      name: 'Test RSS',
      config: { feedUrl: 'https://example.com/feed' },
    });
    const discovery = new DiscoveryService(sources, sourceItems, posts, makeConfig(), null);
    const svc = discovery as unknown as {
      createCandidate: (s: typeof source, i: DiscoveredItem, w: []) => Promise<boolean>;
    };
    await svc.createCandidate(source, sampleItem, []);
    expect(posts.countByStatus('posted')).toBe(0);
    expect(posts.countByStatus('pending')).toBe(1);
  });

  it('uses template caption when AI is disabled', () => {
    const caption = buildTemplateCaption(sampleItem);
    expect(caption).toContain('Нашёл материал');
    expect(caption).toContain('Dating tips');
    expect(caption).toContain('Что думаете?');
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
