import type { AiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import { checkForbiddenContent } from '../services/content-filter.js';
import type { PostRepository } from '../services/posts.js';
import type { SourceItemRepository, SourceRepository } from '../services/sources.js';
import type { SkipReason, Source } from '../types.js';
import { getAdapter } from './adapters/index.js';
import { resolveChannelId } from './adapters/youtube.js';
import {
  buildCaptionForItem,
  buildForeignVideoIdeaCaption,
  buildForeignVideoIdeaPost,
  buildPostFromItem,
  evaluateDiscoveredItem,
  toSourceItemInput,
} from './pipeline.js';
import type { DiscoveryRunResult, DiscoverySummary } from './types.js';

export type CreateCandidateResult = 'created' | 'skipped' | 'duplicate' | 'foreign_converted' | 'foreign_rejected';

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
    let foreignConverted = 0;
    let foreignRejected = 0;
    const errors: string[] = [];

    for (const source of enabled) {
      const result = await this.processSource(source);
      perSource.push(result);
      newCandidates += result.newCandidates;
      duplicatesSkipped += result.duplicatesSkipped;
      foreignConverted += result.foreignConverted ?? 0;
      foreignRejected += result.foreignRejected ?? 0;
      errors.push(...result.errors);
    }

    return {
      checkedSources: enabled.length,
      newCandidates,
      duplicatesSkipped,
      foreignConverted,
      foreignRejected,
      errors,
      perSource,
    };
  }

  private async persistYouTubeChannelId(source: Source): Promise<void> {
    if (source.type !== 'youtube_channel' || !this.config.youtubeApiKey) return;

    const config = this.sources.getConfig(source);
    const input = String(config.input ?? config.channelId ?? '').trim();
    if (!input) return;

    try {
      const channelId = await resolveChannelId(input, this.config.youtubeApiKey, config);
      if (config.channelId !== channelId) {
        this.sources.updateConfig(source.id, { ...config, channelId, input: config.input ?? input });
      }
    } catch (err) {
      logger.warn('discovery', 'Failed to persist YouTube channelId', {
        sourceId: source.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async processSource(source: Source): Promise<DiscoveryRunResult> {
    const result: DiscoveryRunResult = {
      sourceId: source.id,
      sourceName: source.name,
      found: 0,
      newCandidates: 0,
      duplicatesSkipped: 0,
      foreignConverted: 0,
      foreignRejected: 0,
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
      await this.persistYouTubeChannelId(source);

      const refreshedSource = this.sources.getById(source.id) ?? source;
      const items = await adapter.fetchRecentItems(refreshedSource, limits, this.config);
      result.found = items.length;

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

        try {
          const outcome = await this.createCandidate(source, item, result);
          if (outcome === 'created') {
            result.newCandidates++;
          } else if (outcome === 'foreign_converted') {
            result.newCandidates++;
            result.foreignConverted = (result.foreignConverted ?? 0) + 1;
          } else if (outcome === 'foreign_rejected') {
            result.foreignRejected = (result.foreignRejected ?? 0) + 1;
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
    item: import('./types.js').DiscoveredItem,
    runResult?: DiscoveryRunResult,
  ): Promise<CreateCandidateResult> {
    const existing = this.sourceItems.findByPlatformExternalId(item.platform, item.externalId);
    if (existing) return 'duplicate';

    const evaluation = await evaluateDiscoveredItem(item, this.config, this.ai);
    if (!evaluation.accept) {
      if (evaluation.skipReason === 'foreign_language') {
        runResult && (runResult.foreignRejected = (runResult.foreignRejected ?? 0) + 1);
      }
      this.sourceItems.createSkippedItem(
        toSourceItemInput(source.id, item, {
          skipReason: evaluation.skipReason as SkipReason,
          qualityScore: evaluation.quality.qualityScore,
          language: evaluation.language.language,
        }),
      );
      return evaluation.skipReason === 'foreign_language' ? 'foreign_rejected' : 'skipped';
    }

    if (evaluation.adaptForeignToVideoIdea) {
      return this.createForeignVideoIdeaCandidate(source, item);
    }

    const keywordWarnings = checkForbiddenContent(
      [item.title, item.description].filter(Boolean).join('\n'),
    );

    const captionData = await buildCaptionForItem(this.ai, item, this.config.channelUsername);

    if (
      this.config.discoveryMinScore > 0 &&
      captionData.aiScore != null &&
      captionData.aiScore < this.config.discoveryMinScore
    ) {
      this.sourceItems.createSkippedItem(
        toSourceItemInput(source.id, item, {
          skipReason: 'low_score',
          qualityScore: captionData.aiScore,
          language: item.language ?? null,
        }),
      );
      return 'skipped';
    }

    if (
      captionData.qualityScore != null &&
      captionData.qualityScore < this.config.discoveryMinQualityScore &&
      !this.config.discoveryCreateLowScore
    ) {
      this.sourceItems.createSkippedItem(
        toSourceItemInput(source.id, item, {
          skipReason: 'low_quality',
          qualityScore: captionData.qualityScore,
          language: item.language ?? null,
        }),
      );
      return 'skipped';
    }

    const itemInput = toSourceItemInput(source.id, item, {
      language: item.language ?? null,
      qualityScore: item.qualityScore ?? captionData.qualityScore,
    });

    this.sourceItems.createCandidateWithPost(this.posts, itemInput, (sourceItemId) =>
      buildPostFromItem(source, item, sourceItemId, captionData, keywordWarnings),
    );

    return 'created';
  }

  private async createForeignVideoIdeaCandidate(
    source: Source,
    item: import('./types.js').DiscoveredItem,
  ): Promise<CreateCandidateResult> {
    let caption = buildForeignVideoIdeaCaption(item.title);

    if (this.ai) {
      try {
        caption = await this.ai.adaptForeignVideoToIdea(item, this.config.channelUsername);
      } catch {
        // template fallback
      }
    }

    const itemInput = toSourceItemInput(source.id, item, {
      language: 'en',
      qualityScore: 5,
      discoveryFormat: 'text_idea',
    });

    this.sourceItems.createCandidateWithPost(this.posts, itemInput, (sourceItemId) =>
      buildForeignVideoIdeaPost(source, item, sourceItemId, caption),
    );

    return 'foreign_converted';
  }
}

export { buildTemplateCaption } from './pipeline.js';
