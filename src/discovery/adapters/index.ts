import type { SourceType } from '../../types.js';
import type { SourceAdapter } from '../types.js';
import { redditAdapter } from './reddit.js';
import { rssAdapter } from './rss.js';
import { youtubeChannelAdapter, youtubeSearchAdapter } from './youtube.js';

const ADAPTERS: Record<SourceType, SourceAdapter> = {
  youtube_channel: youtubeChannelAdapter,
  youtube_search: youtubeSearchAdapter,
  rss: rssAdapter,
  reddit: redditAdapter,
};

export function getAdapter(type: SourceType): SourceAdapter {
  return ADAPTERS[type];
}

export { rssAdapter, youtubeChannelAdapter, youtubeSearchAdapter, redditAdapter };
