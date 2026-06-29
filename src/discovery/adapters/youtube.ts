import type { Source } from '../../types.js';
import type { DiscoveredItem, DiscoveryLimits, SourceAdapter } from '../types.js';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

const MISSING_KEY_MSG =
  'YouTube API недоступен: не задан YOUTUBE_API_KEY. Добавьте ключ в .env.';

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    description?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: { high?: { url?: string }; default?: { url?: string } };
  };
}

async function youtubeGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function parseYouTubeChannelInput(input: string): {
  channelId?: string;
  handle?: string;
  url?: string;
} {
  const trimmed = input.trim();
  if (/^UC[\w-]{22}$/.test(trimmed)) return { channelId: trimmed };
  if (trimmed.startsWith('@')) return { handle: trimmed.slice(1) };
  if (trimmed.includes('youtube.com') || trimmed.includes('youtu.be')) {
    return { url: trimmed };
  }
  if (/^[\w-]+$/.test(trimmed)) return { handle: trimmed };
  return { url: trimmed };
}

export async function resolveChannelId(
  input: string,
  apiKey: string,
  existingConfig?: Record<string, unknown>,
): Promise<string> {
  if (existingConfig?.channelId && typeof existingConfig.channelId === 'string') {
    return existingConfig.channelId;
  }

  const parsed = parseYouTubeChannelInput(input);
  if (parsed.channelId) return parsed.channelId;

  if (parsed.handle) {
    const data = await youtubeGet<{ items?: Array<{ id?: string }> }>(
      'channels',
      { part: 'id', forHandle: parsed.handle },
      apiKey,
    );
    const id = data.items?.[0]?.id;
    if (id) return id;
    throw new Error(`YouTube канал не найден: @${parsed.handle}`);
  }

  const url = parsed.url ?? input;
  const channelIdMatch = url.match(/\/channel\/(UC[\w-]{22})/);
  if (channelIdMatch) return channelIdMatch[1];

  const handleMatch = url.match(/\/@([\w.-]+)/);
  if (handleMatch) {
    return resolveChannelId(`@${handleMatch[1]}`, apiKey);
  }

  throw new Error('Не удалось определить YouTube channel ID. Укажите @handle, URL или UC… ID.');
}

function mapYouTubeItem(item: YouTubeSearchItem): DiscoveredItem | null {
  const videoId = item.id?.videoId;
  if (!videoId) return null;
  const snippet = item.snippet;
  return {
    platform: 'youtube',
    externalId: videoId,
    url: `https://www.youtube.com/watch?v=${videoId}`,
    title: snippet?.title?.trim() || null,
    description: snippet?.description?.trim()?.slice(0, 2000) || null,
    author: snippet?.channelTitle?.trim() || null,
    publishedAt: snippet?.publishedAt ?? null,
    thumbnailUrl: snippet?.thumbnails?.high?.url ?? snippet?.thumbnails?.default?.url ?? null,
    raw: item,
  };
}

async function fetchYouTubeVideos(
  params: Record<string, string>,
  limits: DiscoveryLimits,
  apiKey: string,
): Promise<DiscoveredItem[]> {
  const publishedAfter = new Date(Date.now() - limits.lookbackHours * 60 * 60 * 1000).toISOString();
  const data = await youtubeGet<{ items?: YouTubeSearchItem[] }>(
    'search',
    {
      part: 'snippet',
      order: 'date',
      type: 'video',
      maxResults: String(limits.maxItems),
      publishedAfter,
      ...params,
    },
    apiKey,
  );

  const items: DiscoveredItem[] = [];
  for (const item of data.items ?? []) {
    const mapped = mapYouTubeItem(item);
    if (mapped) items.push(mapped);
  }
  return items;
}

export const youtubeChannelAdapter: SourceAdapter = {
  type: 'youtube_channel',

  validateConfig(config) {
    const input = String(config.input ?? config.channelId ?? '').trim();
    if (!input) return 'Укажите URL, @handle или channel ID YouTube канала.';
    return null;
  },

  async fetchRecentItems(source, limits, apiKey) {
    if (!apiKey) throw new Error(MISSING_KEY_MSG);
    const config = JSON.parse(source.config_json) as Record<string, unknown>;
    const input = String(config.input ?? config.channelId ?? '');
    const channelId = await resolveChannelId(input, apiKey, config);
    config.channelId = channelId;
    return fetchYouTubeVideos({ channelId }, limits, apiKey);
  },
};

export const youtubeSearchAdapter: SourceAdapter = {
  type: 'youtube_search',

  validateConfig(config) {
    const query = String(config.query ?? '').trim();
    if (!query) return 'Укажите поисковый запрос YouTube.';
    return null;
  },

  async fetchRecentItems(source, limits, apiKey) {
    if (!apiKey) throw new Error(MISSING_KEY_MSG);
    const config = JSON.parse(source.config_json) as { query: string };
    return fetchYouTubeVideos({ q: config.query }, limits, apiKey);
  },
};
