import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { getAdapter } from '../src/discovery/adapters/index.js';
import { mapRssItem } from '../src/discovery/adapters/rss.js';
import * as youtubeApi from '../src/discovery/adapters/youtube-api.js';
import { youtubeShortSearchAdapter } from '../src/discovery/adapters/youtube-shorts.js';
import { assessLanguage, itemTextForLanguage } from '../src/discovery/language.js';
import { evaluateDiscoveredItem } from '../src/discovery/pipeline.js';
import { DiscoveryService, buildTemplateCaption } from '../src/discovery/service.js';
import { parseIso8601Duration } from '../src/discovery/youtube-duration.js';
import { PostRepository } from '../src/services/posts.js';
import { SourceItemRepository, SourceRepository } from '../src/services/sources.js';
import { sendByType } from '../src/services/telegram.js';

import { makeTestConfig } from './test-config.js';

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return makeTestConfig({
    youtubeApiKey: 'key',
    discoveryMinQualityScore: 6,
    discoveryCreateLowScore: false,
    ...overrides,
  });
}

describe('v3 content quality', () => {
  it('parseIso8601Duration parses PT1M30S', () => {
    expect(parseIso8601Duration('PT1M30S')).toBe(90);
    expect(parseIso8601Duration('invalid')).toBeNull();
  });

  it('assessLanguage accepts Cyrillic Russian text', () => {
    const ru = assessLanguage('Ошибки в отношениях и переписке');
    expect(ru.isRussianLikely).toBe(true);
    expect(ru.language).toBe('ru');
  });

  it('assessLanguage flags obvious English', () => {
    const en = assessLanguage('Dating red flags everyone should know about');
    expect(en.isForeignLikely).toBe(true);
    expect(en.language).toBe('en');
  });

  it('youtube_short_search uses videoDuration=short in API call', async () => {
    const calls: Array<[string, Record<string, string>, string]> = [];
    vi.spyOn(youtubeApi, 'youtubeGet').mockImplementation(async (path, params, key) => {
      calls.push([path, params, key]);
      if (path === 'search') {
        return { items: [{ id: { videoId: 'abc123' } }] };
      }
      return {
        items: [
          {
            id: 'abc123',
            snippet: {
              title: 'Short про отношения',
              description: '#shorts',
              channelTitle: 'Ch',
              publishedAt: new Date().toISOString(),
            },
            contentDetails: { duration: 'PT45S' },
          },
        ],
      };
    });

    const source = {
      id: 1,
      type: 'youtube_short_search' as const,
      name: 'test',
      config_json: JSON.stringify({ query: 'отношения' }),
      enabled: 1,
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const items = await youtubeShortSearchAdapter.fetchRecentItems(
      source,
      { maxItems: 5, lookbackHours: 168 },
      makeConfig(),
    );

    const searchCall = calls.find(([path]) => path === 'search');
    expect(searchCall?.[1].videoDuration).toBe('short');
    expect(searchCall?.[1].relevanceLanguage).toBe('ru');
    expect(items[0]?.discoveryFormat).toBe('youtube_short_link');
    expect(items[0]?.durationSeconds).toBe(45);

    vi.restoreAllMocks();
  });

  it('sendVideo uses supports_streaming for native video', async () => {
    const sendVideo = vi.fn().mockResolvedValue({ message_id: 42 });
    const api = { sendVideo } as unknown as Parameters<typeof sendByType>[0];

    await sendByType(api, 'testchannel', {
      id: 1,
      type: 'video',
      status: 'pending',
      category: null,
      source_url: null,
      media_file_id: 'file123',
      media_url: null,
      caption: 'test',
      raw_text: null,
      ai_score: null,
      risk_score: null,
      risk_reason: null,
      warnings: null,
      poll_question: null,
      poll_options_json: null,
      scheduled_at: null,
      posted_at: null,
      telegram_message_id: null,
      last_error: null,
      publishing_started_at: null,
      created_by: '1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
      discovery_source_id: null,
      discovery_item_id: null,
      source_title: null,
      source_author: null,
      thumbnail_url: null,
      discovered_at: null,
      discovery_format: 'native_video',
      language: 'ru',
      duration_seconds: null,
      quality_score: null,
      content_angle: null,
      publish_recommendation: null,
      shorts_url: null,
    });

    expect(sendVideo).toHaveBeenCalledWith(
      '@testchannel',
      'file123',
      expect.objectContaining({ supports_streaming: true }),
    );
  });

  it('reddit_subreddit refuses without credentials', async () => {
    const adapter = getAdapter('reddit_subreddit');
    const source = {
      id: 1,
      type: 'reddit_subreddit' as const,
      name: 'r/dating',
      config_json: JSON.stringify({ subreddit: 'dating' }),
      enabled: 1,
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await expect(
      adapter.fetchRecentItems(source, { maxItems: 5, lookbackHours: 168 }, makeConfig()),
    ).rejects.toThrow(/REDDIT_CLIENT/);
  });

  it('itemTextForLanguage combines title and description', () => {
    expect(itemTextForLanguage({ title: 'A', description: 'B' })).toBe('A\nB');
  });

  it('rejects too-long YouTube duration in evaluateDiscoveredItem', async () => {
    const result = await evaluateDiscoveredItem(
      {
        platform: 'youtube',
        externalId: 'long1',
        url: 'https://youtube.com/watch?v=long1',
        title: 'Короткое видео про отношения',
        description: 'описание',
        author: 'Ch',
        publishedAt: new Date().toISOString(),
        thumbnailUrl: null,
        raw: {},
        discoveryFormat: 'youtube_video_link',
        durationSeconds: 240,
      },
      makeConfig(),
      null,
    );
    expect(result.accept).toBe(false);
    expect(result.skipReason).toBe('too_long');
  });

  it('skips foreign-language YouTube and stores skip_reason via service', async () => {
    const db = openDatabase(':memory:');
    initSchema(db);
    const posts = new PostRepository(db);
    const sources = new SourceRepository(db);
    const sourceItems = new SourceItemRepository(db);
    const source = sources.create({
      type: 'youtube_short_search',
      name: 'YT',
      config: { query: 'test' },
    });
    const discovery = new DiscoveryService(
      sources,
      sourceItems,
      posts,
      makeConfig(),
      null,
    );
    const service = discovery as unknown as {
      createCandidate: (
        s: typeof source,
        item: import('../src/discovery/types.js').DiscoveredItem,
        runResult?: import('../src/discovery/types.js').DiscoveryRunResult,
      ) => Promise<'created' | 'skipped' | 'duplicate' | 'foreign_converted' | 'foreign_rejected'>;
    };

    const outcome = await service.createCandidate(source, {
      platform: 'youtube',
      externalId: 'en1',
      url: 'https://youtube.com/watch?v=en1',
      title: 'Dating red flags everyone should know',
      description: 'English only content',
      author: 'Ch',
      publishedAt: new Date().toISOString(),
      thumbnailUrl: null,
      raw: {},
      discoveryFormat: 'youtube_short_link',
      durationSeconds: 45,
      shortsUrl: 'https://youtube.com/shorts/en1',
    });

    expect(outcome).toBe('foreign_converted');
    expect(posts.countPending()).toBe(1);
    const post = posts.getPendingPage(0, 1)[0]!;
    expect(post.pack_section).toBe('videos');
    expect(post.discovery_format).toBe('text_idea');
    expect(post.type).toBe('text');
  });

  it('rejects foreign language when mode is reject', async () => {
    const db = openDatabase(':memory:');
    initSchema(db);
    const posts = new PostRepository(db);
    const sources = new SourceRepository(db);
    const sourceItems = new SourceItemRepository(db);
    const source = sources.create({
      type: 'youtube_short_search',
      name: 'Test',
      config: { query: 'test' },
    });
    const discovery = new DiscoveryService(
      sources,
      sourceItems,
      posts,
      makeConfig({ discoveryForeignLanguageMode: 'reject' }),
      null,
    );
    const service = discovery as unknown as {
      createCandidate: (
        s: typeof source,
        item: import('../src/discovery/types.js').DiscoveredItem,
      ) => Promise<string>;
    };

    const outcome = await service.createCandidate(source, {
      platform: 'youtube',
      externalId: 'en2',
      url: 'https://youtube.com/watch?v=en2',
      title: 'Dating red flags everyone should know',
      description: 'English only content',
      author: 'Ch',
      publishedAt: new Date().toISOString(),
      thumbnailUrl: null,
      raw: {},
      discoveryFormat: 'youtube_short_link',
      durationSeconds: 45,
    });

    expect(outcome).toBe('foreign_rejected');
    expect(posts.countPending()).toBe(0);
    const stored = sourceItems.findByPlatformExternalId('youtube', 'en2');
    expect(stored?.skip_reason).toBe('foreign_language');
  });

  it('RSS article mapping uses article_summary format', () => {
    const item = mapRssItem(
      { title: 'Статья', link: 'https://example.com/a', guid: 'g1' },
      'Feed',
      'article_summary',
    );
    expect(item?.discoveryFormat).toBe('article_summary');
    const fallback = buildTemplateCaption(item!);
    expect(fallback).toContain('📰');
  });

  it('AI disabled article fallback still produces caption', () => {
    const caption = buildTemplateCaption({
      platform: 'rss',
      externalId: 'x',
      url: 'https://example.com',
      title: 'Советы по отношениям',
      description: 'Текст',
      author: null,
      publishedAt: null,
      thumbnailUrl: null,
      raw: {},
      discoveryFormat: 'article_summary',
    });
    expect(caption.length).toBeGreaterThan(20);
    expect(caption).toContain('Советы');
  });

  it('adapt-to-Russian flow updates caption only without publishing', async () => {
    const db = openDatabase(':memory:');
    initSchema(db);
    const posts = new PostRepository(db);
    const post = posts.create({
      type: 'link',
      status: 'pending',
      caption: 'Dating tips in English',
      raw_text: 'Dating tips in English',
      source_url: 'https://example.com/post',
      created_by: '1',
      discovery_format: 'youtube_video_link',
      language: 'en',
    });

    posts.update(post.id, {
      caption: 'Советы по знакомствам на русском',
      raw_text: 'Советы по знакомствам на русском',
      language: 'ru',
    });

    const updated = posts.getById(post.id)!;
    expect(updated.status).toBe('pending');
    expect(updated.caption).toContain('русском');
    expect(updated.source_url).toBe('https://example.com/post');
    expect(updated.telegram_message_id).toBeNull();
  });

  it('text-post conversion preserves source metadata', () => {
    const db = openDatabase(':memory:');
    initSchema(db);
    const posts = new PostRepository(db);
    const post = posts.create({
      type: 'link',
      status: 'pending',
      caption: 'Link caption',
      source_url: 'https://example.com/article',
      source_title: 'Original title',
      created_by: '1',
      discovery_format: 'article_summary',
    });

    posts.update(post.id, {
      type: 'text',
      caption: 'Автономный текст-пост на русском',
      raw_text: 'Автономный текст-пост на русском',
      discovery_format: 'text_idea',
      language: 'ru',
    });

    const updated = posts.getById(post.id)!;
    expect(updated.type).toBe('text');
    expect(updated.source_url).toBe('https://example.com/article');
    expect(updated.source_title).toBe('Original title');
    expect(updated.discovery_format).toBe('text_idea');
  });
});
