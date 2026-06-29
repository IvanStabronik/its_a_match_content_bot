import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PIKABU_FEED_HINT, validateFeedUrl } from '../src/discovery/feed-validator.js';
import { validateFeedConfigAsync } from '../src/discovery/adapters/public-feed.js';
import { inferFormatFromUrlMetadata } from '../src/services/url-candidate.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { DailyPackService } from '../src/services/daily-pack.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { ContentPackRepository } from '../src/services/content-packs.js';
import { PostRepository } from '../src/services/posts.js';
import { runStarterSourcesSetup } from '../src/services/starter-sources.js';
import { SourceItemRepository, SourceRepository } from '../src/services/sources.js';
import { buildSourcesStatus } from '../src/services/pack-diagnostics.js';
import { emptyDiscoverySummary, makeTestConfig } from './test-config.js';

describe('v6 Russian web sources', () => {
  it('pikabu_rss rejects non-RSS URL with clear Russian message', async () => {
    const err = await validateFeedConfigAsync({ feedUrl: 'https://pikabu.ru/' }, true);
    expect(err).toBeTruthy();
    expect(err).toContain('RSS');
    expect(err).toContain('Пикабу');
  });

  it('includes Pikabu hint constant', () => {
    expect(PIKABU_FEED_HINT).toContain('HTML scraping не используется');
  });

  it('infers article vs text idea from URL metadata', () => {
    const article = inferFormatFromUrlMetadata({
      url: 'https://example.com/post',
      title: 'Разбор отношений',
      description: 'A'.repeat(400),
    });
    expect(article.format).toBe('article_summary');
    expect(article.section).toBe('articles');

    const idea = inferFormatFromUrlMetadata({
      url: 'https://pikabu.ru/story/123',
      title: 'Когда он отвечает раз в сутки',
      description: 'Короткая история',
    });
    expect(idea.format).toBe('text_idea');
    expect(idea.section).toBe('ideas');
  });

  it('setup_sources does not require Reddit', () => {
    const dbPath = path.join(os.tmpdir(), `v6-setup-${Date.now()}.db`);
    const db = openDatabase(dbPath);
    initSchema(db);
    const sources = new SourceRepository(db);
    const config = makeTestConfig({ redditClientId: null, redditClientSecret: null, youtubeApiKey: 'k' });
    const result = runStarterSourcesSetup(sources, config);
    expect(result.added.length).toBeGreaterThan(0);
    expect(result.notes.some((n) => n.toLowerCase().includes('reddit'))).toBe(true);
    db.close();
    fs.unlinkSync(dbPath);
  });

  it('daily pack memes not zero without Reddit', async () => {
    const dbPath = path.join(os.tmpdir(), `v6-pack-${Date.now()}.db`);
    const db = openDatabase(dbPath);
    initSchema(db);
    const posts = new PostRepository(db);
    const packs = new ContentPackRepository(db);
    const sources = new SourceRepository(db);
    const sourceItems = new SourceItemRepository(db);
    const config = makeTestConfig({ redditClientId: null });
    const discovery = new DiscoveryService(sources, sourceItems, posts, config, null);
    vi.spyOn(discovery, 'discoverAll').mockResolvedValue(emptyDiscoverySummary());
    const dailyPack = new DailyPackService(packs, posts, discovery, sources, config, null);
    const result = await dailyPack.generateTodayPack({ rebuild: true });
    expect(result.summary.memes).toBeGreaterThanOrEqual(5);
    db.close();
    fs.unlinkSync(dbPath);
  });

  it('daily pack articles not zero without RSS (AI explainers)', async () => {
    const dbPath = path.join(os.tmpdir(), `v6-art-${Date.now()}.db`);
    const db = openDatabase(dbPath);
    initSchema(db);
    const posts = new PostRepository(db);
    const packs = new ContentPackRepository(db);
    const sources = new SourceRepository(db);
    const sourceItems = new SourceItemRepository(db);
    const config = makeTestConfig();
    const discovery = new DiscoveryService(sources, sourceItems, posts, config, null);
    vi.spyOn(discovery, 'discoverAll').mockResolvedValue(emptyDiscoverySummary());
    const dailyPack = new DailyPackService(packs, posts, discovery, sources, config, null);
    const result = await dailyPack.generateTodayPack({ rebuild: true });
    expect(result.summary.articles).toBeGreaterThanOrEqual(5);
    db.close();
    fs.unlinkSync(dbPath);
  });

  it('buildSourcesStatus reports optional Reddit and Pikabu counts', () => {
    const dbPath = path.join(os.tmpdir(), `v6-diag-${Date.now()}.db`);
    const db = openDatabase(dbPath);
    initSchema(db);
    const posts = new PostRepository(db);
    const sources = new SourceRepository(db);
    const config = makeTestConfig({ redditClientId: null });
    sources.create({ type: 'pikabu_rss', name: 'Pikabu', config: { feedUrl: 'https://x/rss' } });
    posts.create({
      type: 'text',
      caption: 'manual',
      raw_text: 'manual',
      created_by: 'manual_source_link',
    });
    const status = buildSourcesStatus(sources, posts, config);
    expect(status.reddit).toBe('missing');
    expect(status.pikabuFeeds).toBe(1);
    expect(status.manualLinksToday).toBeGreaterThanOrEqual(1);
    db.close();
    fs.unlinkSync(dbPath);
  });

  it('no auto-publishing from manual URL candidate creation', async () => {
    const dbPath = path.join(os.tmpdir(), `v6-manual-${Date.now()}.db`);
    const db = openDatabase(dbPath);
    initSchema(db);
    const posts = new PostRepository(db);
    const { createCandidateFromUrl } = await import('../src/services/url-candidate.js');

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        headers: { get: () => 'text/html' },
        arrayBuffer: async () =>
          new TextEncoder().encode(
            '<html><head><title>Тест отношений</title><meta property="og:description" content="Коротко про дейтинг"/></head></html>',
          ).buffer,
      }),
    );

    const result = await createCandidateFromUrl(posts, 'https://example.com/a', null, 'ch');
    const post = posts.getById(result.postId)!;
    expect(post.status).toBe('pending');
    expect(post.created_by).toBe('manual_source_link');
    expect(post.source_url).toBe('https://example.com/a');
    vi.unstubAllGlobals();
    db.close();
    fs.unlinkSync(dbPath);
  });

  it('validateFeedUrl rejects plain HTML page URL', async () => {
    const result = await validateFeedUrl('https://not-a-valid-feed.example/');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message.length).toBeGreaterThan(10);
    }
  });
});
