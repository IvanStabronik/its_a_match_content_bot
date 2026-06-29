import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { formatDailyPackSummary } from '../src/bot/daily-pack-keyboards.js';
import {
  buildForeignVideoIdeaCaption,
  buildForeignVideoIdeaPost,
  evaluateDiscoveredItem,
} from '../src/discovery/pipeline.js';
import type { DiscoveredItem } from '../src/discovery/types.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { ContentPackRepository } from '../src/services/content-packs.js';
import { DailyPackService } from '../src/services/daily-pack.js';
import { formatPackDiagnosticsText } from '../src/services/pack-diagnostics.js';
import {
  pickFallbackExplainers,
  pickFallbackMemeIdeas,
  pickFallbackVideoIdeas,
} from '../src/services/daily-pack-templates.js';
import { sectionForPost } from '../src/services/pack-sections.js';
import { PostRepository } from '../src/services/posts.js';
import {
  LEGACY_ENGLISH_YOUTUBE_QUERIES,
  runStarterSourcesSetup,
} from '../src/services/starter-sources.js';
import { SourceItemRepository, SourceRepository } from '../src/services/sources.js';
import type { Post, Source } from '../src/types.js';

export function makeV5Config(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    contentBotToken: 't',
    adminTelegramIds: [1],
    channelUsername: 'ch',
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
    youtubeRegionCode: 'RU',
    youtubeRelevanceLanguage: 'ru',
    youtubeShortsMaxSeconds: 90,
    youtubeRejectOverSeconds: 180,
    discoveryAllowedLanguages: ['ru'],
    discoveryRejectForeignLanguage: true,
    discoveryMinQualityScore: 0,
    discoveryCreateLowScore: true,
    redditClientId: null,
    redditClientSecret: null,
    redditUserAgent: 'test',
    redditMaxPostsPerSource: 5,
    redditAllowedSubreddits: ['dating'],
    dailyPackEnabled: true,
    dailyPackTime: '10:00',
    dailyPackTimezone: 'Europe/Warsaw',
    dailyPackVideoTarget: 5,
    dailyPackMemeTarget: 5,
    dailyPackArticleTarget: 5,
    dailyPackPollTarget: 5,
    dailyPackIdeaTarget: 5,
    dailyPackMaxTotal: 30,
    dailyScheduleSlots: ['11:00', '13:30', '16:00', '18:30', '21:00'],
    dailyAutoDiscoveryLookbackHours: 48,
    dailyPackNotifyAdmins: true,
    dailyPackGuaranteeMinimum: true,
    dailyPackMinVideos: 5,
    dailyPackMinMemes: 5,
    dailyPackMinArticles: 5,
    dailyPackMinPolls: 5,
    dailyPackMinIdeas: 5,
    dailyPackAllowAiBackfill: true,
    dailyPackAllowForeignVideoIdeas: true,
    dailyPackForeignVideoMode: 'adapt_to_text_idea',
    dailyPackEmptySectionIsError: true,
    discoveryForeignLanguageMode: 'adapt_or_demote',
    memeBackfillMode: 'ai_text',
    articleBackfillMode: 'ai_explainer',
    starterSourcesAutoFix: false,
    ...overrides,
  };
}

function emptyDiscoverySummary() {
  return {
    checkedSources: 0,
    newCandidates: 0,
    duplicatesSkipped: 0,
    foreignConverted: 0,
    foreignRejected: 0,
    errors: [] as string[],
    perSource: [],
  };
}

