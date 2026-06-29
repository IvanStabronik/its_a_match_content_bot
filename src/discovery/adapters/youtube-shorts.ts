import type { AppConfig } from '../../config.js';
import type { Source } from '../../types.js';
import type { DiscoveredItem, DiscoveryLimits, SourceAdapter } from '../types.js';
import {
  buildYouTubeUrls,
  isShortsLike,
  parseIso8601Duration,
} from '../youtube-duration.js';
import { youtubeGet } from './youtube-api.js';

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

interface YouTubeVideoItem {
  id?: string;
  snippet?: YouTubeSearchItem['snippet'];
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
}

export const youtubeShortSearchAdapter: SourceAdapter = {
  type: 'youtube_short_search',

  validateConfig(config) {
    const query = String(config.query ?? '').trim();
    if (!query) return 'Укажите поисковый запрос для YouTube Shorts.';
    return null;
  },

  async fetchRecentItems(source, limits, config) {
    if (!config.youtubeApiKey) {
      throw new Error('YouTube API недоступен: не задан YOUTUBE_API_KEY. Добавьте ключ в .env.');
    }
    const sourceConfig = JSON.parse(source.config_json) as { query: string };
    const publishedAfter = new Date(
      Date.now() - limits.lookbackHours * 60 * 60 * 1000,
    ).toISOString();

    const searchData = await youtubeGet<{ items?: YouTubeSearchItem[] }>(
      'search',
      {
        part: 'snippet',
        q: sourceConfig.query,
        type: 'video',
        order: 'date',
        videoDuration: 'short',
        safeSearch: 'strict',
        relevanceLanguage: config.youtubeRelevanceLanguage,
        regionCode: config.youtubeRegionCode,
        maxResults: String(Math.min(limits.maxItems * 3, 25)),
        publishedAfter,
      },
      config.youtubeApiKey,
    );

    const videoIds = (searchData.items ?? [])
      .map((i) => i.id?.videoId)
      .filter((id): id is string => !!id);

    if (videoIds.length === 0) return [];

    const videosData = await youtubeGet<{ items?: YouTubeVideoItem[] }>(
      'videos',
      {
        part: 'snippet,contentDetails,statistics',
        id: videoIds.join(','),
      },
      config.youtubeApiKey,
    );

    const items: DiscoveredItem[] = [];
    for (const video of videosData.items ?? []) {
      if (items.length >= limits.maxItems) break;
      const videoId = video.id;
      if (!videoId) continue;

      const durationSeconds = parseIso8601Duration(video.contentDetails?.duration);
      if (durationSeconds != null && durationSeconds > config.youtubeRejectOverSeconds) {
        continue;
      }

      const snippet = video.snippet;
      const title = snippet?.title?.trim() || null;
      const description = snippet?.description?.trim()?.slice(0, 2000) || null;
      const isShort = isShortsLike(
        durationSeconds,
        title,
        description,
        config.youtubeShortsMaxSeconds,
      );

      if (
        durationSeconds != null &&
        durationSeconds > config.youtubeShortsMaxSeconds &&
        !isShort
      ) {
        continue;
      }

      const { url, shortsUrl } = buildYouTubeUrls(videoId, isShort);
      items.push({
        platform: 'youtube',
        externalId: videoId,
        url: shortsUrl ?? url,
        shortsUrl,
        title,
        description,
        author: snippet?.channelTitle?.trim() || null,
        publishedAt: snippet?.publishedAt ?? null,
        thumbnailUrl: snippet?.thumbnails?.high?.url ?? snippet?.thumbnails?.default?.url ?? null,
        raw: video,
        discoveryFormat: isShort ? 'youtube_short_link' : 'youtube_video_link',
        durationSeconds,
      });
    }

    return items;
  },
};
