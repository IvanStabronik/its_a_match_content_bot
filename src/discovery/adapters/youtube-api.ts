import type { AppConfig } from '../../config.js';

const YOUTUBE_API = 'https://www.googleapis.com/youtube/v3';

export async function youtubeGet<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const url = new URL(`${YOUTUBE_API}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const MISSING_YOUTUBE_KEY_MSG =
  'YouTube API недоступен: не задан YOUTUBE_API_KEY. Добавьте ключ в .env.';

export function requireYoutubeKey(config: AppConfig): string {
  if (!config.youtubeApiKey) throw new Error(MISSING_YOUTUBE_KEY_MSG);
  return config.youtubeApiKey;
}
