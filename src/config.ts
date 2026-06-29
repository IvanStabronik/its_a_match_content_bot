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
  youtubeApiKey: string | null;
  discoveryEnabled: boolean;
  discoveryIntervalMinutes: number;
  discoveryMaxItemsPerSource: number;
  discoveryLookbackHours: number;
  discoveryMinScore: number;
  discoveryAutoCreateCandidates: boolean;
  youtubeRegionCode: string;
  youtubeRelevanceLanguage: string;
  youtubeShortsMaxSeconds: number;
  youtubeRejectOverSeconds: number;
  discoveryAllowedLanguages: string[];
  discoveryRejectForeignLanguage: boolean;
  discoveryMinQualityScore: number;
  discoveryCreateLowScore: boolean;
  redditClientId: string | null;
  redditClientSecret: string | null;
  redditUserAgent: string;
  redditMaxPostsPerSource: number;
  redditAllowedSubreddits: string[];
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

function parseBool(raw: string | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return defaultValue;
}

function parsePositiveInt(raw: string | undefined, defaultValue: number): number {
  if (!raw?.trim()) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

function parseNonNegativeInt(raw: string | undefined, defaultValue: number): number {
  if (!raw?.trim()) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : defaultValue;
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
    youtubeApiKey: optionalEnv('YOUTUBE_API_KEY'),
    discoveryEnabled: parseBool(process.env.DISCOVERY_ENABLED, true),
    discoveryIntervalMinutes: parsePositiveInt(process.env.DISCOVERY_INTERVAL_MINUTES, 360),
    discoveryMaxItemsPerSource: parsePositiveInt(process.env.DISCOVERY_MAX_ITEMS_PER_SOURCE, 5),
    discoveryLookbackHours: parsePositiveInt(process.env.DISCOVERY_LOOKBACK_HOURS, 168),
    discoveryMinScore: parseNonNegativeInt(process.env.DISCOVERY_MIN_SCORE, 0),
    discoveryAutoCreateCandidates: parseBool(process.env.DISCOVERY_AUTO_CREATE_CANDIDATES, true),
    youtubeRegionCode: process.env.YOUTUBE_REGION_CODE?.trim() || 'RU',
    youtubeRelevanceLanguage: process.env.YOUTUBE_RELEVANCE_LANGUAGE?.trim() || 'ru',
    youtubeShortsMaxSeconds: parsePositiveInt(process.env.YOUTUBE_SHORTS_MAX_SECONDS, 90),
    youtubeRejectOverSeconds: parsePositiveInt(process.env.YOUTUBE_REJECT_OVER_SECONDS, 180),
    discoveryAllowedLanguages: parseCsv(process.env.DISCOVERY_ALLOWED_LANGUAGES, ['ru']),
    discoveryRejectForeignLanguage: parseBool(process.env.DISCOVERY_REJECT_FOREIGN_LANGUAGE, true),
    discoveryMinQualityScore: parseNonNegativeInt(process.env.DISCOVERY_MIN_QUALITY_SCORE, 6),
    discoveryCreateLowScore: parseBool(process.env.DISCOVERY_CREATE_LOW_SCORE, false),
    redditClientId: optionalEnv('REDDIT_CLIENT_ID'),
    redditClientSecret: optionalEnv('REDDIT_CLIENT_SECRET'),
    redditUserAgent: process.env.REDDIT_USER_AGENT?.trim() || 'ItsAMatchContentBot/3.0',
    redditMaxPostsPerSource: parsePositiveInt(process.env.REDDIT_MAX_POSTS_PER_SOURCE, 5),
    redditAllowedSubreddits: parseCsv(
      process.env.REDDIT_ALLOWED_SUBREDDITS,
      ['dating', 'dating_advice', 'relationships', 'relationship_advice', 'Tinder', 'Bumble', 'OnlineDating', 'relationshipmemes'],
    ),
  };
}

function parseCsv(raw: string | undefined, defaultValue: string[]): string[] {
  if (!raw?.trim()) return defaultValue;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdmin(userId: number, adminIds: number[]): boolean {
  return adminIds.includes(userId);
}
