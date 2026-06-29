import { describe, expect, it } from 'vitest';
import { getAdapter } from '../src/discovery/adapters/index.js';
import { mapRssItem } from '../src/discovery/adapters/rss.js';
import { youtubeChannelAdapter } from '../src/discovery/adapters/youtube.js';

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
      youtubeChannelAdapter.fetchRecentItems(source, { maxItems: 5, lookbackHours: 168 }, null),
    ).rejects.toThrow(/YOUTUBE_API_KEY/);
  });
});
