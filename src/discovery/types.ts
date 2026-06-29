import type { Source, SourceType } from '../types.js';

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
}

export interface DiscoveryLimits {
  maxItems: number;
  lookbackHours: number;
}

export interface SourceAdapter {
  readonly type: SourceType;
  validateConfig(config: Record<string, unknown>): string | null;
  fetchRecentItems(
    source: Source,
    limits: DiscoveryLimits,
    apiKey: string | null,
  ): Promise<DiscoveredItem[]>;
}

export interface DiscoveryRunResult {
  sourceId: number;
  sourceName: string;
  found: number;
  newCandidates: number;
  duplicatesSkipped: number;
  errors: string[];
}

export interface DiscoverySummary {
  checkedSources: number;
  newCandidates: number;
  duplicatesSkipped: number;
  errors: string[];
  perSource: DiscoveryRunResult[];
}
