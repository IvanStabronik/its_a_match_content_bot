import { describe, expect, it, vi } from 'vitest';
import { formatModerationCard } from '../src/bot/keyboards.js';
import { buildPostFromItem, resolvePostType } from '../src/discovery/pipeline.js';
import type { DiscoveredItem } from '../src/discovery/types.js';
import {
  buildLinkPublishText,
  isDirectImageUrl,
  resolvePublishUrl,
} from '../src/services/publish-content.js';
import { sendByType } from '../src/services/telegram.js';
import type { Post } from '../src/types.js';

function basePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    type: 'link',
    status: 'pending',
    category: null,
    source_url: 'https://example.com/article',
    media_file_id: null,
    media_url: null,
    caption: 'Русский текст для канала',
    raw_text: 'Русский текст для канала',
    ai_score: null,
    risk_score: null,
    risk_reason: null,
    warnings: null,
    poll_question: null,
    poll_options_json: null,
    scheduled_at: null,
    posted_at: null,
    telegram_message_id: null,
    last_error: null,
    publishing_started_at: null,
    created_by: 'discovery',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    discovery_source_id: 1,
    discovery_item_id: 1,
    source_title: null,
    source_author: null,
    thumbnail_url: null,
    discovered_at: new Date().toISOString(),
    discovery_format: 'article_summary',
    language: 'ru',
    duration_seconds: null,
    quality_score: null,
    content_angle: null,
    publish_recommendation: null,
    shorts_url: null,
    ...overrides,
  };
}

describe('link publish text', () => {
  it('combines Russian caption and URL', () => {
    const text = buildLinkPublishText(basePost());
    expect(text).toBe('Русский текст для канала\n\nhttps://example.com/article');
  });

  it('publishes URL only when caption is missing', () => {
    const text = buildLinkPublishText(
      basePost({ caption: null, raw_text: null, source_url: 'https://example.com/x' }),
    );
    expect(text).toBe('https://example.com/x');
  });

  it('publishes caption only when URL is missing', () => {
    const text = buildLinkPublishText(
      basePost({ source_url: null, caption: 'Только текст', raw_text: 'Только текст' }),
    );
    expect(text).toBe('Только текст');
  });

  it('prefers shorts_url for youtube_short_link', () => {
    const url = resolvePublishUrl(
      basePost({
        discovery_format: 'youtube_short_link',
        source_url: 'https://www.youtube.com/watch?v=abc',
        shorts_url: 'https://www.youtube.com/shorts/abc',
      }),
    );
    expect(url).toBe('https://www.youtube.com/shorts/abc');
  });
});

describe('sendByType link publishing', () => {
  it('sends caption + URL for discovered RSS link candidate', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 10 });
    const api = { sendMessage } as unknown as Parameters<typeof sendByType>[0];

    await sendByType(api, 'itsamatchchannel', basePost());

    expect(sendMessage).toHaveBeenCalledWith(
      '@itsamatchchannel',
      'Русский текст для канала\n\nhttps://example.com/article',
      { link_preview_options: { is_disabled: false } },
    );
  });

  it('sends caption + Shorts URL for discovered YouTube Shorts candidate', async () => {
    const sendMessage = vi.fn().mockResolvedValue({ message_id: 11 });
    const api = { sendMessage } as unknown as Parameters<typeof sendByType>[0];

    await sendByType(
      api,
      'itsamatchchannel',
      basePost({
        discovery_format: 'youtube_short_link',
        caption: 'Коротко про отношения',
        raw_text: 'Коротко про отношения',
        source_url: 'https://www.youtube.com/watch?v=abc',
        shorts_url: 'https://www.youtube.com/shorts/abc',
      }),
    );

    expect(sendMessage).toHaveBeenCalledWith(
      '@itsamatchchannel',
      'Коротко про отношения\n\nhttps://www.youtube.com/shorts/abc',
      { link_preview_options: { is_disabled: false } },
    );
  });
});

describe('isDirectImageUrl', () => {
  it('accepts reddit preview direct image URL', () => {
    expect(
      isDirectImageUrl('https://preview.redd.it/abc123.jpg?width=640&crop=smart&auto=webp'),
    ).toBe(true);
  });

  it('rejects reddit post page URL', () => {
    expect(isDirectImageUrl('https://www.reddit.com/r/dating/comments/abc123/title/')).toBe(false);
  });

  it('accepts external direct image URL', () => {
    expect(isDirectImageUrl('https://cdn.example.com/memes/love.png')).toBe(true);
  });

  it('rejects non-image preview URL', () => {
    expect(isDirectImageUrl('https://preview.redd.it/abc123?width=640')).toBe(false);
  });
});

describe('meme_image post type resolution', () => {
  const memeItem = (imageUrl: string): DiscoveredItem => ({
    platform: 'reddit',
    externalId: 'x1',
    url: 'https://www.reddit.com/r/dating/comments/x1',
    title: 'Meme',
    description: null,
    author: 'user',
    publishedAt: new Date().toISOString(),
    thumbnailUrl: null,
    raw: {},
    discoveryFormat: 'meme_image',
    imageUrl,
  });

  it('creates photo candidate for direct reddit image URL', () => {
    const imageUrl = 'https://preview.redd.it/abc.jpg?width=640';
    expect(resolvePostType(memeItem(imageUrl))).toBe('photo');

    const post = buildPostFromItem(
      {
        id: 1,
        type: 'reddit_subreddit',
        name: 'r/dating',
        config_json: '{}',
        enabled: 1,
        last_checked_at: null,
        last_success_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      memeItem(imageUrl),
      1,
      {
        caption: 'Мем',
        category: null,
        aiScore: 7,
        riskScore: 2,
        riskReason: null,
        warnings: [],
        qualityScore: 7,
      },
      [],
    );

    expect(post.type).toBe('photo');
    expect(post.media_url).toBe(imageUrl);
  });

  it('creates link candidate for non-direct preview URL', () => {
    const imageUrl = 'https://www.reddit.com/gallery/abc';
    expect(resolvePostType(memeItem(imageUrl))).toBe('link');

    const post = buildPostFromItem(
      {
        id: 1,
        type: 'reddit_subreddit',
        name: 'r/dating',
        config_json: '{}',
        enabled: 1,
        last_checked_at: null,
        last_success_at: null,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      memeItem(imageUrl),
      1,
      {
        caption: 'Мем-идея',
        category: null,
        aiScore: 7,
        riskScore: 2,
        riskReason: null,
        warnings: [],
        qualityScore: 7,
      },
      [],
    );

    expect(post.type).toBe('link');
    expect(post.media_url).toBeNull();
  });
});

describe('queue card publish URL', () => {
  it('shows Shorts URL label for shorts candidates', () => {
    const card = formatModerationCard(
      basePost({
        discovery_format: 'youtube_short_link',
        source_url: 'https://www.youtube.com/watch?v=abc',
        shorts_url: 'https://www.youtube.com/shorts/abc',
      }),
      'Europe/Warsaw',
    );
    expect(card).toContain('Shorts URL: https://www.youtube.com/shorts/abc');
    expect(card).not.toContain('watch?v=abc');
  });

  it('shows URL label for normal link candidates', () => {
    const card = formatModerationCard(
      basePost({ discovery_format: 'article_summary' }),
      'Europe/Warsaw',
    );
    expect(card).toContain('URL: https://example.com/article');
  });
});
