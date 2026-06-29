import type { AppConfig } from '../../config.js';
import type { DiscoveredItem, DiscoveryLimits, SourceAdapter } from '../types.js';

const TOKEN_URL = 'https://www.reddit.com/api/v1/access_token';
const OAUTH_BASE = 'https://oauth.reddit.com';

interface RedditListing {
  data?: {
    children?: Array<{
      data?: {
        id?: string;
        title?: string;
        selftext?: string;
        url?: string;
        author?: string;
        created_utc?: number;
        permalink?: string;
        post_hint?: string;
        is_self?: boolean;
        preview?: { images?: Array<{ source?: { url?: string } }> };
      };
    }>;
  };
}

async function getRedditToken(config: AppConfig): Promise<string> {
  if (!config.redditClientId || !config.redditClientSecret) {
    throw new Error(
      'Reddit API не настроен. Добавьте REDDIT_CLIENT_ID и REDDIT_CLIENT_SECRET в .env.',
    );
  }

  const auth = Buffer.from(`${config.redditClientId}:${config.redditClientSecret}`).toString(
    'base64',
  );
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.redditUserAgent,
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`Reddit auth error ${res.status}`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error('Reddit API не вернул access_token');
  return data.access_token;
}

function decodeRedditUrl(url: string): string {
  return url.replace(/&amp;/g, '&');
}

function mapRedditPost(
  post: {
    id?: string;
    title?: string;
    selftext?: string;
    url?: string;
    author?: string;
    created_utc?: number;
    permalink?: string;
    post_hint?: string;
    is_self?: boolean;
    preview?: { images?: Array<{ source?: { url?: string } }> };
  } | undefined,
  subreddit: string,
): DiscoveredItem | null {
  if (!post?.id || !post.title) return null;

  const permalink = post.permalink
    ? `https://www.reddit.com${post.permalink}`
    : post.url ?? '';

  let imageUrl: string | null = null;
  const previewUrl = post.preview?.images?.[0]?.source?.url;
  if (previewUrl) imageUrl = decodeRedditUrl(previewUrl);

  const isImage =
    post.post_hint === 'image' ||
    !!imageUrl ||
    (post.url?.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i) ?? false);

  if (isImage && imageUrl) {
    return {
      platform: 'reddit',
      externalId: post.id,
      url: permalink,
      title: post.title.trim(),
      description: (post.selftext ?? '').trim().slice(0, 2000) || null,
      author: post.author ?? subreddit,
      publishedAt: post.created_utc
        ? new Date(post.created_utc * 1000).toISOString()
        : null,
      thumbnailUrl: imageUrl,
      imageUrl,
      raw: post,
      discoveryFormat: 'meme_image',
    };
  }

  if (post.is_self || (post.selftext && post.selftext.length > 20)) {
    return {
      platform: 'reddit',
      externalId: post.id,
      url: permalink,
      title: post.title.trim(),
      description: (post.selftext ?? '').trim().slice(0, 2000),
      author: post.author ?? subreddit,
      publishedAt: post.created_utc
        ? new Date(post.created_utc * 1000).toISOString()
        : null,
      thumbnailUrl: null,
      raw: post,
      discoveryFormat: 'text_idea',
    };
  }

  return {
    platform: 'reddit',
    externalId: post.id,
    url: post.url ?? permalink,
    title: post.title.trim(),
    description: (post.selftext ?? '').trim().slice(0, 2000) || null,
    author: post.author ?? subreddit,
    publishedAt: post.created_utc
      ? new Date(post.created_utc * 1000).toISOString()
      : null,
    thumbnailUrl: null,
    raw: post,
    discoveryFormat: 'article_summary',
  };
}

export const redditSubredditAdapter: SourceAdapter = {
  type: 'reddit_subreddit',

  validateConfig(config) {
    const subreddit = String(config.subreddit ?? '').trim().replace(/^r\//, '');
    if (!subreddit) return 'Укажите название subreddit.';
    return null;
  },

  async fetchRecentItems(source, limits, config) {
    const sourceConfig = JSON.parse(source.config_json) as { subreddit: string };
    const subreddit = sourceConfig.subreddit.replace(/^r\//, '');

    if (!config.redditAllowedSubreddits.some(
      (s: string) => s.toLowerCase() === subreddit.toLowerCase(),
    )) {
      throw new Error(`Subreddit r/${subreddit} не в списке разрешённых.`);
    }

    const token = await getRedditToken(config);
    const res = await fetch(`${OAUTH_BASE}/r/${subreddit}/hot.json?limit=${config.redditMaxPostsPerSource}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': config.redditUserAgent,
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      throw new Error(`Reddit API error ${res.status} for r/${subreddit}`);
    }

    const listing = (await res.json()) as RedditListing;
    const items: DiscoveredItem[] = [];

    for (const child of listing.data?.children ?? []) {
      if (items.length >= limits.maxItems) break;
      const mapped = mapRedditPost(child.data, subreddit);
      if (mapped) {
        items.push({
          ...mapped,
          raw: { ...((mapped.raw as object) ?? {}), subreddit, sourceUrl: mapped.url },
        });
      }
    }

    return items;
  },
};

export const redditAdapter: SourceAdapter = {
  type: 'reddit',

  validateConfig() {
    return 'Источник Reddit (legacy) не настроен. Используйте /source_add reddit_subreddit <name>.';
  },

  async fetchRecentItems() {
    throw new Error('Источник Reddit пока не настроен. Используйте reddit_subreddit.');
  },
};
