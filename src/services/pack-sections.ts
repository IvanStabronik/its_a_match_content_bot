import type { DiscoveryFormat, PackSection, Post } from '../types.js';

export const PACK_SECTION_LABELS: Record<PackSection, string> = {
  videos: '🎬 Видео',
  memes: '😂 Мемы',
  articles: '📰 Разборы',
  polls: '📊 Опросы',
  ideas: '💬 Идеи',
  other: '📎 Прочее',
};

export function isBackfillPost(post: Post): boolean {
  return post.created_by === 'daily_pack_ai' || post.created_by === 'daily_pack';
}

export function isForeignVideoIdeaPost(post: Post): boolean {
  return (
    post.pack_section === 'videos' &&
    post.discovery_format === 'text_idea' &&
    post.language === 'en' &&
    post.created_by === 'discovery'
  );
}

export function sectionForPost(post: Post): PackSection {
  if (post.pack_section) return post.pack_section;
  if (post.type === 'poll') return 'polls';
  const fmt = post.discovery_format;
  if (fmt === 'youtube_short_link' || fmt === 'youtube_video_link') return 'videos';
  if (fmt === 'meme_image') return 'memes';
  if (fmt === 'article_summary') return 'articles';
  if (fmt === 'text_idea') return 'ideas';
  if (post.type === 'text' && isBackfillPost(post)) return 'ideas';
  return 'other';
}

export function videoCandidatePriority(post: Post): number {
  if (post.discovery_format === 'youtube_short_link' && post.language === 'ru') return 0;
  if (isForeignVideoIdeaPost(post)) return 1;
  if (isBackfillPost(post) && post.pack_section === 'videos') return 2;
  if (post.discovery_format === 'youtube_short_link') return 3;
  return 4;
}

export function sortVideoCandidates(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => videoCandidatePriority(a) - videoCandidatePriority(b));
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
