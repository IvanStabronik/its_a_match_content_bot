import { Bot } from 'grammy';
import { createAiModule } from '../ai/module.js';
import { loadConfig } from '../config.js';
import { openDatabase } from '../db/connection.js';
import { initSchema } from '../db/schema.js';
import { DiscoveryService } from '../discovery/service.js';
import { logger } from '../logger.js';
import { ContentPackRepository } from '../services/content-packs.js';
import { DailyPackService } from '../services/daily-pack.js';
import { formatPackDiagnosticsText } from '../services/pack-diagnostics.js';
import { PostRepository } from '../services/posts.js';
import { formatStarterSourcesResult, runStarterSourcesSetup } from '../services/starter-sources.js';
import { SourceItemRepository, SourceRepository } from '../services/sources.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  initSchema(db);

  const posts = new PostRepository(db);
  const packs = new ContentPackRepository(db);
  const sources = new SourceRepository(db);
  const sourceItems = new SourceItemRepository(db);
  const ai = createAiModule(config.openaiApiKey, config.mainBotUsername);
  const discovery = new DiscoveryService(sources, sourceItems, posts, config, ai);
  const dailyPack = new DailyPackService(packs, posts, discovery, sources, config, ai);

  logger.info('reconnect', 'Running starter sources setup');
  const setup = runStarterSourcesSetup(sources, config);
  console.log(formatStarterSourcesResult(setup).replace(/<[^>]+>/g, ''));

  logger.info('reconnect', 'Rebuilding today pack');
  const result = await dailyPack.rebuildTodayPack();
  const s = result.summary;

  const summaryLine =
    `Пакет пересобран:\n` +
    `Видео: ${s.videos} · Мемы: ${s.memes} · Разборы: ${s.articles}\n` +
    `Опросы: ${s.polls} · Идеи: ${s.ideas}\n\n` +
    formatPackDiagnosticsText(result.diagnostics, config).replace(/<[^>]+>/g, '');

  console.log(summaryLine);

  const bot = new Bot(config.contentBotToken);
  for (const adminId of config.adminTelegramIds) {
    try {
      await bot.api.sendMessage(
        adminId,
        `✅ Автонастройка выполнена.\n\n` +
          `Видео: ${s.videos} · Мемы: ${s.memes} · Разборы: ${s.articles}\n` +
          `Опросы: ${s.polls} · Идеи: ${s.ideas}\n\n` +
          `Откройте /today\n` +
          `Reddit — подключите сами, когда будут ключи.`,
      );
    } catch (err) {
      logger.warn('reconnect', 'Failed to notify admin', {
        adminId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
