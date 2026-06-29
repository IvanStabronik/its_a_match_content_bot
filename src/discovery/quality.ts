import type { AppConfig } from '../config.js';
import type { DiscoveryFormat } from '../types.js';
import type { LanguageAssessment } from './language.js';
import type { DiscoveredItem } from './types.js';

const TOPIC_KEYWORDS = [
  'отношен', 'дейтинг', 'свидан', 'любов', 'пар', 'общени', 'одиноч',
  'tinder', 'bumble', 'флирт', 'ревност', 'токсич', 'флаг', 'привязан',
  'dating', 'relationship', 'love', 'date', 'lonely', 'communication',
];

export interface QualityAssessment {
  qualityScore: number;
  contentAngle: string;
  publishRecommendation: string;
  reasons: string[];
}

export function scoreDiscoveredItem(
  item: DiscoveredItem,
  language: LanguageAssessment,
  config: AppConfig,
): QualityAssessment {
  const reasons: string[] = [];
  let score = 5;

  if (language.isRussianLikely) {
    score += 2;
    reasons.push('русский язык');
  } else if (language.isForeignLikely && config.discoveryRejectForeignLanguage) {
    score -= 3;
    reasons.push('иностранный язык');
  }

  const text = `${item.title ?? ''} ${item.description ?? ''}`.toLowerCase();
  if (TOPIC_KEYWORDS.some((kw) => text.includes(kw))) {
    score += 2;
    reasons.push('тема отношений');
  }

  switch (item.discoveryFormat) {
    case 'youtube_short_link':
      score += 2;
      reasons.push('короткий формат');
      break;
    case 'article_summary':
      score += 1;
      break;
    case 'meme_image':
      score += 1;
      break;
    case 'native_video':
      score += 2;
      reasons.push('нативное видео');
      break;
    default:
      break;
  }

  if (item.durationSeconds != null) {
    if (item.durationSeconds <= config.youtubeShortsMaxSeconds) {
      score += 1;
    } else if (item.durationSeconds > config.youtubeRejectOverSeconds) {
      score -= 4;
      reasons.push('слишком длинное видео');
    }
  }

  if (item.title && item.title.length >= 8) score += 0.5;

  const qualityScore = Math.min(10, Math.max(1, Math.round(score)));
  const contentAngle = inferContentAngle(item.discoveryFormat);
  const publishRecommendation =
    qualityScore >= config.discoveryMinQualityScore
      ? 'Подходит для модерации'
      : 'Низкое качество — проверьте вручную или пропустите';

  return { qualityScore, contentAngle, publishRecommendation, reasons };
}

function inferContentAngle(format: DiscoveryFormat): string {
  switch (format) {
    case 'youtube_short_link':
      return 'Короткий видео-формат для Telegram';
    case 'youtube_video_link':
      return 'Видео-идея (ссылка)';
    case 'article_summary':
      return 'Статья / новость';
    case 'meme_image':
      return 'Мем / картинка';
    case 'text_idea':
      return 'Текстовая идея';
    case 'native_video':
      return 'Нативное видео админа';
    default:
      return 'Контент для канала';
  }
}

export function shouldCreateCandidate(
  qualityScore: number,
  config: AppConfig,
): boolean {
  if (qualityScore >= config.discoveryMinQualityScore) return true;
  return config.discoveryCreateLowScore;
}
