import type { Bot } from 'grammy';
import type { AppConfig } from '../config.js';
import { logger } from '../logger.js';
import type { DiscoveryService } from '../discovery/service.js';
import { buildDiscoveryAdminNotification } from './discovery-notify.js';

export class DiscoveryScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly config: AppConfig,
  ) {}

  start(bot: Bot): void {
    if (!this.config.discoveryEnabled) {
      logger.info('discovery-scheduler', 'Discovery scheduler disabled');
      return;
    }

    const intervalMs = this.config.discoveryIntervalMinutes * 60 * 1000;
    logger.info('discovery-scheduler', 'Discovery scheduler started', {
      intervalMinutes: this.config.discoveryIntervalMinutes,
    });

    this.intervalId = setInterval(() => {
      void this.tick(bot);
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async tick(bot: Bot): Promise<void> {
    if (this.running) {
      logger.warn('discovery-scheduler', 'Skipping tick — previous run still in progress');
      return;
    }

    this.running = true;
    try {
      const summary = await this.discovery.discoverAll();
      logger.info('discovery-scheduler', 'Discovery tick completed', {
        checkedSources: summary.checkedSources,
        newCandidates: summary.newCandidates,
        duplicatesSkipped: summary.duplicatesSkipped,
        errorCount: summary.errors.length,
      });

      const notification = buildDiscoveryAdminNotification(summary);
      if (notification) {
        for (const adminId of this.config.adminTelegramIds) {
          try {
            await bot.api.sendMessage(adminId, notification);
          } catch (err) {
            logger.warn('discovery-scheduler', 'Admin notification failed', {
              adminId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    } catch (err) {
      logger.error('discovery-scheduler', 'Discovery tick failed', {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      this.running = false;
    }
  }
}
