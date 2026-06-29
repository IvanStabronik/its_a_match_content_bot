import type { DiscoveryFormat } from '../../types.js';
import type { DiscoveredItem, DiscoveryLimits, SourceAdapter } from '../types.js';
import { getFeedParser, INVALID_FEED_MESSAGE, PIKABU_FEED_HINT, validateFeedUrl } from '../feed-validator.js';
import { mapFeedItemWithFormat, scoreRussianArticleItem } from './feed-items.js';

async function fetchPublicFeed(
  source: import('../../types.js').Source,
  limits: DiscoveryLimits,
  platform: string,
): Promise<DiscoveredItem[]> {
  const config = JSON.parse(source.config_json) as { feedUrl: string };
  const parser = getFeedParser();
  const feed = await parser.parseURL(config.feedUrl);
  const cutoff = Date.now() - limits.lookbackHours * 60 * 60 * 1000;

  const items: DiscoveredItem[] = [];
  for (const item of feed.items ?? []) {
    if (items.length >= limits.maxItems) break;
    const mapped = mapFeedItemWithFormat(item, feed.title, platform);
    if (!mapped) continue;
    if (mapped.publishedAt) {
      const ts = new Date(mapped.publishedAt).getTime();
      if (!Number.isNaN(ts) && ts < cutoff) continue;
    }
    items.push(mapped);
  }
  return items;
}

function validateFeedConfig(config: Record<string, unknown>): string | null {
  const feedUrl = String(config.feedUrl ?? '').trim();
  if (!feedUrl) return 'Укажите URL RSS/Atom-ленты.';
  try {
    new URL(feedUrl);
  } catch {
    return 'Некорректный URL.';
  }
  return null;
}

export async function validateFeedConfigAsync(
  config: Record<string, unknown>,
  pikabu = false,
): Promise<string | null> {
  const basic = validateFeedConfig(config);
  if (basic) return basic;

  const feedUrl = String(config.feedUrl ?? '').trim();
  const result = await validateFeedUrl(feedUrl);
  if (!result.ok) {
    return pikabu ? `${result.message}\n\n${PIKABU_FEED_HINT}` : result.message;
  }
  return null;
}

export const publicFeedAdapter: SourceAdapter = {
  type: 'public_feed',

  validateConfig(config) {
    return validateFeedConfig(config);
  },

  async fetchRecentItems(source, limits) {
    return fetchPublicFeed(source, limits, 'public_feed');
  },
};

export const rssArticleRuAdapter: SourceAdapter = {
  type: 'rss_article_ru',

  validateConfig(config) {
    return validateFeedConfig(config);
  },

  async fetchRecentItems(source, limits) {
    const items = await fetchPublicFeed(source, limits, 'rss_ru');
    for (const item of items) {
      item.discoveryFormat = 'article_summary';
      scoreRussianArticleItem(item);
      item.packSectionHint = 'articles';
    }
    return items;
  },
};

export const pikabuRssAdapter: SourceAdapter = {
  type: 'pikabu_rss',

  validateConfig(config) {
    return validateFeedConfig(config);
  },

  async fetchRecentItems(source, limits) {
    return fetchPublicFeed(source, limits, 'pikabu');
  },
};

export const manualSourceLinkAdapter: SourceAdapter = {
  type: 'manual_source_link',

  validateConfig() {
    return 'Для ручных ссылок используйте /source_add_url <url> — отдельный RSS-источник не нужен.';
  },

  async fetchRecentItems() {
    return [];
  },
};

export { INVALID_FEED_MESSAGE, PIKABU_FEED_HINT };
