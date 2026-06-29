import type { Post } from '../types.js';

const DIRECT_IMAGE_RE = /\.(jpe?g|png|webp|gif)(\?.*)?$/i;

export function isDirectImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return DIRECT_IMAGE_RE.test(parsed.pathname);
  } catch {
    const withoutFragment = trimmed.split('#')[0] ?? trimmed;
    return DIRECT_IMAGE_RE.test(withoutFragment);
  }
}

export function resolvePublishUrl(post: Post): string | null {
  if (post.discovery_format === 'youtube_short_link' && post.shorts_url) {
    return post.shorts_url;
  }
  return post.source_url ?? null;
}

export function buildLinkPublishText(post: Post): string {
  const caption = (post.caption || post.raw_text || '').trim();
  const url = resolvePublishUrl(post)?.trim() ?? '';

  if (caption && url) return `${caption}\n\n${url}`;
  if (url) return url;
  if (caption) return caption;
  return '';
}

export function publishUrlLabel(post: Post): string | null {
  const url = resolvePublishUrl(post);
  if (!url) return null;
  if (post.discovery_format === 'youtube_short_link') return 'Shorts URL';
  if (post.type === 'link' || post.source_url || post.shorts_url) return 'URL';
  return null;
}
