import type { Bot } from 'grammy';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import type { DailyPackService } from './daily-pack.js';
import { isPastDailyPackTime, packTimeMatchesMinute } from './daily-schedule.js';

export class DailyPackScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly dailyPack: DailyPackService,
    private readonly config: AppConfig,
  ) {}

  start(bot: Bot): void {
    if (!this.config.dailyPackEnabled) {
      logger.info('daily-pack-scheduler', 'Daily pack scheduler disabled');
      return;
    }

    logger.info('daily-pack-scheduler', 'Daily pack scheduler started', {
      packTime: this.config.dailyPackTime,
      timezone: this.config.dailyPackTimezone,
    });

    void this.tick(bot);

    this.intervalId = setInterval(() => {
      void this.tick(bot);
    }, 60_000);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async tick(bot: Bot): Promise<void> {
    if (this.running) {
      logger.warn('daily-pack-scheduler', 'Skipping tick — previous run still in progress');
      return;
    }

    this.running = true;
    try {
      const now = new Date();
      let pack = this.dailyPack.createOrGetTodayPack(now);

      if (pack.generated_at) {
        if (this.dailyPack.shouldNotify(pack)) {
          const summary = this.dailyPack.getPackSummary(pack.id);
          const text = this.dailyPack.buildNotificationText(summary);
          for (const adminId of this.config.adminTelegramIds) {
            try {
              await bot.api.sendMessage(adminId, text);
            } catch (err) {
              logger.warn('daily-pack-scheduler', 'Admin notification failed', {
                adminId,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
          this.dailyPack.markNotified(pack.id);
        }
        return;
      }

      const shouldGenerate =
        packTimeMatchesMinute(this.config.dailyPackTime, this.config.dailyPackTimezone, now) ||
        isPastDailyPackTime(this.config.dailyPackTime, this.config.dailyPackTimezone, now);

      if (!shouldGenerate) return;

      const result = await this.dailyPack.generateTodayPack();
      pack = result.pack;

      if (this.dailyPack.shouldNotify(pack)) {
        const text = this.dailyPack.buildNotificationText(result.summary);
        for (const adminId of this.config.adminTelegramIds) {
          try {
            await bot.api.sendMessage(adminId, text);
          } catch (err) {
            logger.warn('daily-pack-scheduler', 'Admin notification failed', {
              adminId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
        this.dailyPack.markNotified(pack.id);
      }

      logger.info('daily-pack-scheduler', 'Daily pack generated', {
        packDate: pack.pack_date,
        total: result.summary.total,
      });
    } catch (err) {
      logger.error('daily-pack-scheduler', 'Daily pack tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }
}
