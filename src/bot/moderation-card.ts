import type { Post } from '../types.js';
import type { SourceRepository } from '../services/sources.js';
import { sourceTypeLabel } from '../services/sources.js';
import { formatModerationCard } from './keyboards.js';

export function formatModerationCardForPost(
  post: Post,
  timezone: string,
  sources?: SourceRepository,
): string {
  let discovery: { platformLabel?: string | null; sourceName?: string | null } | undefined;
  if (post.discovery_source_id && sources) {
    const src = sources.getById(post.discovery_source_id);
    if (src) {
      discovery = {
        platformLabel: sourceTypeLabel(src.type),
        sourceName: src.name,
      };
    }
  }
  return formatModerationCard(post, timezone, discovery);
}
