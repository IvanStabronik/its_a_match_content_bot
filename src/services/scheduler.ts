import type { Bot } from 'grammy';
import { logger } from '../logger.js';
import type { PostRepository } from './posts.js';
import { PublisherService } from './publisher.js';
import { formatDateTime } from './schedule-parser.js';

const CHECK_INTERVAL_MS = 30_000;
const MISSED_THRESHOLD_MS = 60 * 60 * 1000;

export class SchedulerService {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private processing = new Set<number>();

  constructor(
    private readonly posts: PostRepository,
    private readonly publisher: PublisherService,
    private readonly adminIds: number[],
    private readonly timezone: string,
  ) {}

  start(bot: Bot): void {
    setTimeout(() => {
      this.runStartupRecovery(bot).catch((err) => {
        logger.error('scheduler', 'Startup recovery failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, 0);

    this.intervalId = setInterval(() => {
      this.tick(bot).catch((err) => {
        logger.error('scheduler', 'Tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }, CHECK_INTERVAL_MS);

    logger.info('scheduler', 'Scheduler started');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private async runStartupRecovery(bot: Bot): Promise<void> {
    const nowIso = new Date().toISOString();
    const due = this.posts.getDueScheduled(nowIso);
    logger.info('scheduler', 'Startup recovery', { dueCount: due.length });

    for (const post of due) {
      await this.processDuePost(bot, post.id, post.scheduled_at!);
    }
  }

  private async tick(bot: Bot): Promise<void> {
    const nowIso = new Date().toISOString();
    const due = this.posts.getDueScheduled(nowIso);

    for (const post of due) {
      if (this.processing.has(post.id)) continue;
      await this.processDuePost(bot, post.id, post.scheduled_at!);
    }
  }

  private async processDuePost(bot: Bot, postId: number, scheduledAt: string): Promise<void> {
    if (this.processing.has(postId)) return;
    this.processing.add(postId);

    try {
      const now = Date.now();
      const scheduledTime = new Date(scheduledAt).getTime();
      const missedBy = now - scheduledTime;

      if (missedBy > MISSED_THRESHOLD_MS) {
        this.posts.update(postId, { status: 'missed' });
        logger.warn('scheduler', 'Post marked as missed', { postId });
        for (const adminId of this.adminIds) {
          await bot.api.sendMessage(
            adminId,
            `⏰ Пропущена публикация ID ${postId} (запланировано: ${formatDateTime(scheduledAt, this.timezone)})`,
          );
        }
        return;
      }

      await this.publisher.publishScheduled(bot.api, postId, bot, this.adminIds);
    } finally {
      this.processing.delete(postId);
    }
  }
}
