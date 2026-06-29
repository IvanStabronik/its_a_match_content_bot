import type { AiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import type { CreatePostInput, PostType, SkipReason, Warning } from '../types.js';
import { logger } from '../logger.js';
import { checkForbiddenContent, mergeWarnings } from '../services/content-filter.js';
import { isDirectImageUrl } from '../services/publish-content.js';
import type { PostRepository } from '../services/posts.js';
import type { SourceItemInput, SourceItemRepository, SourceRepository } from '../services/sources.js';
import type { Source } from '../types.js';
import { assessLanguage, isAllowedLanguage, itemTextForLanguage } from './language.js';
import { scoreDiscoveredItem, shouldCreateCandidate } from './quality.js';
import type { DiscoveredItem } from './types.js';

export function buildTemplateCaption(item: DiscoveredItem): string {
  const title = item.title?.trim() || 'Интересный материал';
  if (item.discoveryFormat === 'article_summary') {
    return (
      `📰 Материал по теме отношений и общения.\n\n` +
      `${title}\n\n` +
      `Кратко: ${(item.description ?? '').slice(0, 300) || 'смотрите по ссылке'}\n\n` +
      `Что думаете?`
    );
  }
  return `Нашёл материал по теме отношений и общения.\n\n${title}\n\nЧто думаете?`;
}

export type CreateCandidateResult = 'created' | 'skipped';

export async function buildCaptionForItem(
  ai: AiModule | null,
  item: DiscoveredItem,
  channelUsername: string,
): Promise<{
  caption: string;
  category: import('../types.js').PostCategory | null;
  aiScore: number | null;
  riskScore: number | null;
  riskReason: string | null;
  warnings: Warning[];
  qualityScore: number | null;
}> {
  let caption = buildTemplateCaption(item);
  let category: import('../types.js').PostCategory | null = null;
  let aiScore: number | null = item.discoveryFormat === 'article_summary' ? 4 : 5;
  let riskScore: number | null = null;
  let riskReason: string | null = null;
  let warnings: Warning[] = [];
  let qualityScore: number | null = aiScore;

  if (!ai) return { caption, category, aiScore, riskScore, riskReason, warnings, qualityScore };

  try {
    if (item.discoveryFormat === 'article_summary') {
      const article = await ai.generateArticleSummary(item, channelUsername);
      caption = article.caption;
      category = article.category;
      aiScore = article.aiScore;
      riskScore = article.riskScore;
      riskReason = article.riskReason;
      qualityScore = article.qualityScore;
      warnings = article.warnings;
    } else {
      const generated = await ai.generateDiscoveryCaption(item, channelUsername);
      caption = generated.caption;
      category = generated.category;
      aiScore = generated.aiScore;
      riskScore = generated.riskScore;
      riskReason = generated.riskReason;
      qualityScore = generated.aiScore;
      warnings = generated.warnings;
    }
  } catch (err) {
    logger.warn('discovery', 'AI caption fallback to template', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { caption, category, aiScore, riskScore, riskReason, warnings, qualityScore };
}

export function resolvePostType(item: DiscoveredItem): PostType {
  if (item.discoveryFormat === 'meme_image' && item.imageUrl && isDirectImageUrl(item.imageUrl)) {
    return 'photo';
  }
  if (item.discoveryFormat === 'text_idea') return 'text';
  return 'link';
}

export function toSourceItemInput(
  sourceId: number,
  item: DiscoveredItem,
  extra?: Partial<SourceItemInput>,
): SourceItemInput {
  return {
    sourceId,
    platform: item.platform,
    externalId: item.externalId,
    url: item.url,
    title: item.title,
    description: item.description,
    author: item.author,
    publishedAt: item.publishedAt,
    thumbnailUrl: item.thumbnailUrl,
    raw: item.raw,
    discoveryFormat: item.discoveryFormat,
    language: item.language ?? null,
    durationSeconds: item.durationSeconds ?? null,
    qualityScore: item.qualityScore ?? null,
    shortsUrl: item.shortsUrl ?? null,
    imageUrl: item.imageUrl ?? null,
    skipReason: null,
    ...extra,
  };
}

export async function evaluateDiscoveredItem(
  item: DiscoveredItem,
  config: AppConfig,
  ai: AiModule | null,
): Promise<{
  accept: boolean;
  skipReason?: SkipReason;
  adaptForeignToVideoIdea?: boolean;
  allowWithWarning?: boolean;
  language: ReturnType<typeof assessLanguage>;
  quality: ReturnType<typeof scoreDiscoveredItem>;
}> {
  const language = assessLanguage(itemTextForLanguage(item));
  item.language = language.language;

  const isYoutube =
    item.discoveryFormat === 'youtube_short_link' ||
    item.discoveryFormat === 'youtube_video_link';

  if (language.isForeignLikely && item.discoveryFormat !== 'article_summary') {
    const mode = config.discoveryForeignLanguageMode;

    if (
      isYoutube &&
      mode === 'adapt_or_demote' &&
      config.dailyPackAllowForeignVideoIdeas &&
      config.dailyPackForeignVideoMode === 'adapt_to_text_idea'
    ) {
      const quality = scoreDiscoveredItem(item, language, config);
      item.qualityScore = quality.qualityScore;
      item.contentAngle = 'Видео-идея (иностранный Shorts)';
      item.publishRecommendation =
        'Видео на иностранном языке — лучше сделать текст-пост или адаптировать.';
      return { accept: true, adaptForeignToVideoIdea: true, language, quality };
    }

    if (mode === 'allow_with_warning') {
      const quality = scoreDiscoveredItem(item, language, config);
      item.qualityScore = quality.qualityScore;
      return { accept: true, allowWithWarning: true, language, quality };
    }

    if (mode === 'reject' || config.discoveryRejectForeignLanguage) {
      return {
        accept: false,
        skipReason: 'foreign_language',
        language,
        quality: scoreDiscoveredItem(item, language, config),
      };
    }
  }

  if (
    item.durationSeconds != null &&
    item.durationSeconds > config.youtubeRejectOverSeconds &&
    item.discoveryFormat.startsWith('youtube')
  ) {
    return { accept: false, skipReason: 'too_long', language, quality: scoreDiscoveredItem(item, language, config) };
  }

  const quality = scoreDiscoveredItem(item, language, config);
  item.qualityScore = quality.qualityScore;
  item.contentAngle = quality.contentAngle;
  item.publishRecommendation = quality.publishRecommendation;

  if (!isAllowedLanguage(language, config)) {
    if (item.discoveryFormat !== 'article_summary') {
      return { accept: false, skipReason: 'foreign_language', language, quality };
    }
  }

  if (!shouldCreateCandidate(quality.qualityScore, config)) {
    return { accept: false, skipReason: 'low_quality', language, quality };
  }

  return { accept: true, language, quality };
}

export function buildForeignVideoIdeaCaption(title: string | null | undefined): string {
  const t = title?.trim() || 'короткое видео';
  return (
    `Нашёл короткое видео на английском по теме «${t}».\n\n` +
    `Для канала лучше использовать как текстовую идею: пересказать мысль из ролика своими словами на русском, без автоплея ссылки.\n\n` +
    `Оригинал: ${t}`
  );
}

export function buildForeignVideoIdeaPost(
  source: Source,
  item: DiscoveredItem,
  sourceItemId: number,
  caption: string,
): CreatePostInput {
  const now = new Date().toISOString();
  const foreignWarning = JSON.stringify([
    {
      type: 'category' as const,
      message: 'Источник на иностранном языке',
      category: 'foreign_language',
    },
  ]);

  return {
    type: 'text',
    status: 'pending',
    source_url: item.shortsUrl ?? item.url,
    caption,
    raw_text: caption,
    category: 'observation',
    ai_score: 5,
    quality_score: 5,
    warnings: foreignWarning,
    discovery_source_id: source.id,
    discovery_item_id: sourceItemId,
    source_title: 'Foreign video idea (EN)',
    source_author: item.author,
    thumbnail_url: item.thumbnailUrl ?? null,
    discovered_at: now,
    created_by: 'discovery',
    discovery_format: 'text_idea',
    language: 'en',
    duration_seconds: item.durationSeconds ?? null,
    content_angle: 'Видео-идея (иностранный Shorts)',
    publish_recommendation:
      'Видео на иностранном языке — лучше сделать текст-пост или адаптировать.',
    shorts_url: item.shortsUrl ?? null,
    pack_section: 'videos',
  };
}

export function buildPostFromItem(
  source: Source,
  item: DiscoveredItem,
  sourceItemId: number,
  captionData: Awaited<ReturnType<typeof buildCaptionForItem>>,
  keywordWarnings: Warning[],
): CreatePostInput {
  const now = new Date().toISOString();
  let warnings = keywordWarnings.length > 0 ? JSON.stringify(keywordWarnings) : null;
  if (captionData.warnings.length > 0) {
    warnings = mergeWarnings(warnings, captionData.warnings);
  }
  if (captionData.riskScore != null && captionData.riskScore > 7 && captionData.riskReason) {
    warnings = mergeWarnings(warnings, [
      {
        type: 'risk_score',
        message: `Высокий риск (${captionData.riskScore}/10): ${captionData.riskReason}`,
        risk_score: captionData.riskScore,
      },
    ]);
  }

  const postType = resolvePostType(item);

  return {
    type: postType,
    status: 'pending',
    source_url: item.url,
    media_url: postType === 'photo' ? item.imageUrl : null,
    caption: captionData.caption,
    raw_text: captionData.caption,
    category: captionData.category,
    ai_score: captionData.aiScore,
    risk_score: captionData.riskScore,
    risk_reason: captionData.riskReason,
    warnings,
    discovery_source_id: source.id,
    discovery_item_id: sourceItemId,
    source_title: item.title,
    source_author: item.author,
    thumbnail_url: item.thumbnailUrl ?? item.imageUrl ?? null,
    discovered_at: now,
    created_by: 'discovery',
    discovery_format: item.discoveryFormat,
    language: item.language ?? null,
    duration_seconds: item.durationSeconds ?? null,
    quality_score: item.qualityScore ?? captionData.qualityScore,
    content_angle: item.contentAngle ?? null,
    publish_recommendation: item.publishRecommendation ?? null,
    shorts_url: item.shortsUrl ?? null,
    pack_section: item.packSectionHint ?? null,
  };
}
