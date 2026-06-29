import type { AppConfig } from '../config.js';
import type { DiscoveryFormat, Source } from '../types.js';

export interface DiscoveredItem {
  platform: string;
  externalId: string;
  url: string;
  title: string | null;
  description: string | null;
  author: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  raw: unknown;
  discoveryFormat: DiscoveryFormat;
  language?: import('../types.js').ContentLanguage | null;
  durationSeconds?: number | null;
  shortsUrl?: string | null;
  imageUrl?: string | null;
  qualityScore?: number | null;
  contentAngle?: string | null;
  publishRecommendation?: string | null;
}

export interface DiscoveryLimits {
  maxItems: number;
  lookbackHours: number;
}

export interface SourceAdapter {
  readonly type: Source['type'];
  validateConfig(config: Record<string, unknown>): string | null;
  fetchRecentItems(
    source: Source,
    limits: DiscoveryLimits,
    config: AppConfig,
  ): Promise<DiscoveredItem[]>;
}

export interface DiscoveryRunResult {
  sourceId: number;
  sourceName: string;
  found: number;
  newCandidates: number;
  duplicatesSkipped: number;
  foreignConverted?: number;
  foreignRejected?: number;
  errors: string[];
}

export interface DiscoverySummary {
  checkedSources: number;
  newCandidates: number;
  duplicatesSkipped: number;
  foreignConverted: number;
  foreignRejected: number;
  errors: string[];
  perSource: DiscoveryRunResult[];
}
