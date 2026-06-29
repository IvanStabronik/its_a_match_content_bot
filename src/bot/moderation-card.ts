import type { Post } from '../types.js';
import { formatModerationCard } from './keyboards.js';

export function formatModerationCardForPost(post: Post, timezone: string): string {
  return formatModerationCard(post, timezone);
}
