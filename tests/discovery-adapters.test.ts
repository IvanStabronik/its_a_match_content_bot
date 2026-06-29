import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../src/config.js';
import { getAdapter } from '../src/discovery/adapters/index.js';
import { mapRssItem, parseRssDate } from '../src/discovery/adapters/rss.js';
import { youtubeChannelAdapter } from '../src/discovery/adapters/youtube.js';

function makeConfig(): AppConfig {
  return {
    contentBotToken: 't',
    adminTelegramIds: [1],
    channelUsername: 'ch',
    openaiApiKey: null,
    mainBotUsername: null,
    databasePath: ':memory:',
    backupDir: '/tmp',
    timezone: 'Europe/Warsaw',
    youtubeApiKey: 'key',
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
    discoveryMinQualityScore: 6,
    discoveryCreateLowScore: false,
    redditClientId: null,
    redditClientSecret: null,
    redditUserAgent: 'test',
    redditMaxPostsPerSource: 5,
    redditAllowedSubreddits: ['dating'],
  };
}

describe('Source adapter validation', () => {
  it('rss adapter rejects empty feed URL', () => {
    expect(getAdapter('rss').validateConfig({})).toContain('RSS');
  });

  it('youtube_channel adapter rejects empty input', () => {
    expect(youtubeChannelAdapter.validateConfig({})).toContain('YouTube');
  });

  it('youtube_search adapter rejects empty query', () => {
    expect(getAdapter('youtube_search').validateConfig({})).toContain('запрос');
  });

  it('reddit adapter reports not configured', () => {
    expect(getAdapter('reddit').validateConfig({})).toContain('Reddit');
  });
});

describe('RSS item mapping', () => {
  it('maps feed item to DiscoveredItem', () => {
    const item = mapRssItem(
      {
        title: 'Test title',
        link: 'https://example.com/post',
        guid: 'guid-1',
        contentSnippet: 'Snippet text',
        isoDate: '2026-06-01T10:00:00.000Z',
        creator: 'Author',
      },
      'Feed Name',
    );
    expect(item).toMatchObject({
      platform: 'rss',
      externalId: 'guid-1',
      url: 'https://example.com/post',
      title: 'Test title',
      author: 'Author',
    });
  });

  it('returns null when link is missing', () => {
    expect(mapRssItem({ title: 'No link' })).toBeNull();
  });

  it('parseRssDate returns null for invalid dates without throwing', () => {
    expect(parseRssDate('not-a-date')).toBeNull();
    expect(parseRssDate('')).toBeNull();
    expect(parseRssDate(undefined)).toBeNull();
    const item = mapRssItem({
      title: 'Bad date',
      link: 'https://example.com/x',
      pubDate: 'totally-invalid',
    });
    expect(item?.publishedAt).toBeNull();
  });

  it('parseRssDate parses valid ISO dates', () => {
    expect(parseRssDate('2026-06-01T10:00:00.000Z')).toBe('2026-06-01T10:00:00.000Z');
  });
});

describe('YouTube adapter missing API key', () => {
  it('throws Russian error when API key is absent', async () => {
    const source = {
      id: 1,
      type: 'youtube_channel' as const,
      name: 'test',
      config_json: JSON.stringify({ input: '@test' }),
      enabled: 1,
      last_checked_at: null,
      last_success_at: null,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await expect(
      youtubeChannelAdapter.fetchRecentItems(source, { maxItems: 5, lookbackHours: 168 }, {
        ...makeConfig(),
        youtubeApiKey: null,
      } as AppConfig),
    ).rejects.toThrow(/YOUTUBE_API_KEY/);
  });
});
