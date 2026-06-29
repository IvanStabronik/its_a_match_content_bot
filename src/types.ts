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
}

export type SourceType = 'youtube_channel' | 'youtube_search' | 'rss' | 'reddit';

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
  | { type: 'rewrite_select'; postId: number; variants: string[] };

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
