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
  dailyPackEnabled: boolean;
  dailyPackTime: string;
  dailyPackTimezone: string;
  dailyPackVideoTarget: number;
  dailyPackMemeTarget: number;
  dailyPackArticleTarget: number;
  dailyPackPollTarget: number;
  dailyPackIdeaTarget: number;
  dailyPackMaxTotal: number;
  dailyScheduleSlots: string[];
  dailyAutoDiscoveryLookbackHours: number;
  dailyPackNotifyAdmins: boolean;
  dailyPackGuaranteeMinimum: boolean;
  dailyPackMinVideos: number;
  dailyPackMinMemes: number;
  dailyPackMinArticles: number;
  dailyPackMinPolls: number;
  dailyPackMinIdeas: number;
  dailyPackAllowAiBackfill: boolean;
  dailyPackAllowForeignVideoIdeas: boolean;
  dailyPackForeignVideoMode: 'adapt_to_text_idea' | 'reject';
  dailyPackEmptySectionIsError: boolean;
  discoveryForeignLanguageMode: 'reject' | 'adapt_or_demote' | 'allow_with_warning';
  memeBackfillMode: 'ai_text' | 'generated_card' | 'off';
  articleBackfillMode: 'ai_explainer' | 'off';
  starterSourcesAutoFix: boolean;
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

function parseEnum<T extends string>(raw: string | undefined, allowed: readonly T[], defaultValue: T): T {
  const v = raw?.trim().toLowerCase();
  if (v && (allowed as readonly string[]).includes(v)) return v as T;
  return defaultValue;
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
    dailyPackEnabled: parseBool(process.env.DAILY_PACK_ENABLED, true),
    dailyPackTime: process.env.DAILY_PACK_TIME?.trim() || '10:00',
    dailyPackTimezone: process.env.DAILY_PACK_TIMEZONE?.trim() || 'Europe/Warsaw',
    dailyPackVideoTarget: parsePositiveInt(process.env.DAILY_PACK_VIDEO_TARGET, 5),
    dailyPackMemeTarget: parsePositiveInt(process.env.DAILY_PACK_MEME_TARGET, 5),
    dailyPackArticleTarget: parsePositiveInt(process.env.DAILY_PACK_ARTICLE_TARGET, 5),
    dailyPackPollTarget: parsePositiveInt(process.env.DAILY_PACK_POLL_TARGET, 5),
    dailyPackIdeaTarget: parsePositiveInt(process.env.DAILY_PACK_IDEA_TARGET, 5),
    dailyPackMaxTotal: parsePositiveInt(process.env.DAILY_PACK_MAX_TOTAL, 30),
    dailyScheduleSlots: parseCsv(process.env.DAILY_SCHEDULE_SLOTS, ['11:00', '13:30', '16:00', '18:30', '21:00']),
    dailyAutoDiscoveryLookbackHours: parsePositiveInt(process.env.DAILY_AUTO_DISCOVERY_LOOKBACK_HOURS, 48),
    dailyPackNotifyAdmins: parseBool(process.env.DAILY_PACK_NOTIFY_ADMINS, true),
    dailyPackGuaranteeMinimum: parseBool(process.env.DAILY_PACK_GUARANTEE_MINIMUM, true),
    dailyPackMinVideos: parsePositiveInt(process.env.DAILY_PACK_MIN_VIDEOS, 5),
    dailyPackMinMemes: parsePositiveInt(process.env.DAILY_PACK_MIN_MEMES, 5),
    dailyPackMinArticles: parsePositiveInt(process.env.DAILY_PACK_MIN_ARTICLES, 5),
    dailyPackMinPolls: parsePositiveInt(process.env.DAILY_PACK_MIN_POLLS, 5),
    dailyPackMinIdeas: parsePositiveInt(process.env.DAILY_PACK_MIN_IDEAS, 5),
    dailyPackAllowAiBackfill: parseBool(process.env.DAILY_PACK_ALLOW_AI_BACKFILL, true),
    dailyPackAllowForeignVideoIdeas: parseBool(process.env.DAILY_PACK_ALLOW_FOREIGN_VIDEO_IDEAS, true),
    dailyPackForeignVideoMode: parseEnum(
      process.env.DAILY_PACK_FOREIGN_VIDEO_MODE,
      ['adapt_to_text_idea', 'reject'] as const,
      'adapt_to_text_idea',
    ),
    dailyPackEmptySectionIsError: parseBool(process.env.DAILY_PACK_EMPTY_SECTION_IS_ERROR, true),
    discoveryForeignLanguageMode: parseEnum(
      process.env.DISCOVERY_FOREIGN_LANGUAGE_MODE,
      ['reject', 'adapt_or_demote', 'allow_with_warning'] as const,
      'adapt_or_demote',
    ),
    memeBackfillMode: parseEnum(
      process.env.MEME_BACKFILL_MODE,
      ['ai_text', 'generated_card', 'off'] as const,
      'ai_text',
    ),
    articleBackfillMode: parseEnum(
      process.env.ARTICLE_BACKFILL_MODE,
      ['ai_explainer', 'off'] as const,
      'ai_explainer',
    ),
    starterSourcesAutoFix: parseBool(process.env.STARTER_SOURCES_AUTO_FIX, true),
  };
}

export function getDailyPackSectionTarget(
  config: AppConfig,
  section: 'videos' | 'memes' | 'articles' | 'polls' | 'ideas',
): number {
  if (config.dailyPackGuaranteeMinimum) {
    switch (section) {
      case 'videos':
        return config.dailyPackMinVideos;
      case 'memes':
        return config.dailyPackMinMemes;
      case 'articles':
        return config.dailyPackMinArticles;
      case 'polls':
        return config.dailyPackMinPolls;
      case 'ideas':
        return config.dailyPackMinIdeas;
    }
  }
  switch (section) {
    case 'videos':
      return config.dailyPackVideoTarget;
    case 'memes':
      return config.dailyPackMemeTarget;
    case 'articles':
      return config.dailyPackArticleTarget;
    case 'polls':
      return config.dailyPackPollTarget;
    case 'ideas':
      return config.dailyPackIdeaTarget;
  }
}

function parseCsv(raw: string | undefined, defaultValue: string[]): string[] {
  if (!raw?.trim()) return defaultValue;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAdmin(userId: number, adminIds: number[]): boolean {
  return adminIds.includes(userId);
}
