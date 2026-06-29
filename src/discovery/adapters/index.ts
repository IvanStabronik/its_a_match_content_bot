import type { SourceType } from '../../types.js';
import type { SourceAdapter } from '../types.js';
import { redditAdapter, redditSubredditAdapter } from './reddit.js';
import {
  manualSourceLinkAdapter,
  pikabuRssAdapter,
  publicFeedAdapter,
  rssArticleRuAdapter,
} from './public-feed.js';
import { rssAdapter, rssArticleAdapter } from './rss.js';
import {
  youtubeChannelAdapter,
  youtubeSearchAdapter,
} from './youtube.js';
import { youtubeShortSearchAdapter } from './youtube-shorts.js';

const ADAPTERS: Record<SourceType, SourceAdapter> = {
  youtube_channel: youtubeChannelAdapter,
  youtube_search: youtubeSearchAdapter,
  youtube_short_search: youtubeShortSearchAdapter,
  rss: rssAdapter,
  rss_article: rssArticleAdapter,
  rss_article_ru: rssArticleRuAdapter,
  public_feed: publicFeedAdapter,
  pikabu_rss: pikabuRssAdapter,
  manual_source_link: manualSourceLinkAdapter,
  reddit: redditAdapter,
  reddit_subreddit: redditSubredditAdapter,
};

export function getAdapter(type: SourceType): SourceAdapter {
  return ADAPTERS[type];
}

export {
  rssAdapter,
  rssArticleAdapter,
  rssArticleRuAdapter,
  publicFeedAdapter,
  pikabuRssAdapter,
  manualSourceLinkAdapter,
  youtubeChannelAdapter,
  youtubeSearchAdapter,
  youtubeShortSearchAdapter,
  redditAdapter,
  redditSubredditAdapter,
};
