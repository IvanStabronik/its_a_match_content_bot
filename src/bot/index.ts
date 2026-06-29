import { Bot } from 'grammy';
import { createAiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { DiscoveryService } from '../discovery/service.js';
import { logger } from '../logger.js';
import { DiscoveryScheduler } from '../services/discovery-scheduler.js';
import { DailyPackService } from '../services/daily-pack.js';
import { DailyPackScheduler } from '../services/daily-pack-scheduler.js';
import { ContentPackRepository } from '../services/content-packs.js';
import { PostRepository } from '../services/posts.js';
import { PublisherService } from '../services/publisher.js';
import { SchedulerService } from '../services/scheduler.js';
import { SourceItemRepository, SourceRepository } from '../services/sources.js';
import { recoverStaleClaimsOnStartup } from '../services/stale-recovery.js';
import { verifyTelegramConnection } from '../services/telegram.js';
import { registerCallbackHandlers } from './handlers/callbacks.js';
import { registerDailyPackHandlers } from './handlers/daily-pack.js';
import { registerCommandHandlers } from './handlers/commands.js';
import { registerContentHandlers } from './handlers/content.js';
import { registerQueueCommand } from './handlers/moderation.js';
import { registerSourceHandlers } from './handlers/sources.js';
import { createAuthMiddleware } from './middleware/auth.js';

export async function createBot(config: AppConfig): Promise<{
  bot: Bot;
  scheduler: SchedulerService;
  discoveryScheduler: DiscoveryScheduler;
  dailyPackScheduler: DailyPackScheduler;
  db: ReturnType<typeof openDatabase>;
}> {
  const db = openDatabase(config.databasePath);
  initSchema(db);

  const posts = new PostRepository(db);
  const sources = new SourceRepository(db);
  const sourceItems = new SourceItemRepository(db);
  const ai = createAiModule(config.openaiApiKey, config.mainBotUsername);
  const publisher = new PublisherService(posts, config.channelUsername);
  const scheduler = new SchedulerService(
    posts,
    publisher,
    config.adminTelegramIds,
    config.timezone,
  );
  const discovery = new DiscoveryService(sources, sourceItems, posts, config, ai);
  const discoveryScheduler = new DiscoveryScheduler(discovery, config);
  const contentPacks = new ContentPackRepository(db);
  const dailyPack = new DailyPackService(contentPacks, posts, discovery, sources, config, ai);
  const dailyPackScheduler = new DailyPackScheduler(dailyPack, config);

  const bot = new Bot(config.contentBotToken);

  bot.use(createAuthMiddleware(config));
  registerCommandHandlers(bot, config, posts, publisher, ai, db);
  registerSourceHandlers(bot, config, sources, discovery);
  registerDailyPackHandlers(bot, config, dailyPack, posts, ai, sources);
  registerQueueCommand(bot, posts, config, ai !== null, sources);
  registerContentHandlers(bot, posts, ai, config);
  registerCallbackHandlers(bot, config, posts, publisher, ai, sources, sourceItems);

  bot.catch((err) => {
    logger.error('bot', 'Unhandled bot error', {
      error: err.error instanceof Error ? err.error.message : String(err.error),
    });
  });

  await verifyTelegramConnection(bot.api, 30_000);
  logger.info('bot', 'Telegram API connection verified');

  await recoverStaleClaimsOnStartup(posts, bot, config.adminTelegramIds);

  scheduler.start(bot);
  discoveryScheduler.start(bot);
  dailyPackScheduler.start(bot);

  return { bot, scheduler, discoveryScheduler, dailyPackScheduler, db };
}

export async function startBot(config: AppConfig): Promise<void> {
  const { bot } = await createBot(config);
  logger.info('bot', 'Starting long polling');
  await bot.start({
    onStart: () => {
      logger.info('bot', 'Content Bot is ready');
    },
  });
}
