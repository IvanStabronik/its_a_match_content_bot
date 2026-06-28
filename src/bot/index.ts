import { Bot } from 'grammy';
import { createAiModule } from '../ai/module.js';
import type { AppConfig } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { logger } from '../logger.js';
import { PostRepository } from '../services/posts.js';
import { PublisherService } from '../services/publisher.js';
import { SchedulerService } from '../services/scheduler.js';
import { recoverStaleClaimsOnStartup } from '../services/stale-recovery.js';
import { verifyTelegramConnection } from '../services/telegram.js';
import { registerCallbackHandlers } from './handlers/callbacks.js';
import { registerCommandHandlers } from './handlers/commands.js';
import { registerContentHandlers } from './handlers/content.js';
import { registerQueueCommand } from './handlers/moderation.js';
import { createAuthMiddleware } from './middleware/auth.js';

export async function createBot(config: AppConfig): Promise<{
  bot: Bot;
  scheduler: SchedulerService;
  db: ReturnType<typeof openDatabase>;
}> {
  const db = openDatabase(config.databasePath);
  initSchema(db);

  const posts = new PostRepository(db);
  const ai = createAiModule(config.openaiApiKey, config.mainBotUsername);
  const publisher = new PublisherService(posts, config.channelUsername);
  const scheduler = new SchedulerService(
    posts,
    publisher,
    config.adminTelegramIds,
    config.timezone,
  );

  const bot = new Bot(config.contentBotToken);

  bot.use(createAuthMiddleware(config));
  registerCommandHandlers(bot, config, posts, publisher, ai, db);
  registerQueueCommand(bot, posts, config, ai !== null);
  registerContentHandlers(bot, posts, ai, config);
  registerCallbackHandlers(bot, config, posts, publisher, ai);

  bot.catch((err) => {
    logger.error('bot', 'Unhandled bot error', {
      error: err.error instanceof Error ? err.error.message : String(err.error),
    });
  });

  await verifyTelegramConnection(bot.api, 30_000);
  logger.info('bot', 'Telegram API connection verified');

  await recoverStaleClaimsOnStartup(posts, bot, config.adminTelegramIds);

  scheduler.start(bot);

  return { bot, scheduler, db };
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