describe('v5 guaranteed daily pack', () => {
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

  function setup(overrides: Partial<AppConfig> = {}) {
    const dbPath = path.join(os.tmpdir(), `v5-${Date.now()}-${Math.random()}.db`);
    tmpFiles.push(dbPath);
    const db = openDatabase(dbPath);
    initSchema(db);
    const posts = new PostRepository(db);
    const packs = new ContentPackRepository(db);
    const sources = new SourceRepository(db);
    const sourceItems = new SourceItemRepository(db);
    const config = makeV5Config(overrides);
    const discovery = new DiscoveryService(sources, sourceItems, posts, config, null);
    vi.spyOn(discovery, 'discoverAll').mockResolvedValue(emptyDiscoverySummary());
    const dailyPack = new DailyPackService(packs, posts, discovery, sources, config, null);
    return { db, posts, packs, dailyPack, config, discovery, sources };
  }

  it('creates full pack with no sources via AI/template backfill', async () => {
    const { dailyPack } = setup();
    const result = await dailyPack.generateTodayPack();
    expect(result.summary.videos).toBe(5);
    expect(result.summary.memes).toBe(5);
    expect(result.summary.articles).toBe(5);
    expect(result.summary.polls).toBe(5);
    expect(result.summary.ideas).toBe(5);
    expect(result.summary.total).toBe(25);
  });

  it('rebuild guarantees minimum section counts', async () => {
    const { dailyPack } = setup();
    const result = await dailyPack.rebuildTodayPack();
    for (const sec of ['videos', 'memes', 'articles', 'polls', 'ideas'] as const) {
      expect(result.summary[sec]).toBeGreaterThanOrEqual(5);
    }
  });

  it('memes section is not 0 when Reddit is missing', async () => {
    const { dailyPack } = setup({ redditClientId: null });
    const result = await dailyPack.generateTodayPack();
    expect(result.summary.memes).toBe(5);
    const memeDiag = result.diagnostics.sections.find((s) => s.section === 'memes');
    expect(memeDiag?.backfill).toBe(5);
  });

  it('AI explainer posts have no fake source URL', async () => {
    const { dailyPack, posts } = setup();
    await dailyPack.generateTodayPack();
    const pack = dailyPack.createOrGetTodayPack();
    const items = dailyPack.listPackItemsBySection(pack.id, 'articles');
    expect(items.length).toBe(5);
    for (const item of items) {
      const post = posts.getById(item.post_id)!;
      expect(post.source_url).toBeNull();
      expect(post.source_title).toBe('AI explainer');
      expect(post.status).toBe('pending');
    }
  });

  it('schedule_day can schedule AI-generated posts', () => {
    const { dailyPack, posts, packs } = setup();
    const pack = packs.createOrGet('2026-06-29');
    const p = posts.create({
      type: 'text',
      caption: 'AI idea',
      raw_text: 'AI idea',
      created_by: 'daily_pack_ai',
      pack_section: 'ideas',
    });
    packs.addItem(pack.id, p.id, 'ideas', 0);
    dailyPack.toggleSelected(pack.id, p.id);
    const { preview } = dailyPack.buildSchedulePreview(pack.id);
    expect(preview.assignments.length).toBeGreaterThan(0);
    expect(posts.getById(p.id)!.status).toBe('pending');
    dailyPack.applySchedule(preview.assignments);
    expect(posts.getById(p.id)!.status).toBe('scheduled');
  });

  it('no auto-publishing from pack generation', async () => {
    const { dailyPack, posts } = setup();
    await dailyPack.generateTodayPack();
    expect(posts.countByStatus('posted')).toBe(0);
    expect(posts.countByStatus('pending')).toBeGreaterThan(0);
  });

  it('/today summary shows real vs backfill breakdown', () => {
    const text = formatDailyPackSummary('2026-06-29', {
      videos: 5,
      memes: 5,
      articles: 5,
      polls: 5,
      ideas: 5,
      other: 0,
      selected: 0,
      total: 25,
      breakdown: {
        videos: { total: 5, real: 2, backfill: 3 },
        memes: { total: 5, real: 0, backfill: 5 },
      },
    });
    expect(text).toContain('2 найдено, 3 AI');
    expect(text).toContain('0 найдено, 5 AI');
    expect(text).toContain('Разборы');
  });

  it('pack_diagnostics explains missing Reddit', async () => {
    const { dailyPack, config } = setup();
    const result = await dailyPack.generateTodayPack();
    const text = formatPackDiagnosticsText(result.diagnostics, config);
    expect(text).toContain('Reddit не настроен');
    expect(text).toContain('adapt_or_demote');
  });
});

