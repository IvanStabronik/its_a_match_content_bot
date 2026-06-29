import type { AiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import type { DiscoveryService } from '../discovery/service.js';
import type {
  ContentPack,
  PackSection,
  PackSummary,
  Post,
} from '../types.js';
import { pickFallbackPolls, pickFallbackTextIdeas } from './daily-pack-templates.js';
import { ContentPackRepository } from './content-packs.js';
import { formatPackDate } from './daily-schedule.js';
import type { ScheduleAssignment } from './daily-schedule.js';
import { buildDailySchedulePreview } from './daily-schedule.js';
import { sectionForPost } from './pack-sections.js';
import type { PostRepository } from './posts.js';

export interface PackGenerationResult {
  pack: ContentPack;
  summary: PackSummary;
  created: boolean;
}

export class DailyPackService {
  constructor(
    private readonly packs: ContentPackRepository,
    private readonly posts: PostRepository,
    private readonly discovery: DiscoveryService,
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
    return this.packs.buildSummary(packId);
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
      return { pack, summary: this.packs.buildSummary(pack.id), created: false };
    }

    try {
      await this.discovery.discoverAll();

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
        const section = sectionForPost(post);
        buckets[section].push(post);
      }

      const targets: Record<PackSection, number> = {
        videos: this.config.dailyPackVideoTarget,
        memes: this.config.dailyPackMemeTarget,
        articles: this.config.dailyPackArticleTarget,
        polls: this.config.dailyPackPollTarget,
        ideas: this.config.dailyPackIdeaTarget,
        other: 0,
      };

      const linkedPostIds: number[] = [];

      for (const section of ['videos', 'memes', 'articles', 'polls', 'ideas'] as PackSection[]) {
        const target = targets[section];
        let pool = buckets[section];

        while (pool.length < target) {
          if (section === 'polls') {
            const created = await this.createPollCandidate();
            pool = [...pool, created];
          } else if (section === 'ideas') {
            const created = await this.createTextIdeaCandidate();
            pool = [...pool, created];
          } else {
            break;
          }
        }

        const picked = pool.slice(0, target);
        let position = 0;
        for (const post of picked) {
          if (linkedPostIds.length >= this.config.dailyPackMaxTotal) break;
          if (existingIds.includes(post.id) || linkedPostIds.includes(post.id)) continue;
          this.packs.addItem(pack.id, post.id, section, position++);
          this.posts.update(post.id, { pack_section: section });
          linkedPostIds.push(post.id);
        }
      }

      const summary = this.packs.buildSummary(pack.id);
      pack = this.packs.update(pack.id, {
        status: 'ready',
        generated_at: new Date().toISOString(),
        summary_json: JSON.stringify(summary),
        last_error: null,
      });

      return { pack, summary, created: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('daily-pack', 'Pack generation failed', { error: msg });
      pack = this.packs.update(pack.id, { last_error: msg });
      throw err;
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
    return (
      '🗓 Контент-пакет на сегодня готов.\n\n' +
      `Видео: ${summary.videos}\n` +
      `Мемы: ${summary.memes}\n` +
      `Статьи: ${summary.articles}\n` +
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
      created_by: 'daily_pack',
      pack_section: 'polls',
      language: 'ru',
      publish_recommendation: aiGenerated ? 'AI-опрос' : 'Шаблонный опрос',
      ai_score: aiGenerated ? 7 : 5,
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
      created_by: 'daily_pack',
      pack_section: 'ideas',
      discovery_format: 'text_idea',
      language: 'ru',
      publish_recommendation: aiGenerated ? 'AI-идея' : 'Шаблонная идея',
      ai_score: aiGenerated ? 7 : 5,
    });
  }
}
