import type { AiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import type { CreatePostInput, DiscoveryFormat, PostCategory } from '../types.js';
import { isDirectImageUrl } from './publish-content.js';
import type { PostRepository } from './posts.js';

const URL_FETCH_TIMEOUT_MS = 15_000;
const MAX_BODY_BYTES = 512_000;
const USER_AGENT = 'ItsAMatchContentBot/6.0';

export interface UrlMetadata {
  url: string;
  title: string | null;
  description: string | null;
}

export interface UrlCandidateResult {
  postId: number;
  format: DiscoveryFormat;
  section: 'articles' | 'memes' | 'ideas';
}

export async function fetchUrlMetadata(url: string): Promise<UrlMetadata> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,text/plain,application/xml',
      },
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: не удалось получить страницу`);
    }

    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/rss') || contentType.includes('application/atom')) {
      throw new Error('Это RSS/Atom-фид. Используйте /source_add rss_article_ru или public_feed.');
    }

    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BODY_BYTES) {
      throw new Error('Страница слишком большая для безопасного чтения.');
    }

    const html = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    return {
      url,
      title: extractMeta(html, 'og:title') ?? extractTag(html, 'title'),
      description:
        extractMeta(html, 'og:description') ??
        extractMeta(html, 'description') ??
        extractMeta(html, 'twitter:description'),
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractMeta(html: string, name: string): string | null {
  const re = new RegExp(
    `<meta[^>]+(?:name|property)=["']${escapeReg(name)}["'][^>]+content=["']([^"']+)["']`,
    'i',
  );
  const m = html.match(re);
  if (m?.[1]) return decodeHtml(m[1].trim().slice(0, 500));
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${escapeReg(name)}["']`,
    'i',
  );
  const m2 = html.match(re2);
  return m2?.[1] ? decodeHtml(m2[1].trim().slice(0, 500)) : null;
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([^<]{1,300})</${tag}>`, 'i'));
  return m?.[1] ? decodeHtml(m[1].trim()) : null;
}

function escapeReg(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function inferFormatFromUrlMetadata(meta: UrlMetadata): {
  format: DiscoveryFormat;
  section: 'articles' | 'memes' | 'ideas';
  type: CreatePostInput['type'];
  mediaUrl: string | null;
} {
  if (isDirectImageUrl(meta.url)) {
    return { format: 'meme_image', section: 'memes', type: 'photo', mediaUrl: meta.url };
  }

  const text = `${meta.title ?? ''} ${meta.description ?? ''}`.trim();
  const isPikabu = meta.url.includes('pikabu.ru');

  if (text.length >= 350 || (isPikabu && text.length >= 120)) {
    return { format: 'article_summary', section: 'articles', type: 'text', mediaUrl: null };
  }

  if (text.length >= 30) {
    return { format: 'text_idea', section: 'ideas', type: 'text', mediaUrl: null };
  }

  return { format: 'article_summary', section: 'articles', type: 'text', mediaUrl: null };
}

export async function createCandidateFromUrl(
  posts: PostRepository,
  url: string,
  ai: AiModule | null,
  channelUsername: string,
): Promise<UrlCandidateResult> {
  const meta = await fetchUrlMetadata(url);
  const inferred = inferFormatFromUrlMetadata(meta);

  let caption = buildTemplateFromMeta(meta, inferred.format);
  let category: PostCategory | null = inferred.section === 'memes' ? 'dating_meme' : 'news';
  let aiScore = 5;

  if (ai) {
    try {
      const item = {
        platform: 'manual',
        externalId: url,
        url,
        title: meta.title,
        description: meta.description,
        author: null,
        publishedAt: null,
        thumbnailUrl: null,
        raw: meta,
        discoveryFormat: inferred.format,
      };
      if (inferred.format === 'article_summary') {
        const article = await ai.generateArticleSummary(item, channelUsername);
        caption = article.caption;
        category = article.category;
        aiScore = article.aiScore;
      } else {
        const gen = await ai.generateDiscoveryCaption(item, channelUsername);
        caption = gen.caption;
        category = gen.category;
        aiScore = gen.aiScore;
      }
    } catch (err) {
      logger.warn('url-candidate', 'AI caption fallback', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const post = posts.create({
    type: inferred.type,
    status: 'pending',
    source_url: url,
    media_url: inferred.mediaUrl,
    caption,
    raw_text: caption,
    category,
    source_title: meta.title,
    created_by: 'manual_source_link',
    discovery_format: inferred.format,
    pack_section: inferred.section,
    language: 'ru',
    ai_score: aiScore,
    quality_score: aiScore,
    content_angle: inferred.format === 'text_idea' ? 'Ручная ссылка / идея' : 'Ручная ссылка / материал',
    publish_recommendation: 'Ручной материал — проверьте перед публикацией',
    discovered_at: new Date().toISOString(),
  });

  return { postId: post.id, format: inferred.format, section: inferred.section };
}

function buildTemplateFromMeta(meta: UrlMetadata, format: DiscoveryFormat): string {
  const title = meta.title?.trim() || 'Материал по ссылке';
  const desc = meta.description?.trim() || '';
  if (format === 'text_idea') {
    return `${title}\n\n${desc || 'Короткая идея для обсуждения.'}\n\nЧто думаете?`.slice(0, 700);
  }
  return (
    `📰 ${title}\n\n${desc.slice(0, 400) || 'Материал по теме отношений и общения.'}\n\nЧто думаете?`
  ).slice(0, 900);
}
