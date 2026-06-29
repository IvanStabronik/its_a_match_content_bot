import type { AiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import { checkForbiddenContent, mergeWarnings } from '../services/content-filter.js';
import type { PostRepository } from '../services/posts.js';
import type { SourceItemRepository, SourceRepository } from '../services/sources.js';
import type { Source } from '../types.js';
import { getAdapter } from './adapters/index.js';
import type { DiscoveredItem, DiscoveryRunResult, DiscoverySummary } from './types.js';

export function buildTemplateCaption(item: DiscoveredItem): string {
  const title = item.title?.trim() || 'Интересный материал';
  return `Нашёл материал по теме отношений и общения.\n\n${title}\n\nЧто думаете?`;
}

export class DiscoveryService {
  constructor(
    private readonly sources: SourceRepository,
    private readonly sourceItems: SourceItemRepository,
    private readonly posts: PostRepository,
    private readonly config: AppConfig,
    private readonly ai: AiModule | null,
  ) {}

  async checkSource(sourceId: number): Promise<DiscoveryRunResult> {
    const source = this.sources.getById(sourceId);
    if (!source) {
      return {
        sourceId,
        sourceName: '?',
        found: 0,
        newCandidates: 0,
        duplicatesSkipped: 0,
        errors: ['Источник не найден'],
      };
    }
    return this.processSource(source);
  }

  async discoverAll(): Promise<DiscoverySummary> {
    const enabled = this.sources.listEnabled();
    const perSource: DiscoveryRunResult[] = [];
    let newCandidates = 0;
    let duplicatesSkipped = 0;
    const errors: string[] = [];

    for (const source of enabled) {
      const result = await this.processSource(source);
      perSource.push(result);
      newCandidates += result.newCandidates;
      duplicatesSkipped += result.duplicatesSkipped;
      errors.push(...result.errors);
    }

    return {
      checkedSources: enabled.length,
      newCandidates,
      duplicatesSkipped,
      errors,
      perSource,
    };
  }

  private async processSource(source: Source): Promise<DiscoveryRunResult> {
    const result: DiscoveryRunResult = {
      sourceId: source.id,
      sourceName: source.name,
      found: 0,
      newCandidates: 0,
      duplicatesSkipped: 0,
      errors: [],
    };

    const adapter = getAdapter(source.type);
    const config = this.sources.getConfig(source);
    const validationError = adapter.validateConfig(config);
    if (validationError) {
      result.errors.push(validationError);
      this.sources.markChecked(source.id, validationError);
      return result;
    }

    const limits = {
      maxItems: this.config.discoveryMaxItemsPerSource,
      lookbackHours: this.config.discoveryLookbackHours,
    };

    try {
      const items = await adapter.fetchRecentItems(source, limits, this.config.youtubeApiKey);
      result.found = items.length;

      if (source.type === 'youtube_channel' && config.channelId) {
        this.sources.updateConfig(source.id, { ...config, channelId: config.channelId });
      }

      if (!this.config.discoveryAutoCreateCandidates) {
        this.sources.markChecked(source.id, null);
        return result;
      }

      for (const item of items) {
        if (result.newCandidates >= limits.maxItems) break;

        const existing = this.sourceItems.findByPlatformExternalId(item.platform, item.externalId);
        if (existing) {
          result.duplicatesSkipped++;
          continue;
        }

        const textForFilter = [item.title, item.description].filter(Boolean).join('\n');
        const keywordWarnings = checkForbiddenContent(textForFilter);

        try {
          const created = await this.createCandidate(source, item, keywordWarnings);
          if (created) {
            result.newCandidates++;
          } else {
            result.duplicatesSkipped++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          result.errors.push(msg);
        }
      }

      this.sources.markChecked(source.id, result.errors.length > 0 ? result.errors.join('; ') : null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(msg);
      this.sources.markChecked(source.id, msg);
      logger.error('discovery', 'Source check failed', { sourceId: source.id, error: msg });
    }

    return result;
  }

  private async createCandidate(
    source: Source,
    item: DiscoveredItem,
    keywordWarnings: import('../types.js').Warning[],
  ): Promise<boolean> {
    const existing = this.sourceItems.findByPlatformExternalId(item.platform, item.externalId);
    if (existing) return false;

    let caption = buildTemplateCaption(item);
    let category: import('../types.js').PostCategory | null = null;
    let aiScore: number | null = null;
    let riskScore: number | null = null;
    let riskReason: string | null = null;
    let warnings = keywordWarnings.length > 0 ? JSON.stringify(keywordWarnings) : null;

    if (this.ai) {
      try {
        const generated = await this.ai.generateDiscoveryCaption(item, this.config.channelUsername);
        caption = generated.caption;
        category = generated.category;
        aiScore = generated.aiScore;
        riskScore = generated.riskScore;
        riskReason = generated.riskReason;

        if (this.config.discoveryMinScore > 0 && aiScore < this.config.discoveryMinScore) {
          return false;
        }

        if (generated.warnings.length > 0) {
          warnings = mergeWarnings(warnings, generated.warnings);
        }
        if (riskScore > 7) {
          warnings = mergeWarnings(
            warnings,
            [{ type: 'risk_score', message: `Высокий риск (${riskScore}/10): ${riskReason}`, risk_score: riskScore }],
          );
        }
      } catch (err) {
        logger.warn('discovery', 'AI caption fallback to template', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const sourceItem = this.sourceItems.create({
      sourceId: source.id,
      platform: item.platform,
      externalId: item.externalId,
      url: item.url,
      title: item.title,
      description: item.description,
      author: item.author,
      publishedAt: item.publishedAt,
      thumbnailUrl: item.thumbnailUrl,
      raw: item.raw,
    });

    const now = new Date().toISOString();
    const post = this.posts.create({
      type: 'link',
      status: 'pending',
      source_url: item.url,
      caption,
      raw_text: caption,
      category,
      ai_score: aiScore,
      risk_score: riskScore,
      risk_reason: riskReason,
      warnings,
      discovery_source_id: source.id,
      discovery_item_id: sourceItem.id,
      source_title: item.title,
      source_author: item.author,
      thumbnail_url: item.thumbnailUrl,
      discovered_at: now,
      created_by: 'discovery',
    });

    this.sourceItems.linkCandidate(sourceItem.id, post.id);
    return true;
  }
}
