import type { AppConfig } from '../config.js';
import type { PackDiagnostics, PackSection, PackSectionDiagnostics, Post } from '../types.js';
import { isBackfillPost, isForeignVideoIdeaPost, isManualSourcePost } from './pack-sections.js';
import type { PostRepository } from './posts.js';
import type { SourceRepository } from './sources.js';

export function emptyDiagnostics(): PackDiagnostics {
  return {
    sections: [],
    warnings: [],
    generatedAt: new Date().toISOString(),
    discoverySummary: {
      checkedSources: 0,
      newCandidates: 0,
      foreignConverted: 0,
      foreignRejected: 0,
      errors: [],
    },
  };
}

export function initSectionDiagnostics(section: PackSection): PackSectionDiagnostics {
  return {
    section,
    total: 0,
    real: 0,
    backfill: 0,
    lines: [],
  };
}

export function classifyPostForSection(post: Post, section: PackSection): 'real' | 'backfill' {
  if (isBackfillPost(post)) return 'backfill';
  if (isForeignVideoIdeaPost(post)) return 'backfill';
  if (section === 'videos' && post.discovery_format === 'youtube_short_link' && post.language === 'ru') {
    return 'real';
  }
  if (section === 'memes' && post.discovery_format === 'meme_image') return 'real';
  if (section === 'articles' && post.discovery_format === 'article_summary' && post.source_url) {
    return 'real';
  }
  if (isManualSourcePost(post)) return 'real';
  if (post.created_by === 'discovery') return 'real';
  return 'backfill';
}

export function buildSourcesStatus(
  sources: SourceRepository,
  posts: PostRepository,
  config: AppConfig,
): NonNullable<PackDiagnostics['sourcesStatus']> {
  const all = sources.listAll();
  const pikabuFeeds = all.filter((s) => s.type === 'pikabu_rss' && s.enabled).length;
  const rssRuFeeds = all.filter((s) => s.type === 'rss_article_ru' && s.enabled).length;
  const publicFeeds = all.filter((s) => s.type === 'public_feed' && s.enabled).length;
  const rssArticleFeeds = all.filter(
    (s) => (s.type === 'rss_article' || s.type === 'rss') && s.enabled,
  ).length;
  const redditConfigured =
    Boolean(config.redditClientId && config.redditClientSecret) &&
    all.some((s) => s.type === 'reddit_subreddit' && s.enabled);

  return {
    reddit: redditConfigured ? 'configured' : 'missing',
    redditNote: redditConfigured
      ? 'Reddit опционален и настроен'
      : 'Reddit опционален — не требуется для полного пакета',
    pikabuFeeds,
    rssRuFeeds,
    publicFeeds,
    rssArticleFeeds,
    manualLinksToday: posts.countManualLinksToday(),
  };
}

export function formatPackDiagnosticsText(
  diagnostics: PackDiagnostics,
  config: AppConfig,
): string {
  const lines: string[] = ['🩺 <b>Диагностика контент-пакета</b>\n'];

  const labels: Record<PackSection, string> = {
    videos: '🎬 Видео',
    memes: '😂 Мемы',
    articles: '📰 Разборы',
    polls: '📊 Опросы',
    ideas: '💬 Идеи',
    other: '📎 Прочее',
  };

  for (const sec of ['videos', 'memes', 'articles', 'polls', 'ideas'] as PackSection[]) {
    const d = diagnostics.sections.find((s) => s.section === sec);
    if (!d) continue;
    lines.push(`${labels[sec]}: ${d.total} (${d.real} найдено, ${d.backfill} backfill)`);
    for (const l of d.lines) lines.push(`  • ${l}`);
    lines.push('');
  }

  const ds = diagnostics.discoverySummary;
  if (ds.checkedSources > 0 || ds.foreignConverted > 0 || ds.foreignRejected > 0) {
    lines.push('<b>Discovery:</b>');
    lines.push(`  • Источников проверено: ${ds.checkedSources}`);
    lines.push(`  • Новых кандидатов: ${ds.newCandidates}`);
    if (ds.foreignConverted > 0) {
      lines.push(`  • Иностранные Shorts → видео-идеи: ${ds.foreignConverted}`);
    }
    if (ds.foreignRejected > 0) {
      lines.push(`  • Отклонено по языку: ${ds.foreignRejected}`);
    }
    lines.push('');
  }

  if (!config.redditClientId || !config.redditClientSecret) {
    lines.push('💡 Reddit не настроен — мемы из AI meme ideas.');
  }
  if (!config.youtubeApiKey) {
    lines.push('💡 YouTube API не настроен — видео из AI video ideas.');
  }

  const ss = diagnostics.sourcesStatus;
  if (ss) {
    lines.push('');
    lines.push('<b>Источники:</b>');
    lines.push(`  • Reddit: ${ss.reddit === 'configured' ? 'настроен (опционально)' : 'не настроен (опционально)'}`);
    lines.push(`  • Pikabu RSS: ${ss.pikabuFeeds > 0 ? `${ss.pikabuFeeds} фид(ов)` : 'нет публичного фида'}`);
    lines.push(`  • RSS RU: ${ss.rssRuFeeds} · Public feed: ${ss.publicFeeds} · RSS article: ${ss.rssArticleFeeds}`);
    lines.push(`  • Ручные ссылки сегодня: ${ss.manualLinksToday}`);
    lines.push(`  • ${ss.redditNote}`);
  }

  let aiBackfillTotal = 0;
  for (const sec of diagnostics.sections) aiBackfillTotal += sec.backfill;
  if (aiBackfillTotal > 0) {
    lines.push(`\n🤖 AI backfill всего: ${aiBackfillTotal} позиций`);
  }

  for (const w of diagnostics.warnings) {
    lines.push(`⚠️ ${w}`);
  }

  lines.push(`\nРежим языка: ${config.discoveryForeignLanguageMode}`);
  lines.push(`Гарантия минимума: ${config.dailyPackGuaranteeMinimum ? 'вкл' : 'выкл'}`);

  return lines.join('\n');
}