describe('foreign YouTube adapt_or_demote', () => {
  it('converts English Shorts to video idea instead of rejecting', async () => {
    const config = makeV5Config();
    const item: DiscoveredItem = {
      platform: 'youtube',
      externalId: 'abc',
      url: 'https://www.youtube.com/watch?v=abc',
      title: 'Relationship Red Flags #shorts',
      description: 'English dating advice',
      author: 'creator',
      publishedAt: new Date().toISOString(),
      thumbnailUrl: null,
      raw: {},
      discoveryFormat: 'youtube_short_link',
      durationSeconds: 45,
      shortsUrl: 'https://www.youtube.com/shorts/abc',
    };

    const result = await evaluateDiscoveredItem(item, config, null);
    expect(result.accept).toBe(true);
    expect(result.adaptForeignToVideoIdea).toBe(true);
  });

  it('buildForeignVideoIdeaPost sets pack_section videos and no auto-publish link type', () => {
    const source = {
      id: 1,
      type: 'youtube_short_search',
      name: 'test',
      config_json: '{}',
      enabled: 1,
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      created_at: '',
      updated_at: '',
    } as Source;
    const item: DiscoveredItem = {
      platform: 'youtube',
      externalId: 'x',
      url: 'https://youtube.com/shorts/x',
      title: 'Red flags',
      description: null,
      author: null,
      publishedAt: null,
      thumbnailUrl: null,
      raw: {},
      discoveryFormat: 'youtube_short_link',
      shortsUrl: 'https://youtube.com/shorts/x',
    };
    const caption = buildForeignVideoIdeaCaption(item.title);
    const post = buildForeignVideoIdeaPost(source, item, 99, caption);
    expect(post.type).toBe('text');
    expect(post.pack_section).toBe('videos');
    expect(post.discovery_format).toBe('text_idea');
    expect(post.language).toBe('en');
    expect(post.status).toBe('pending');
    expect(caption).toContain('английском');
  });

  it('foreign video ideas appear in videos section via pack_section', () => {
    const post = {
      type: 'text',
      discovery_format: 'text_idea',
      pack_section: 'videos',
      language: 'en',
      created_by: 'discovery',
    } as Post;
    expect(sectionForPost(post)).toBe('videos');
  });
});

describe('setup_sources v5', () => {
  const tmpFiles: string[] = [];

  afterEach(() => {
    for (const f of tmpFiles.splice(0)) {
      try {
        fs.unlinkSync(f);
      } catch {
        // ignore
      }
    }
  });

  it('pauses legacy English youtube_search and creates Russian shorts', () => {
    const dbPath = path.join(os.tmpdir(), `setup-${Date.now()}.db`);
    tmpFiles.push(dbPath);
    const db = openDatabase(dbPath);
    initSchema(db);
    const sources = new SourceRepository(db);
    const config = makeV5Config({ youtubeApiKey: 'key' });

    sources.create({
      type: 'youtube_search',
      name: 'Legacy',
      config: { query: LEGACY_ENGLISH_YOUTUBE_QUERIES[0] },
    });

    const result = runStarterSourcesSetup(sources, config);
    expect(result.paused.length).toBe(1);
    expect(result.added.length).toBeGreaterThanOrEqual(5);

    const legacy = sources.listAll().find((s) => s.type === 'youtube_search');
    expect(legacy?.enabled).toBe(0);
  });

  it('does not fail when YouTube API key missing', () => {
    const dbPath = path.join(os.tmpdir(), `setup2-${Date.now()}.db`);
    tmpFiles.push(dbPath);
    const db = openDatabase(dbPath);
    initSchema(db);
    const sources = new SourceRepository(db);
    const config = makeV5Config({ youtubeApiKey: null });

    const result = runStarterSourcesSetup(sources, config);
    expect(result.added.length).toBe(0);
    expect(result.notes.some((n) => n.includes('YOUTUBE_API_KEY'))).toBe(true);
  });
});

describe('fallback templates v5', () => {
  it('provides video, meme, and explainer fallbacks', () => {
    expect(pickFallbackVideoIdeas(5).length).toBe(5);
    expect(pickFallbackMemeIdeas(5).length).toBe(5);
    expect(pickFallbackExplainers(5).length).toBe(5);
  });
});
