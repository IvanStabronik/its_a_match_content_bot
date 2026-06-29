import type { Bot } from 'grammy';
import type { AiModule } from '../../ai/module.js';
import type { AppConfig } from '../../config.js';
import type { DiscoveryService } from '../../discovery/service.js';
import { getAdapter } from '../../discovery/adapters/index.js';
import {
  PIKABU_FEED_HINT,
  validateFeedConfigAsync,
} from '../../discovery/adapters/public-feed.js';
import {
  sourceStatusLabel,
  sourceTypeLabel,
  type SourceRepository,
} from '../../services/sources.js';
import type { PostRepository } from '../../services/posts.js';
import { createCandidateFromUrl } from '../../services/url-candidate.js';
import { formatStarterSourcesResult, runStarterSourcesSetup } from '../../services/starter-sources.js';
import { escapeHtml } from '../messages.js';

async function addFeedSource(
  sources: SourceRepository,
  type: 'rss_article_ru' | 'public_feed' | 'pikabu_rss' | 'rss_article' | 'rss',
  feedUrl: string,
  name: string,
  pikabu: boolean,
): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  const adapter = getAdapter(type);
  const sourceConfig = { feedUrl };
  const syncErr = adapter.validateConfig(sourceConfig);
  if (syncErr) return { ok: false, message: syncErr };

  const asyncErr = await validateFeedConfigAsync(sourceConfig, pikabu);
  if (asyncErr) return { ok: false, message: asyncErr };

  const source = sources.create({ type, name, config: sourceConfig });
  return { ok: true, id: source.id };
}

function formatSourceLine(
  source: import('../../types.js').Source,
  sources: SourceRepository,
): string {
  const candidates = sources.countCandidatesCreated(source.id);
  const status = sourceStatusLabel(source.enabled);
  const lastChecked = source.last_checked_at ?? '—';
  const lastError = source.last_error ? `\n   ⚠️ ${source.last_error}` : '';
  return (
    `#${source.id} [${sourceTypeLabel(source.type)}] ${source.name}\n` +
    `   Статус: ${status} | Проверен: ${lastChecked}\n` +
    `   Кандидатов создано: ${candidates}${lastError}`
  );
}

