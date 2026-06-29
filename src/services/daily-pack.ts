import type { AiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { getDailyPackSectionTarget as sectionTarget } from '../config.js';
import { logger } from '../logger.js';
import type { DiscoveryService } from '../discovery/service.js';
import type { DiscoverySummary } from '../discovery/types.js';
import type {
  ContentPack,
  PackDiagnostics,
  PackSection,
  PackSectionDiagnostics,
  PackSummary,
  Post,
} from '../types.js';
import {
  pickFallbackExplainers,
  pickFallbackMemeIdeas,
  pickFallbackPolls,
  pickFallbackTextIdeas,
  pickFallbackVideoIdeas,
} from './daily-pack-templates.js';
import { ContentPackRepository } from './content-packs.js';
import { formatPackDate } from './daily-schedule.js';
import type { ScheduleAssignment } from './daily-schedule.js';
import { buildDailySchedulePreview } from './daily-schedule.js';
import {
  buildSourcesStatus,
  classifyPostForSection,
  emptyDiagnostics,
  initSectionDiagnostics,
} from './pack-diagnostics.js';
import {
  sectionForPost,
  sortVideoCandidates,
} from './pack-sections.js';
import type { PostRepository } from './posts.js';
import { runStarterSourcesSetup } from './starter-sources.js';
import type { SourceRepository } from './sources.js';

export interface PackGenerationResult {
  pack: ContentPack;
  summary: PackSummary;
  diagnostics: PackDiagnostics;
  created: boolean;
}

const PACK_SECTIONS = ['videos', 'memes', 'articles', 'polls', 'ideas'] as const;
type GuaranteedSection = (typeof PACK_SECTIONS)[number];

export class DailyPackService {
  private lastDiagnostics: PackDiagnostics = emptyDiagnostics();

  constructor(
    private readonly packs: ContentPackRepository,
    private readonly posts: PostRepository,
    private readonly discovery: DiscoveryService,
    private readonly sources: SourceRepository,
    private readonly config: AppConfig,
    private readonly ai: AiModule | null,
  ) {}

  getTodayDateString(reference = new Date()): string {
    return formatPackDate(reference, this.config.dailyPackTimezone);
  }

  createOrGetTodayPack(reference = new Date()): ContentPack {
    return this.packs.createOrGet(this.getTodayDateString(reference));
  }

  getPackSummary(packId: number): PackSummary {
    return this.packs.buildDetailedSummary(packId, this.posts);
  }

  getPackDiagnostics(pack: ContentPack): PackDiagnostics {
    if (pack.diagnostics_json) {
      try {
        return JSON.parse(pack.diagnostics_json) as PackDiagnostics;
      } catch {
        // fall through
      }
    }
    return this.lastDiagnostics;
  }

  listPackItemsBySection(packId: number, section: PackSection) {
    return this.packs.listItemsBySection(packId, section);
  }

  listSelectedItems(packId: number) {
    return this.packs.listSelectedItems(packId);
  }

  getPostById(postId: number): Post | null {
    return this.posts.getById(postId);
  }

  markPackScheduled(packId: number): void {
    this.packs.markScheduled(packId);
  }

  getPostsRepository(): PostRepository {
    return this.posts;
  }

  getPostForPackItem(packId: number, postId: number): Post | null {
    const item = this.packs.getItemByPostId(packId, postId);
    if (!item) return null;
    return this.posts.getById(postId);
  }

  toggleSelected(packId: number, postId: number): boolean {
    const item = this.packs.getItemByPostId(packId, postId);
    if (!item) return false;
    const next = item.selected === 0;
    this.packs.setSelected(packId, postId, next);
    this.posts.update(postId, { selected_for_today: next ? 1 : 0 });
    return next;
  }

  unselect(packId: number, postId: number): void {
    this.packs.setSelected(packId, postId, false);
    this.posts.update(postId, { selected_for_today: 0 });
  }

  async generateTodayPack(options: { rebuild?: boolean } = {}): Promise<PackGenerationResult> {
    const packDate = this.getTodayDateString();
    let pack = this.packs.createOrGet(packDate);

    if (!options.rebuild && pack.generated_at) {
      return {
        pack,
        summary: this.packs.buildDetailedSummary(pack.id, this.posts),
        diagnostics: this.getPackDiagnostics(pack),
        created: false,
      };
    }

    const diagnostics = emptyDiagnostics();
    const sectionDiag = new Map<GuaranteedSection, PackSectionDiagnostics>();
    for (const s of PACK_SECTIONS) sectionDiag.set(s, initSectionDiagnostics(s));

    try {
      if (this.config.starterSourcesAutoFix) {
        const setup = runStarterSourcesSetup(this.sources, this.config);
        if (setup.added.length > 0) {
          diagnostics.warnings.push(`setup_sources: добавлено ${setup.added.length} источников`);
        }
        if (setup.paused.length > 0) {
          diagnostics.warnings.push(`setup_sources: отключено ${setup.paused.length} legacy источников`);
        }
      }

      const discoverySummary = await this.discovery.discoverAll();
      diagnostics.discoverySummary = {
        checkedSources: discoverySummary.checkedSources,
        newCandidates: discoverySummary.newCandidates,
        foreignConverted: discoverySummary.foreignConverted,
        foreignRejected: discoverySummary.foreignRejected,
        errors: discoverySummary.errors,
      };

      if (options.rebuild) {
        this.packs.clearItems(pack.id);
      }

      const since = new Date(
        Date.now() - this.config.dailyAutoDiscoveryLookbackHours * 60 * 60 * 1000,
      ).toISOString();

      const existingIds = this.packs.listAllItems(pack.id).map((i) => i.post_id);
      const candidates = this.posts.findRecentPendingSince(since, existingIds);

      const buckets: Record<PackSection, Post[]> = {
        videos: [],
        memes: [],
        articles: [],
        polls: [],
        ideas: [],
        other: [],
      };

      for (const post of candidates) {
        const sec = sectionForPost(post);
        if (sec !== 'other') buckets[sec].push(post);
      }

      buckets.videos = sortVideoCandidates(buckets.videos);

      const linkedPostIds: number[] = [];

      for (const section of PACK_SECTIONS) {
        const target = sectionTarget(this.config, section);
        const diag = sectionDiag.get(section)!;
        let pool = [...buckets[section]];

        await this.fillSection(section, target, pool, pack.id, linkedPostIds, existingIds, diag, discoverySummary);

        diag.total = this.packs.listItemsBySection(pack.id, section).length;
        sectionDiag.set(section, diag);
      }

      diagnostics.sections = PACK_SECTIONS.map((s) => sectionDiag.get(s)!);
      diagnostics.sourcesStatus = buildSourcesStatus(this.sources, this.posts, this.config);

      const summary = this.packs.buildDetailedSummary(pack.id, this.posts);
      this.validateMinimums(summary, diagnostics);

      pack = this.packs.update(pack.id, {
        status: 'ready',
        generated_at: new Date().toISOString(),
        summary_json: JSON.stringify(summary),
        diagnostics_json: JSON.stringify(diagnostics),
        last_error: null,
      });

      this.lastDiagnostics = diagnostics;

      return { pack, summary, diagnostics, created: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('daily-pack', 'Pack generation failed', { error: msg });
      pack = this.packs.update(pack.id, { last_error: msg, diagnostics_json: JSON.stringify(diagnostics) });
      throw err;
    }
  }

  private async fillSection(
    section: GuaranteedSection,
    target: number,
    pool: Post[],
    packId: number,
    linkedPostIds: number[],
    existingIds: number[],
    diag: PackSectionDiagnostics,
    discoverySummary: DiscoverySummary,
  ): Promise<void> {
    let position = this.packs.listItemsBySection(packId, section).length;

    for (const post of pool) {
      if (this.packs.listItemsBySection(packId, section).length >= target) break;
      if (linkedPostIds.length >= this.config.dailyPackMaxTotal) break;
      if (existingIds.includes(post.id) || linkedPostIds.includes(post.id)) continue;

      this.packs.addItem(packId, post.id, section, position++);
      this.posts.update(post.id, { pack_section: section });
      linkedPostIds.push(post.id);

      const kind = classifyPostForSection(post, section);
      if (kind === 'real') diag.real++;
      else diag.backfill++;
    }

    while (
      this.packs.listItemsBySection(packId, section).length < target &&
      linkedPostIds.length < this.config.dailyPackMaxTotal
    ) {
      if (!this.config.dailyPackAllowAiBackfill && !this.config.dailyPackGuaranteeMinimum) break;

      const created = await this.createBackfillCandidate(section);
      if (existingIds.includes(created.id) || linkedPostIds.includes(created.id)) continue;

      this.packs.addItem(packId, created.id, section, position++);
      linkedPostIds.push(created.id);
      diag.backfill++;
    }

    this.appendSectionDiagnosticLines(section, diag, discoverySummary);
  }

  private appendSectionDiagnosticLines(
    section: GuaranteedSection,
    diag: PackSectionDiagnostics,
    ds: DiscoverySummary,
  ): void {
    if (section === 'videos') {
      if (ds.foreignConverted > 0) {
        diag.lines.push(`${ds.foreignConverted} иностранных Shorts → видео-идеи`);
      }
      if (diag.backfill > 0 && diag.real === 0) {
        diag.lines.push('AI video ideas сгенерированы');
      }
    }
    if (section === 'memes' && diag.real === 0 && diag.backfill > 0) {
      if (!this.config.redditClientId) diag.lines.push('Reddit не настроен — AI meme ideas');
      else diag.lines.push('AI meme ideas сгенерированы');
    }
    if (section === 'articles' && diag.real === 0 && diag.backfill > 0) {
      diag.lines.push('RSS отсутствует или пуст — AI explainers');
    }
    if (section === 'polls' && diag.backfill > 0) {
      diag.lines.push('AI/шаблонные опросы');
    }
    if (section === 'ideas' && diag.backfill > 0) {
      diag.lines.push('AI/шаблонные текст-идеи');
    }
  }

  private validateMinimums(summary: PackSummary, diagnostics: PackDiagnostics): void {
    if (!this.config.dailyPackGuaranteeMinimum || !this.config.dailyPackEmptySectionIsError) return;

    const mins: Record<PackSection, number> = {
      videos: this.config.dailyPackMinVideos,
      memes: this.config.dailyPackMinMemes,
      articles: this.config.dailyPackMinArticles,
      polls: this.config.dailyPackMinPolls,
      ideas: this.config.dailyPackMinIdeas,
      other: 0,
    };

    for (const section of PACK_SECTIONS) {
      const count = summary[section];
      if (count < mins[section]) {
        diagnostics.warnings.push(`Секция ${section}: ${count}/${mins[section]} (ниже минимума)`);
      }
    }
  }

  private async createBackfillCandidate(section: GuaranteedSection): Promise<Post> {
    switch (section) {
      case 'videos':
        return this.createVideoIdeaCandidate();
      case 'memes':
        return this.createMemeIdeaCandidate();
      case 'articles':
        return this.createExplainerCandidate();
      case 'polls':
        return this.createPollCandidate();
      case 'ideas':
        return this.createTextIdeaCandidate();
      default:
        return this.createTextIdeaCandidate();
    }
  }

  async rebuildTodayPack(): Promise<PackGenerationResult> {
    return this.generateTodayPack({ rebuild: true });
  }

  buildSchedulePreview(packId: number): {
    preview: ReturnType<typeof buildDailySchedulePreview>;
    postIds: number[];
  } {
    const selected = this.packs.listSelectedItems(packId);
    const postIds = selected.map((i) => i.post_id);
    const preview = buildDailySchedulePreview(
      postIds,
      this.config.dailyScheduleSlots,
      this.config.dailyPackTimezone,
    );
    return { preview, postIds };
  }

  applySchedule(assignments: ScheduleAssignment[]): void {
    for (const a of assignments) {
      this.posts.update(a.postId, {
        status: 'scheduled',
        scheduled_at: a.scheduledAt,
      });
    }
  }

  markNotified(packId: number): void {
    this.packs.update(packId, { notified_at: new Date().toISOString() });
  }

  shouldNotify(pack: ContentPack): boolean {
    return this.config.dailyPackNotifyAdmins && !pack.notified_at && !!pack.generated_at;
  }

  buildNotificationText(summary: PackSummary): string {
    const b = summary.breakdown;
    const fmt = (sec: PackSection, label: string, count: number) => {
      const br = b?.[sec];
      if (br && br.backfill > 0) {
        return `${label}: ${count} (${br.real} найдено, ${br.backfill} AI)`;
      }
      return `${label}: ${count}`;
    };

    return (
      '🗓 Контент-пакет на сегодня готов.\n\n' +
      `${fmt('videos', 'Видео', summary.videos)}\n` +
      `${fmt('memes', 'Мемы', summary.memes)}\n` +
      `${fmt('articles', 'Разборы', summary.articles)}\n` +
      `Опросы: ${summary.polls}\n` +
      `Идеи: ${summary.ideas}\n\n` +
      'Открыть: /today'
    );
  }

  private async createPollCandidate(): Promise<Post> {
    const channel = this.config.channelUsername;
    let question: string;
    let options: string[];
    let aiGenerated = false;

    if (this.ai) {
      try {
        const polls = await this.ai.generateDailyPollIdeas(1, channel);
        question = polls[0]!.question;
        options = polls[0]!.options;
        aiGenerated = true;
      } catch {
        const fallback = pickFallbackPolls(1)[0]!;
        question = fallback.question;
        options = fallback.options;
      }
    } else {
      const fallback = pickFallbackPolls(1)[0]!;
      question = fallback.question;
      options = fallback.options;
    }

    return this.posts.create({
      type: 'poll',
      status: 'pending',
      category: 'poll',
      caption: question,
      raw_text: question,
      poll_question: question,
      poll_options_json: JSON.stringify(options),
      created_by: 'daily_pack_ai',
      pack_section: 'polls',
      source_title: aiGenerated ? 'AI poll' : 'Template poll',
      language: 'ru',
      publish_recommendation: aiGenerated ? 'AI-опрос' : 'Шаблонный опрос',
      ai_score: aiGenerated ? 7 : 5,
      quality_score: aiGenerated ? 7 : 5,
      content_angle: 'Опрос',
    });
  }

  private async createTextIdeaCandidate(): Promise<Post> {
    const channel = this.config.channelUsername;
    let caption: string;
    let aiGenerated = false;

    if (this.ai) {
      try {
        const ideas = await this.ai.generateDailyTextIdeas(1, channel);
        caption = ideas[0]!.caption;
        aiGenerated = true;
      } catch {
        caption = pickFallbackTextIdeas(1)[0]!.caption;
      }
    } else {
      caption = pickFallbackTextIdeas(1)[0]!.caption;
    }

    return this.posts.create({
      type: 'text',
      status: 'pending',
      category: 'observation',
      caption,
      raw_text: caption,
      created_by: 'daily_pack_ai',
      pack_section: 'ideas',
      discovery_format: 'text_idea',
      source_title: aiGenerated ? 'AI text idea' : 'Template text idea',
      language: 'ru',
      publish_recommendation: aiGenerated ? 'AI-идея' : 'Шаблонная идея',
      ai_score: aiGenerated ? 7 : 5,
      quality_score: aiGenerated ? 7 : 5,
      content_angle: 'Текстовая идея',
    });
  }

  private async createVideoIdeaCandidate(): Promise<Post> {
    const channel = this.config.channelUsername;
    let caption: string;
    let aiGenerated = false;

    if (this.ai) {
      try {
        const ideas = await this.ai.generateDailyVideoIdeas(1, channel);
        caption = ideas[0]!.caption;
        aiGenerated = true;
      } catch {
        caption = pickFallbackVideoIdeas(1)[0]!.caption;
      }
    } else {
      caption = pickFallbackVideoIdeas(1)[0]!.caption;
    }

    return this.posts.create({
      type: 'text',
      status: 'pending',
      category: 'observation',
      caption,
      raw_text: caption,
      created_by: 'daily_pack_ai',
      pack_section: 'videos',
      discovery_format: 'text_idea',
      source_title: 'AI video idea',
      source_url: null,
      language: 'ru',
      publish_recommendation: 'Можно опубликовать как текст или использовать для будущего видео.',
      ai_score: aiGenerated ? 7 : 5,
      quality_score: aiGenerated ? 7 : 5,
      content_angle: 'Видео-идея',
    });
  }

  private async createMemeIdeaCandidate(): Promise<Post> {
    if (this.config.memeBackfillMode === 'off' && !this.config.dailyPackGuaranteeMinimum) {
      return this.createTextIdeaCandidate();
    }

    const channel = this.config.channelUsername;
    let caption: string;
    let aiGenerated = false;

    if (this.ai && this.config.memeBackfillMode !== 'off') {
      try {
        const ideas = await this.ai.generateDailyMemeIdeas(1, channel);
        caption = ideas[0]!.caption;
        aiGenerated = true;
      } catch {
        caption = pickFallbackMemeIdeas(1)[0]!.caption;
      }
    } else {
      caption = pickFallbackMemeIdeas(1)[0]!.caption;
    }

    return this.posts.create({
      type: 'text',
      status: 'pending',
      category: 'dating_meme',
      caption,
      raw_text: caption,
      created_by: 'daily_pack_ai',
      pack_section: 'memes',
      discovery_format: 'text_idea',
      source_title: 'AI meme idea',
      source_url: null,
      language: 'ru',
      publish_recommendation: 'AI-мемная текстовая идея',
      ai_score: aiGenerated ? 7 : 5,
      quality_score: aiGenerated ? 7 : 5,
      content_angle: 'Мемная текстовая идея',
    });
  }

  private async createExplainerCandidate(): Promise<Post> {
    if (this.config.articleBackfillMode === 'off' && !this.config.dailyPackGuaranteeMinimum) {
      return this.createTextIdeaCandidate();
    }

    const channel = this.config.channelUsername;
    let caption: string;
    let aiGenerated = false;

    if (this.ai && this.config.articleBackfillMode !== 'off') {
      try {
        const items = await this.ai.generateDailyExplainers(1, channel);
        caption = items[0]!.caption;
        aiGenerated = true;
      } catch {
        caption = pickFallbackExplainers(1)[0]!.caption;
      }
    } else {
      caption = pickFallbackExplainers(1)[0]!.caption;
    }

    return this.posts.create({
      type: 'text',
      status: 'pending',
      category: 'news',
      caption,
      raw_text: caption,
      created_by: 'daily_pack_ai',
      pack_section: 'articles',
      discovery_format: 'article_summary',
      source_title: 'AI explainer',
      source_url: null,
      language: 'ru',
      publish_recommendation: 'AI-разбор без внешнего источника',
      ai_score: aiGenerated ? 7 : 5,
      quality_score: aiGenerated ? 7 : 5,
      content_angle: 'Разбор',
    });
  }
}
