import { logger } from './logger.js';

export interface AppConfig {
  contentBotToken: string;
  adminTelegramIds: number[];
  channelUsername: string;
  openaiApiKey: string | null;
  mainBotUsername: string | null;
  databasePath: string;
  backupDir: string;
  timezone: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    logger.error('config', `Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value.trim();
}

function parseAdminIds(raw: string): number[] {
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 1 || parts.length > 2) {
    logger.error('config', 'ADMIN_TELEGRAM_IDS must contain 1 to 2 numeric IDs');
    process.exit(1);
  }
  const ids: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      logger.error('config', 'Invalid ADMIN_TELEGRAM_IDS format: IDs must be numeric');
      process.exit(1);
    }
    ids.push(Number(part));
  }
  return ids;
}

function optionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function loadConfig(): AppConfig {
  const contentBotToken = requireEnv('CONTENT_BOT_TOKEN');
  const adminTelegramIds = parseAdminIds(requireEnv('ADMIN_TELEGRAM_IDS'));
  const channelUsername = requireEnv('CHANNEL_USERNAME').replace(/^@/, '');

  return {
    contentBotToken,
    adminTelegramIds,
    channelUsername,
    openaiApiKey: optionalEnv('OPENAI_API_KEY'),
    mainBotUsername: optionalEnv('MAIN_BOT_USERNAME')?.replace(/^@/, '') ?? null,
    databasePath: process.env.DATABASE_PATH?.trim() || './data/content_bot.db',
    backupDir: process.env.BACKUP_DIR?.trim() || './data/backups',
    timezone: process.env.TIMEZONE?.trim() || 'Europe/Warsaw',
  };
}

export function isAdmin(userId: number, adminIds: number[]): boolean {
  return adminIds.includes(userId);
}
