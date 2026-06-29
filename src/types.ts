export type PostType = 'text' | 'photo' | 'video' | 'animation' | 'poll' | 'link';

export type PostStatus =
  | 'pending'
  | 'scheduled'
  | 'posted'
  | 'skipped'
  | 'deleted'
  | 'failed'
  | 'missed';

export const PREDEFINED_CATEGORIES = [
  'dating_meme',
  'relationship_joke',
  'cat',
  'news',
  'poll',
  'promo',
  'quote',
  'observation',
  'link',
] as const;

export type PostCategory = (typeof PREDEFINED_CATEGORIES)[number];

export interface Post {
  id: number;
  type: PostType;
  status: PostStatus;
  category: PostCategory | null;
  source_url: string | null;
  media_file_id: string | null;
  media_url: string | null;
  caption: string | null;
  raw_text: string | null;
  ai_score: number | null;
  risk_score: number | null;
  risk_reason: string | null;
  warnings: string | null;
  poll_question: string | null;
  poll_options_json: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  telegram_message_id: number | null;
  last_error: string | null;
  publishing_started_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  discovery_source_id: number | null;
  discovery_item_id: number | null;
  source_title: string | null;
  source_author: string | null;
  thumbnail_url: string | null;
  discovered_at: string | null;
  discovery_format: DiscoveryFormat | null;
  language: ContentLanguage | null;
  duration_seconds: number | null;
  quality_score: number | null;
  content_angle: string | null;
  publish_recommendation: string | null;
  shorts_url: string | null;
  pack_section: PackSection | null;
  selected_for_today: number;
}

export interface CreatePostInput {
  type: PostType;
  status?: PostStatus;
  category?: PostCategory | null;
  source_url?: string | null;
  media_file_id?: string | null;
  media_url?: string | null;
  caption?: string | null;
  raw_text?: string | null;
  created_by?: string | null;
  poll_question?: string | null;
  poll_options_json?: string | null;
  scheduled_at?: string | null;
  discovery_source_id?: number | null;
  discovery_item_id?: number | null;
  source_title?: string | null;
  source_author?: string | null;
  thumbnail_url?: string | null;
  discovered_at?: string | null;
  ai_score?: number | null;
  risk_score?: number | null;
  risk_reason?: string | null;
  warnings?: string | null;
  discovery_format?: DiscoveryFormat | null;
  language?: ContentLanguage | null;
  duration_seconds?: number | null;
  quality_score?: number | null;
  content_angle?: string | null;
  publish_recommendation?: string | null;
  shorts_url?: string | null;
  pack_section?: PackSection | null;
  selected_for_today?: number;
}

export type PackSection = 'videos' | 'memes' | 'articles' | 'polls' | 'ideas' | 'other';

export type ContentPackStatus = 'draft' | 'ready' | 'scheduled' | 'archived';

export interface ContentPack {
  id: number;
  pack_date: string;
  status: ContentPackStatus;
  created_at: string;
  updated_at: string;
  generated_at: string | null;
  notified_at: string | null;
  summary_json: string | null;
  diagnostics_json: string | null;
  last_error: string | null;
}

export interface ContentPackItem {
  id: number;
  pack_id: number;
  post_id: number;
  section: PackSection;
  selected: number;
  position: number;
  created_at: string;
}

export interface SectionBreakdown {
  total: number;
  real: number;
  backfill: number;
}

export interface PackSummary {
  videos: number;
  memes: number;
  articles: number;
  polls: number;
  ideas: number;
  other: number;
  selected: number;
  total: number;
  breakdown?: Partial<Record<PackSection, SectionBreakdown>>;
  warnings?: string[];
}

export interface PackSectionDiagnostics {
  section: PackSection;
  total: number;
  real: number;
  backfill: number;
  lines: string[];
}

export interface PackDiagnostics {
  sections: PackSectionDiagnostics[];
  warnings: string[];
  generatedAt: string;
  discoverySummary: {
    checkedSources: number;
    newCandidates: number;
    foreignConverted: number;
    foreignRejected: number;
    errors: string[];
  };
  sourcesStatus?: {
    reddit: 'configured' | 'missing';
    redditNote: string;
    pikabuFeeds: number;
    rssRuFeeds: number;
    publicFeeds: number;
    rssArticleFeeds: number;
    manualLinksToday: number;
  };
}

export type DiscoveryFormat =
  | 'youtube_short_link'
  | 'youtube_video_link'
  | 'article_summary'
  | 'meme_image'
  | 'text_idea'
  | 'native_video';

export type ContentLanguage = 'ru' | 'en' | 'unknown';

export type SkipReason =
  | 'duplicate'
  | 'foreign_language'
  | 'low_quality'
  | 'too_long'
  | 'unsafe'
  | 'missing_media'
  | 'api_error'
  | 'low_score';

export type SourceType =
  | 'youtube_channel'
  | 'youtube_search'
  | 'youtube_short_search'
  | 'rss'
  | 'rss_article'
  | 'rss_article_ru'
  | 'public_feed'
  | 'pikabu_rss'
  | 'manual_source_link'
  | 'reddit'
  | 'reddit_subreddit';

export interface Source {
  id: number;
  type: SourceType;
  name: string;
  config_json: string;
  enabled: number;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface SourceItem {
  id: number;
  source_id: number;
  platform: string;
  external_id: string;
  url: string;
  title: string | null;
  description: string | null;
  author: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  raw_json: string | null;
  candidate_post_id: number | null;
  created_at: string;
  skip_reason: SkipReason | null;
  discovery_format: DiscoveryFormat | null;
  language: ContentLanguage | null;
  duration_seconds: number | null;
  quality_score: number | null;
  shorts_url: string | null;
  image_url: string | null;
}

export interface CreateSourceInput {
  type: SourceType;
  name: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface PostStats {
  byStatus: Record<PostStatus, number>;
  today: number;
  last7Days: number;
  allTime: number;
}

export interface Warning {
  type: 'category' | 'risk_score';
  message: string;
  category?: string;
  risk_score?: number;
}

export const FORBIDDEN_CATEGORIES = [
  'политика',
  'религия',
  'NSFW',
  'разжигание ненависти',
  'унижение мужчин',
  'унижение женщин',
  'чёрный юмор',
  'нелегальный контент',
  'сексуальный контент',
  'насильственный контент',
] as const;

export type SessionState =
  | { type: 'idle' }
  | { type: 'schedule'; postId: number }
  | { type: 'edit_caption'; postId: number }
  | { type: 'rewrite_select'; postId: number; variants: string[] }
  | { type: 'media_note'; postId: number }
  | { type: 'schedule_day_confirm'; packId: number; assignments: Array<{ postId: number; scheduledAt: string; slotLabel: string }> };

export class InvalidTransitionError extends Error {
  constructor(from: PostStatus, to: PostStatus) {
    super(`Invalid status transition: ${from} → ${to}`);
    this.name = 'InvalidTransitionError';
  }
}

export class PublishClaimError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishClaimError';
  }
}
