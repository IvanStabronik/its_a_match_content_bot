/** Parse ISO 8601 duration (e.g. PT1M30S) to seconds. Returns null if invalid. */
export function parseIso8601Duration(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const match = raw.trim().match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i);
  if (!match) return null;
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  if ([hours, minutes, seconds].some((n) => Number.isNaN(n))) return null;
  return hours * 3600 + minutes * 60 + seconds;
}

export function isShortsLike(
  durationSeconds: number | null,
  title: string | null,
  description: string | null,
  maxShortSeconds: number,
): boolean {
  if (durationSeconds != null && durationSeconds <= maxShortSeconds) return true;
  const text = `${title ?? ''} ${description ?? ''}`.toLowerCase();
  return text.includes('#shorts') || text.includes('shorts');
}

export function buildYouTubeUrls(videoId: string, isShort: boolean): {
  url: string;
  shortsUrl: string | null;
} {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const shortsUrl = isShort ? `https://www.youtube.com/shorts/${videoId}` : null;
  return { url, shortsUrl };
}
