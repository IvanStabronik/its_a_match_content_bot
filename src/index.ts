import { loadConfig } from './config.js';
import { startBot } from './bot/index.js';
import { logger } from './logger.js';

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info('main', 'Starting Its a Match Content Bot');

  try {
    await startBot(config);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('Telegram')) {
      logger.error('main', 'Telegram API unavailable', { error: message });
    } else {
      logger.error('main', 'Fatal startup error', { error: message });
    }
    process.exit(1);
  }
}

main();
