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
      this.tick(bot);
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
      if (this.processing.has(post.id)) continue;
      this.processing.add(post.id);
      void this.processDuePost(bot, post.id, post.scheduled_at!)
        .catch((err) => {
          logger.error('scheduler', 'Startup due post processing failed', {
            postId: post.id,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.processing.delete(post.id);
        });
    }
  }

  private tick(bot: Bot): void {
    const nowIso = new Date().toISOString();
    const due = this.posts.getDueScheduled(nowIso);

    for (const post of due) {
      if (this.processing.has(post.id)) continue;
      this.processing.add(post.id);
      void this.processDuePost(bot, post.id, post.scheduled_at!)
        .catch((err) => {
          logger.error('scheduler', 'Due post processing failed', {
            postId: post.id,
            error: err instanceof Error ? err.message : String(err),
          });
        })
        .finally(() => {
          this.processing.delete(post.id);
        });
    }
  }

  private async processDuePost(bot: Bot, postId: number, scheduledAt: string): Promise<void> {
    const now = Date.now();
    const scheduledTime = new Date(scheduledAt).getTime();
    const missedBy = now - scheduledTime;

    if (missedBy > MISSED_THRESHOLD_MS) {
      this.posts.update(postId, { status: 'missed' });
      logger.warn('scheduler', 'Post marked as missed', { postId });
      for (const adminId of this.adminIds) {
        try {
          await bot.api.sendMessage(
            adminId,
            `⏰ Пропущена публикация ID ${postId} (запланировано: ${formatDateTime(scheduledAt, this.timezone)})`,
          );
        } catch (err) {
          logger.error('scheduler', 'Missed notification failed', {
            postId,
            adminId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return;
    }

    await this.publisher.publishScheduled(bot.api, postId, bot, this.adminIds);
  }
}
