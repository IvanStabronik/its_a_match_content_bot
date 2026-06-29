import Parser from 'rss-parser';
import type { DiscoveryFormat } from '../../types.js';
import type { DiscoveredItem, DiscoveryLimits, SourceAdapter } from '../types.js';

const parser = new Parser({
  timeout: 20_000,
  headers: { 'User-Agent': 'ItsAMatchContentBot/2.0' },
});

export function parseRssDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function mapRssItem(
  item: Parser.Item,
  feedTitle?: string,
  discoveryFormat: DiscoveryFormat = 'article_summary',
): DiscoveredItem | null {
  const link = item.link?.trim() || item.guid?.trim();
  if (!link) return null;

  const externalId = item.guid?.trim() || link;
  const publishedAt = parseRssDate(item.isoDate ?? item.pubDate ?? null);

  return {
    platform: 'rss',
    externalId,
    url: link,
    title: item.title?.trim() || null,
    description: (item.contentSnippet || item.content || item.summary || '').trim().slice(0, 2000) || null,
    author: item.creator?.trim() || feedTitle?.trim() || null,
    publishedAt,
    thumbnailUrl: item.enclosure?.url ?? null,
    raw: item,
    discoveryFormat,
  };
}

async function fetchRssFeed(
  source: import('../../types.js').Source,
  limits: DiscoveryLimits,
  format: DiscoveryFormat,
): Promise<DiscoveredItem[]> {
  const config = JSON.parse(source.config_json) as { feedUrl: string };
  const feed = await parser.parseURL(config.feedUrl);
  const cutoff = Date.now() - limits.lookbackHours * 60 * 60 * 1000;

  const items: DiscoveredItem[] = [];
  for (const item of feed.items ?? []) {
    if (items.length >= limits.maxItems) break;
    const mapped = mapRssItem(item, feed.title, format);
    if (!mapped) continue;
    if (mapped.publishedAt) {
      const ts = new Date(mapped.publishedAt).getTime();
      if (!Number.isNaN(ts) && ts < cutoff) continue;
    }
    items.push(mapped);
  }
  return items;
}

export const rssAdapter: SourceAdapter = {
  type: 'rss',

  validateConfig(config) {
    const feedUrl = String(config.feedUrl ?? '').trim();
    if (!feedUrl) return 'Укажите URL RSS-ленты.';
    try {
      new URL(feedUrl);
    } catch {
      return 'Некорректный URL RSS-ленты.';
    }
    return null;
  },

  async fetchRecentItems(source, limits) {
    return fetchRssFeed(source, limits, 'article_summary');
  },
};

export const rssArticleAdapter: SourceAdapter = {
  type: 'rss_article',

  validateConfig(config) {
    return rssAdapter.validateConfig(config);
  },

  async fetchRecentItems(source, limits) {
    return fetchRssFeed(source, limits, 'article_summary');
  },
};
