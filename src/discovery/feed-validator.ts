import Parser from 'rss-parser';

const FEED_USER_AGENT = 'ItsAMatchContentBot/6.0';
const FEED_TIMEOUT_MS = 20_000;

const parser = new Parser({
  timeout: FEED_TIMEOUT_MS,
  headers: { 'User-Agent': FEED_USER_AGENT },
});

export const PIKABU_FEED_HINT =
  'Пикабу можно подключить только через публичный RSS/Atom-фид или ручные ссылки. HTML scraping не используется.';

export const INVALID_FEED_MESSAGE =
  'URL не является валидным RSS/Atom-фидом. Укажите прямую ссылку на ленту (например …/rss или …/feed.xml).';

export async function validateFeedUrl(feedUrl: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = feedUrl.trim();
  if (!trimmed) {
    return { ok: false, message: 'Укажите URL RSS/Atom-ленты.' };
  }
  try {
    new URL(trimmed);
  } catch {
    return { ok: false, message: 'Некорректный URL.' };
  }

  try {
    const feed = await parser.parseURL(trimmed);
    const hasItems = (feed.items?.length ?? 0) > 0;
    const hasMeta = Boolean(feed.title?.trim() || feed.feedUrl?.trim());
    if (!hasItems && !hasMeta) {
      return { ok: false, message: INVALID_FEED_MESSAGE };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: INVALID_FEED_MESSAGE };
  }
}

export function getFeedParser(): Parser {
  return parser;
}
