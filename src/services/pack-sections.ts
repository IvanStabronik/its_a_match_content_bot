import type { DiscoveryFormat, PackSection, Post } from '../types.js';

export const PACK_SECTION_LABELS: Record<PackSection, string> = {
  videos: '🎬 Видео',
  memes: '😂 Мемы',
  articles: '📰 Статьи',
  polls: '📊 Опросы',
  ideas: '💬 Идеи',
  other: '📎 Прочее',
};

export function sectionForPost(post: Post): PackSection {
  if (post.type === 'poll') return 'polls';
  const fmt = post.discovery_format;
  if (fmt === 'youtube_short_link' || fmt === 'youtube_video_link') return 'videos';
  if (fmt === 'meme_image') return 'memes';
  if (fmt === 'article_summary') return 'articles';
  if (fmt === 'text_idea') return 'ideas';
  if (post.type === 'text' && post.created_by === 'daily_pack') return 'ideas';
  return 'other';
}

export function sectionForDiscoveryFormat(format: DiscoveryFormat | null | undefined): PackSection {
  if (!format) return 'other';
  if (format === 'youtube_short_link' || format === 'youtube_video_link') return 'videos';
  if (format === 'meme_image') return 'memes';
  if (format === 'article_summary') return 'articles';
  if (format === 'text_idea') return 'ideas';
  return 'other';
}

export function emptyPackSummary(): import('../types.js').PackSummary {
  return {
    videos: 0,
    memes: 0,
    articles: 0,
    polls: 0,
    ideas: 0,
    other: 0,
    selected: 0,
    total: 0,
  };
}

export function summaryFromCounts(counts: Record<PackSection, number>, selected: number): import('../types.js').PackSummary {
  const total =
    counts.videos +
    counts.memes +
    counts.articles +
    counts.polls +
    counts.ideas +
    counts.other;
  return {
    videos: counts.videos,
    memes: counts.memes,
    articles: counts.articles,
    polls: counts.polls,
    ideas: counts.ideas,
    other: counts.other,
    selected,
    total,
  };
}