export function registerSourceHandlers(
  bot: Bot,
  config: AppConfig,
  sources: SourceRepository,
  discovery: DiscoveryService,
  posts: PostRepository,
  ai: AiModule | null = null,
): void {
  bot.command('sources', async (ctx) => {
    const list = sources.listAll();
    if (list.length === 0) {
      await ctx.reply('📡 Источники не настроены.\n\nДобавьте: /source_add rss <url> [имя]');
      return;
    }
    const lines = list.map((s) => formatSourceLine(s, sources));
    await ctx.reply(`📡 <b>Источники</b>\n\n${escapeHtml(lines.join('\n\n'))}`, {
      parse_mode: 'HTML',
    });
  });

  bot.command('source_add', async (ctx) => {
    const args = ctx.message?.text?.replace(/^\/source_add\s*/, '').trim() ?? '';
    const parts = args.split(/\s+/);
    const subType = parts[0]?.toLowerCase();

    if (!subType || subType === '/source_add') {
      await ctx.reply(
        'Использование:\n' +
          '/source_add youtube_channel <url|@handle|id> [имя]\n' +
          '/source_add youtube_search <запрос>\n' +
          '/source_add youtube_short_search <запрос>\n' +
          '/source_add rss <feed_url> [имя]\n' +
          '/source_add rss_article <feed_url> [имя]\n' +
          '/source_add rss_article_ru <feed_url> [имя]\n' +
          '/source_add public_feed <feed_url> [имя]\n' +
          '/source_add pikabu_rss <feed_url> [имя]\n' +
          '/source_add reddit_subreddit <subreddit> [имя]\n' +
          '/source_add_url <url> — ручная ссылка (статья/мем/идея)',
      );
      return;
    }

    try {
      if (subType === 'youtube_channel') {
        const input = parts[1];
        if (!input) {
          await ctx.reply('Укажите URL, @handle или channel ID YouTube.');
          return;
        }
        if (!config.youtubeApiKey) {
          await ctx.reply(
            '❌ YouTube API недоступен: не задан YOUTUBE_API_KEY в .env.',
          );
          return;
        }
        const name = parts.slice(2).join(' ') || `YouTube: ${input}`;
        const adapter = getAdapter('youtube_channel');
        const sourceConfig = { input };
        const err = adapter.validateConfig(sourceConfig);
        if (err) {
          await ctx.reply(`❌ ${err}`);
          return;
        }
        const source = sources.create({ type: 'youtube_channel', name, config: sourceConfig });
        await ctx.reply(`✅ YouTube канал добавлен. ID источника: ${source.id}`);
        return;
      }

      if (subType === 'youtube_search') {
        const query = parts.slice(1).join(' ');
        if (!query) {
          await ctx.reply('Укажите поисковый запрос YouTube.');
          return;
        }
        if (!config.youtubeApiKey) {
          await ctx.reply(
            '❌ YouTube API недоступен: не задан YOUTUBE_API_KEY в .env.',
          );
          return;
        }
        const source = sources.create({
          type: 'youtube_search',
          name: `YouTube поиск: ${query}`,
          config: { query },
        });
        await ctx.reply(`✅ YouTube поиск добавлен. ID источника: ${source.id}`);
        return;
      }

      if (subType === 'youtube_short_search') {
        const query = parts.slice(1).join(' ');
        if (!query) {
          await ctx.reply('Укажите поисковый запрос для YouTube Shorts.');
          return;
        }
        if (!config.youtubeApiKey) {
          await ctx.reply('❌ YouTube API недоступен: не задан YOUTUBE_API_KEY в .env.');
          return;
        }
        const source = sources.create({
          type: 'youtube_short_search',
          name: `YouTube Shorts: ${query}`,
          config: { query },
        });
        await ctx.reply(`✅ YouTube Shorts поиск добавлен. ID: ${source.id}`);
        return;
      }

      if (subType === 'rss') {
        const feedUrl = parts[1];
        if (!feedUrl) {
          await ctx.reply('Укажите URL RSS-ленты.');
          return;
        }
        const name = parts.slice(2).join(' ') || `RSS: ${feedUrl}`;
        const adapter = getAdapter('rss');
        const sourceConfig = { feedUrl };
        const err = adapter.validateConfig(sourceConfig);
        if (err) {
          await ctx.reply(`❌ ${err}`);
          return;
        }
        const source = sources.create({ type: 'rss', name, config: sourceConfig });
        await ctx.reply(`✅ RSS добавлен. ID источника: ${source.id}`);
        return;
      }

      if (subType === 'rss_article') {
        const feedUrl = parts[1];
        if (!feedUrl) {
          await ctx.reply('Укажите URL RSS-ленты.');
          return;
        }
        const name = parts.slice(2).join(' ') || `RSS статьи: ${feedUrl}`;
        const result = await addFeedSource(sources, 'rss_article', feedUrl, name, false);
        if (!result.ok) {
          await ctx.reply(`❌ ${result.message}`);
          return;
        }
        await ctx.reply(`✅ RSS (статьи) добавлен. ID: ${result.id}`);
        return;
      }

      if (subType === 'rss_article_ru') {
        const feedUrl = parts[1];
        if (!feedUrl) {
          await ctx.reply('Укажите URL русскоязычной RSS-ленты.');
          return;
        }
        const name = parts.slice(2).join(' ') || `RSS RU: ${feedUrl}`;
        const result = await addFeedSource(sources, 'rss_article_ru', feedUrl, name, false);
        if (!result.ok) {
          await ctx.reply(`❌ ${result.message}`);
          return;
        }
        await ctx.reply(`✅ RSS RU (статьи) добавлен. ID: ${result.id}`);
        return;
      }

      if (subType === 'public_feed') {
        const feedUrl = parts[1];
        if (!feedUrl) {
          await ctx.reply('Укажите URL публичного RSS/Atom-фида.');
          return;
        }
        const name = parts.slice(2).join(' ') || `Feed: ${feedUrl}`;
        const result = await addFeedSource(sources, 'public_feed', feedUrl, name, false);
        if (!result.ok) {
          await ctx.reply(`❌ ${result.message}`);
          return;
        }
        await ctx.reply(`✅ Public feed добавлен. ID: ${result.id}`);
        return;
      }

      if (subType === 'pikabu_rss') {
        const feedUrl = parts[1];
        if (!feedUrl) {
          await ctx.reply(`Укажите URL публичного RSS/Atom-фида Pikabu.\n\n${PIKABU_FEED_HINT}`);
          return;
        }
        const name = parts.slice(2).join(' ') || 'Pikabu';
        const result = await addFeedSource(sources, 'pikabu_rss', feedUrl, name, true);
        if (!result.ok) {
          await ctx.reply(`❌ ${result.message}`);
          return;
        }
        await ctx.reply(`✅ Pikabu RSS добавлен. ID: ${result.id}`);
        return;
      }

      if (subType === 'manual_source_link') {
        await ctx.reply(`Для ручных ссылок используйте:\n/source_add_url <url>\n\n${PIKABU_FEED_HINT}`);
        return;
      }

      if (subType === 'reddit_subreddit') {
        const subreddit = parts[1]?.replace(/^r\//, '');
        if (!subreddit) {
          await ctx.reply('Укажите subreddit, например: dating');
          return;
        }
        if (!config.redditClientId || !config.redditClientSecret) {
          await ctx.reply(
            '❌ Reddit API не настроен.\nДобавьте REDDIT_CLIENT_ID и REDDIT_CLIENT_SECRET в .env.',
          );
          return;
        }
        if (
          !config.redditAllowedSubreddits.some(
            (s) => s.toLowerCase() === subreddit.toLowerCase(),
          )
        ) {
          await ctx.reply(`❌ Subreddit r/${subreddit} не в списке разрешённых.`);
          return;
        }
        const name = parts.slice(2).join(' ') || `Reddit: r/${subreddit}`;
        const source = sources.create({
          type: 'reddit_subreddit',
          name,
          config: { subreddit },
        });
        await ctx.reply(`✅ Reddit subreddit добавлен. ID: ${source.id}`);
        return;
      }

      await ctx.reply(
        'Неизвестный тип. Используйте: youtube_channel, youtube_search, youtube_short_search, rss, rss_article, rss_article_ru, public_feed, pikabu_rss, reddit_subreddit',
      );
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command('source_pause', async (ctx) => {
    const id = Number(ctx.message?.text?.replace(/^\/source_pause\s*/, '').trim());
    if (!id) {
      await ctx.reply('Использование: /source_pause <id>');
      return;
    }
    const source = sources.setEnabled(id, false);
    if (!source) {
      await ctx.reply('Источник не найден.');
      return;
    }
    await ctx.reply(`⏸ Источник #${id} приостановлен.`);
  });

  bot.command('source_resume', async (ctx) => {
    const id = Number(ctx.message?.text?.replace(/^\/source_resume\s*/, '').trim());
    if (!id) {
      await ctx.reply('Использование: /source_resume <id>');
      return;
    }
    const source = sources.setEnabled(id, true);
    if (!source) {
      await ctx.reply('Источник не найден.');
      return;
    }
    await ctx.reply(`▶️ Источник #${id} возобновлён.`);
  });

  bot.command('source_remove', async (ctx) => {
    const id = Number(ctx.message?.text?.replace(/^\/source_remove\s*/, '').trim());
    if (!id) {
      await ctx.reply('Использование: /source_remove <id>');
      return;
    }
    const source = sources.setEnabled(id, false);
    if (!source) {
      await ctx.reply('Источник не найден.');
      return;
    }
    await ctx.reply(`🗑 Источник #${id} отключён. История сохранена.`);
  });

  bot.command('source_check', async (ctx) => {
    const id = Number(ctx.message?.text?.replace(/^\/source_check\s*/, '').trim());
    if (!id) {
      await ctx.reply('Использование: /source_check <id>');
      return;
    }
    await ctx.reply('🔎 Проверяю источник…');
    const result = await discovery.checkSource(id);
    const errText = result.errors.length > 0 ? `\nОшибки: ${result.errors.join('; ')}` : '';
    await ctx.reply(
      `🔎 Источник #${result.sourceId} (${result.sourceName})\n` +
        `Найдено: ${result.found}\n` +
        `Новых кандидатов: ${result.newCandidates}\n` +
        `Дубликатов пропущено: ${result.duplicatesSkipped}${errText}`,
    );
  });

  bot.command('discover', async (ctx) => {
    await ctx.reply('🔎 Запускаю проверку всех активных источников…');
    const summary = await discovery.discoverAll();
    const errText =
      summary.errors.length > 0
        ? `\n\nОшибки:\n${summary.errors.slice(0, 5).join('\n')}`
        : '';
    await ctx.reply(
      `🔎 <b>Результат проверки</b>\n\n` +
        `Источников проверено: ${summary.checkedSources}\n` +
        `Новых кандидатов: ${summary.newCandidates}\n` +
        `Дубликатов пропущено: ${summary.duplicatesSkipped}${escapeHtml(errText)}`,
      { parse_mode: 'HTML' },
    );
  });

  bot.command('source_add_url', async (ctx) => {
    const url = ctx.message?.text?.replace(/^\/source_add_url\s*/, '').trim() ?? '';
    if (!url) {
      await ctx.reply('Использование: /source_add_url <url>\n\nПример: /source_add_url https://pikabu.ru/story/...');
      return;
    }
    try {
      new URL(url);
    } catch {
      await ctx.reply('❌ Некорректный URL.');
      return;
    }

    await ctx.reply('⏳ Загружаю метаданные и создаю кандидата…');
    try {
      const result = await createCandidateFromUrl(
        posts,
        url,
        ai,
        config.channelUsername,
      );
      await ctx.reply(
        `✅ Кандидат #${result.postId} создан (${result.section}).\n` +
          `Формат: ${result.format}\n` +
          'Откройте /queue или /today',
      );
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command('source_presets', async (ctx) => {
    const lines = [
      '📋 <b>Рекомендуемые источники (RU-first)</b>',
      '',
      '<b>YouTube Shorts:</b>',
      '/source_add youtube_short_search красные флаги в отношениях',
      '/source_add youtube_short_search ошибки в отношениях',
      '/source_add youtube_short_search первое свидание',
      '/source_add youtube_short_search переписка в отношениях',
      '/source_add youtube_short_search токсичные отношения',
      '',
      '<b>RSS / статьи:</b>',
      '/source_add rss_article_ru &lt;RSS_URL&gt; &lt;Название&gt;',
      '',
      '<b>Pikabu:</b>',
      '/source_add pikabu_rss &lt;PUBLIC_RSS_OR_ATOM_URL&gt; Pikabu',
      'или вручную:',
      '/source_add_url &lt;URL поста Pikabu&gt;',
      '',
      '<b>Reddit (опционально):</b>',
      '/source_add reddit_subreddit relationshipmemes',
      '',
      '<b>Ручная ссылка:</b>',
      '/source_add_url &lt;url&gt;',
      '',
      'После добавления: /discover → /queue или /today_rebuild',
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('setup_sources', async (ctx) => {
    const result = runStarterSourcesSetup(sources, config);
    await ctx.reply(formatStarterSourcesResult(result), { parse_mode: 'HTML' });
  });
}
