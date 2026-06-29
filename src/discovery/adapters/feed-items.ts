import type { DiscoveryFormat } from '../../types.js';
import { isDirectImageUrl } from '../../services/publish-content.js';
import type { DiscoveredItem } from '../types.js';
import { mapRssItem } from './rss.js';

const RU_TOPIC_KEYWORDS = [
  'отношен', 'дейтинг', 'свидан', 'любов', 'пар', 'общени', 'одиноч',
  'флирт', 'ревност', 'токсич', 'флаг', 'привязан', 'психолог', 'семь',
  'развод', 'брак', 'муж', 'жен', 'пикабу',
];

export function inferDiscoveryFormatFromFeedItem(
  item: import('rss-parser').Item,
  platform: string,
): DiscoveryFormat {
  const imageUrl = extractFeedImageUrl(item);
  if (imageUrl && isDirectImageUrl(imageUrl)) {
    return 'meme_image';
  }

  const text = `${item.title ?? ''} ${item.contentSnippet ?? item.content ?? ''}`.trim();
  if (text.length >= 400) return 'article_summary';
  if (text.length >= 40) return 'text_idea';
  return 'article_summary';
}

export function extractFeedImageUrl(item: import('rss-parser').Item): string | null {
  const enclosure = item.enclosure?.url?.trim();
  if (enclosure && isDirectImageUrl(enclosure)) return enclosure;

  const media = (item as { 'media:content'?: { $?: { url?: string } } })['media:content']?.$?.url;
  if (media && isDirectImageUrl(media)) return media;

  const content = item.content ?? '';
  const imgMatch = content.match(/src=["']([^"']+\.(?:jpg|jpeg|png|gif|webp))["']/i);
  if (imgMatch?.[1] && isDirectImageUrl(imgMatch[1])) return imgMatch[1];

  return null;
}

export function mapFeedItemWithFormat(
  item: import('rss-parser').Item,
  feedTitle: string | undefined,
  platform: string,
  forceFormat?: DiscoveryFormat,
): DiscoveredItem | null {
  const format = forceFormat ?? inferDiscoveryFormatFromFeedItem(item, platform);
  const mapped = mapRssItem(item, feedTitle, format);
  if (!mapped) return null;

  const imageUrl = extractFeedImageUrl(item);
  if (format === 'meme_image' && imageUrl) {
    mapped.imageUrl = imageUrl;
    mapped.thumbnailUrl = imageUrl;
  }

  mapped.platform = platform;
  applyRussianFeedBoost(mapped);
  mapped.packSectionHint = sectionHintForFormat(format);

  return mapped;
}

function sectionHintForFormat(format: DiscoveryFormat): import('../../types.js').PackSection {
  if (format === 'meme_image') return 'memes';
  if (format === 'article_summary') return 'articles';
  if (format === 'text_idea') return 'ideas';
  return 'other';
}

export function applyRussianFeedBoost(item: DiscoveredItem): void {
  const text = `${item.title ?? ''} ${item.description ?? ''}`;
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) ?? []).length;
  const letters = text.replace(/[^A-Za-z\u0400-\u04FF]/g, '').length;
  const cyrillicRatio = letters > 0 ? cyrillic / letters : 0;

  if (cyrillicRatio >= 0.2) {
    item.language = 'ru';
  }

  let boost = item.qualityScore ?? 5;
  if (cyrillicRatio >= 0.25) boost += 2;
  if (RU_TOPIC_KEYWORDS.some((kw) => text.toLowerCase().includes(kw))) boost += 1;
  item.qualityScore = Math.min(10, Math.max(1, Math.round(boost)));
}

export function scoreRussianArticleItem(item: DiscoveredItem): void {
  applyRussianFeedBoost(item);
  if (item.language === 'ru') {
    item.contentAngle = 'Русская статья / материал';
    item.publishRecommendation = 'RU RSS — приоритет для раздела «Разборы»';
  }
}
