import type { AppConfig } from '../config.js';
import type { SourceRepository } from './sources.js';

export const LEGACY_ENGLISH_YOUTUBE_QUERIES = [
  'dating red flags',
  'relationship advice',
  'dating mistakes',
];

export const RUSSIAN_SHORTS_QUERIES = [
  'красные флаги в отношениях',
  'ошибки в отношениях',
  'первое свидание',
  'переписка в отношениях',
  'токсичные отношения',
  'тревожная привязанность',
  'дейтинг приложения',
];

export interface StarterSourcesResult {
  added: string[];
  paused: string[];
  skipped: string[];
  notes: string[];
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

function isLegacyEnglishYoutubeSearch(
  type: string,
  query: string,
): boolean {
  if (type !== 'youtube_search') return false;
  const n = normalizeQuery(query);
  return LEGACY_ENGLISH_YOUTUBE_QUERIES.some((legacy) => n.includes(legacy));
}

export function runStarterSourcesSetup(
  sources: SourceRepository,
  config: AppConfig,
): StarterSourcesResult {
  const result: StarterSourcesResult = {
    added: [],
    paused: [],
    skipped: [],
    notes: [],
  };

  const existing = sources.listAll();

  for (const source of existing) {
    if (source.type !== 'youtube_search' || source.enabled === 0) continue;
    const cfg = sources.getConfig(source);
    const query = String(cfg.query ?? '').trim();
    if (!isLegacyEnglishYoutubeSearch(source.type, query)) continue;
    sources.setEnabled(source.id, false);
    result.paused.push(`${source.name} (${query})`);
  }

  if (config.youtubeApiKey) {
    for (const query of RUSSIAN_SHORTS_QUERIES) {
      const dup = existing.some((s) => {
        if (s.type !== 'youtube_short_search') return false;
        const cfg = sources.getConfig(s);
        return normalizeQuery(String(cfg.query ?? '')) === normalizeQuery(query);
      });
      if (dup) {
        result.skipped.push(`YouTube Shorts: ${query}`);
        continue;
      }
      sources.create({
        type: 'youtube_short_search',
        name: `YouTube Shorts: ${query}`,
        config: { query },
      });
      result.added.push(`YouTube Shorts: ${query}`);
    }
  } else {
    result.notes.push(
      'YOUTUBE_API_KEY не задан — видео будут заполняться AI video ideas до настройки YouTube.',
    );
  }

  if (!config.redditClientId || !config.redditClientSecret) {
    result.notes.push(
      'Reddit опционален — мемы заполняются AI meme ideas и другими источниками без Reddit.',
    );
  } else {
    result.notes.push('Reddit опционален — можно добавить /source_add reddit_subreddit relationshipmemes');
  }

  result.notes.push(
    'Pikabu: только публичный RSS/Atom (/source_add pikabu_rss <feed_url>) или /source_add_url <ссылка на пост>. HTML scraping не используется.',
  );

  const hasRssRu = existing.some(
    (s) =>
      s.enabled &&
      (s.type === 'rss_article_ru' || s.type === 'rss_article' || s.type === 'public_feed'),
  );
  if (!hasRssRu) {
    result.notes.push(
      'RSS RU не настроен — разборы из AI explainer. Добавьте: /source_add rss_article_ru <feed_url> <имя>',
    );
  }

  result.notes.push('Ручные ссылки: /source_add_url <url>');

  return result;
}

export function formatStarterSourcesResult(result: StarterSourcesResult): string {
  const lines: string[] = ['✅ <b>Настройка источников</b>\n'];

  if (result.added.length > 0) {
    lines.push(`<b>Добавлено (${result.added.length}):</b>`);
    for (const s of result.added) lines.push(`• ${s}`);
    lines.push('');
  }

  if (result.paused.length > 0) {
    lines.push(`<b>Отключено legacy (${result.paused.length}):</b>`);
    for (const s of result.paused) lines.push(`• ${s}`);
    lines.push('');
  }

  if (result.skipped.length > 0) {
    lines.push(`<b>Уже есть (${result.skipped.length}):</b> ${result.skipped.length} источник(ов)`);
    lines.push('');
  }

  if (result.notes.length > 0) {
    lines.push('<b>Примечания:</b>');
    for (const n of result.notes) lines.push(`💡 ${n}`);
  }

  lines.push('\nТеперь бот собирает ежедневный пакет с AI-backfill.');
  lines.push('Откройте /today или /today_rebuild.');

  return lines.join('\n');
}
