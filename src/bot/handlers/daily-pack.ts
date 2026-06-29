import type { Bot, Context } from 'grammy';
import type { AiModule } from '../../ai/module.js';
import type { AppConfig } from '../../config.js';
import type { DailyPackService } from '../../services/daily-pack.js';
import type { PostRepository } from '../../services/posts.js';
import type { PackSection } from '../../types.js';
import type { SourceRepository } from '../../services/sources.js';
import {
  dailyPackMainKeyboard,
  formatDailyPackSummary,
  packItemKeyboard,
  scheduleConfirmKeyboard,
  sectionTitle,
} from '../daily-pack-keyboards.js';
import { formatModerationCardForPost } from '../moderation-card.js';
import { escapeHtml } from '../messages.js';
import { clearSession, getSession, setSession } from '../session.js';
import { formatPackDiagnosticsText } from '../../services/pack-diagnostics.js';
import { formatStarterSourcesResult, runStarterSourcesSetup } from '../../services/starter-sources.js';

const SECTIONS: PackSection[] = ['videos', 'memes', 'articles', 'polls', 'ideas'];

export function registerDailyPackHandlers(
  bot: Bot,
  config: AppConfig,
  dailyPack: DailyPackService,
  posts: PostRepository,
  ai: AiModule | null,
  sources?: SourceRepository,
): void {
  const aiEnabled = ai !== null;

  async function showTodayMenu(ctx: Context, generateIfMissing = false): Promise<void> {
    let pack = dailyPack.createOrGetTodayPack();
    if (generateIfMissing && !pack.generated_at) {
      await ctx.reply('⏳ Собираю контент-пакет на сегодня…');
      const result = await dailyPack.generateTodayPack();
      pack = result.pack;
    }
    const summary = dailyPack.getPackSummary(pack.id);
    const text = formatDailyPackSummary(pack.pack_date, summary);
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: dailyPackMainKeyboard() });
  }

  bot.command('today', async (ctx) => {
    await showTodayMenu(ctx, true);
  });

  bot.command('today_generate', async (ctx) => {
    await ctx.reply('⏳ Генерирую контент-пакет…');
    await dailyPack.generateTodayPack();
    await showTodayMenu(ctx, false);
  });

  bot.command('today_rebuild', async (ctx) => {
    await ctx.reply('🔄 Пересобираю пакет (discovery + AI backfill)…');
    const result = await dailyPack.rebuildTodayPack();
    const summaryText =
      `✅ Пакет пересобран.\n\n` +
      `Видео: ${result.summary.videos} · Мемы: ${result.summary.memes} · Разборы: ${result.summary.articles}\n` +
      `Опросы: ${result.summary.polls} · Идеи: ${result.summary.ideas}`;
    await ctx.reply(summaryText);
    await showTodayMenu(ctx, false);
  });

  bot.command('selected', async (ctx) => {
    await showPackSection(ctx, 'selected', 0);
  });

  bot.command('schedule_day', async (ctx) => {
    await showSchedulePreview(ctx);
  });

  bot.command('pack_diagnostics', async (ctx) => {
    const pack = dailyPack.createOrGetTodayPack();
    if (!pack.generated_at) {
      await ctx.reply('⏳ Пакет ещё не собран. Запустите /today_generate или /today_rebuild.');
      return;
    }
    const diagnostics = dailyPack.getPackDiagnostics(pack);
    await ctx.reply(formatPackDiagnosticsText(diagnostics, config), { parse_mode: 'HTML' });
  });

  bot.callbackQuery('pack:diagnostics', async (ctx) => {
    await ctx.answerCallbackQuery();
    const pack = dailyPack.createOrGetTodayPack();
    const diagnostics = dailyPack.getPackDiagnostics(pack);
    const text = formatPackDiagnosticsText(diagnostics, config);
    if (ctx.callbackQuery.message) {
      await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: dailyPackMainKeyboard() });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: dailyPackMainKeyboard() });
    }
  });

  bot.callbackQuery('pack:menu', async (ctx) => {
    await ctx.answerCallbackQuery();
    const pack = dailyPack.createOrGetTodayPack();
    const summary = dailyPack.getPackSummary(pack.id);
    const text = formatDailyPackSummary(pack.pack_date, summary);
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: dailyPackMainKeyboard() });
  });

  bot.callbackQuery(/^pack:section:(\w+):(\d+)$/, async (ctx) => {
    const section = ctx.match[1] as PackSection | 'selected';
    const page = Number(ctx.match[2]);
    await ctx.answerCallbackQuery();
    await showPackSection(ctx, section, page);
  });

  bot.callbackQuery(/^pack:select:(\d+):(\d+)$/, async (ctx) => {
    const packId = Number(ctx.match[1]);
    const postId = Number(ctx.match[2]);
    dailyPack.toggleSelected(packId, postId);
    await ctx.answerCallbackQuery({ text: 'Добавлено в выбранное' });
  });

  bot.callbackQuery(/^pack:unselect:(\d+):(\d+)$/, async (ctx) => {
    const packId = Number(ctx.match[1]);
    const postId = Number(ctx.match[2]);
    dailyPack.unselect(packId, postId);
    await ctx.answerCallbackQuery({ text: 'Снято с выбора' });
  });

  bot.callbackQuery('pack:rebuild', async (ctx) => {
    await ctx.answerCallbackQuery({ text: 'Пересборка…' });
    await dailyPack.rebuildTodayPack();
    const pack = dailyPack.createOrGetTodayPack();
    const summary = dailyPack.getPackSummary(pack.id);
    await ctx.editMessageText(formatDailyPackSummary(pack.pack_date, summary), {
      parse_mode: 'HTML',
      reply_markup: dailyPackMainKeyboard(),
    });
  });

  bot.callbackQuery('pack:schedule_preview', async (ctx) => {
    await ctx.answerCallbackQuery();
    await showSchedulePreview(ctx);
  });

  bot.callbackQuery('pack:schedule_confirm', async (ctx) => {
    if (!ctx.from) return;
    const session = getSession(ctx.from.id);
    if (session.type !== 'schedule_day_confirm') {
      await ctx.answerCallbackQuery({ text: 'Сессия истекла' });
      return;
    }
    dailyPack.applySchedule(session.assignments);
    dailyPack.markPackScheduled(session.packId);
    clearSession(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Запланировано' });
    await ctx.editMessageText(`✅ Запланировано ${session.assignments.length} публикаций.`);
  });

  bot.callbackQuery('pack:schedule_cancel', async (ctx) => {
    if (ctx.from) clearSession(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Отменено' });
    await ctx.editMessageText('❌ Планирование отменено.');
  });

  if (ai) {
    bot.callbackQuery(/^pack:rewrite:(\d+)$/, async (ctx) => {
      const postId = Number(ctx.match[1]);
      const post = posts.getById(postId);
      await ctx.answerCallbackQuery({ text: 'Генерация…' });
      try {
        const variants = await ai.rewriteCaption(post?.caption ?? post?.raw_text ?? '');
        await ctx.reply(`✨ AI-варианты:\n\n${variants.map((v, i) => `${i + 1}. ${v}`).join('\n\n')}`);
      } catch (err) {
        await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    bot.callbackQuery(/^pack:adapt_ru:(\d+)$/, async (ctx) => {
      const postId = Number(ctx.match[1]);
      const post = posts.getById(postId);
      if (!post) {
        await ctx.answerCallbackQuery({ text: 'Не найден' });
        return;
      }
      await ctx.answerCallbackQuery({ text: 'Адаптация…' });
      try {
        const caption = await ai.adaptToRussian(post, config.channelUsername);
        posts.update(postId, { caption, raw_text: caption, language: 'ru' });
        await ctx.reply(`✅ Текст адаптирован для #${postId}`);
      } catch (err) {
        await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    });

    bot.callbackQuery(/^pack:text_post:(\d+)$/, async (ctx) => {
      const postId = Number(ctx.match[1]);
      const post = posts.getById(postId);
      if (!post) {
        await ctx.answerCallbackQuery({ text: 'Не найден' });
        return;
      }
      await ctx.answerCallbackQuery({ text: 'Конвертация…' });
      try {
        const caption = await ai.convertToTextPost(post, config.channelUsername);
        posts.update(postId, {
          type: 'text',
          caption,
          raw_text: caption,
          discovery_format: 'text_idea',
          language: 'ru',
        });
        await ctx.reply(`✅ #${postId} преобразован в текст-пост`);
      } catch (err) {
        await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }

  async function showPackSection(
    ctx: Context,
    section: PackSection | 'selected',
    page: number,
  ): Promise<void> {
    const pack = dailyPack.createOrGetTodayPack();
    const items =
      section === 'selected'
        ? dailyPack.listSelectedItems(pack.id)
        : dailyPack.listPackItemsBySection(pack.id, section);

    if (items.length === 0) {
      const msg = `${sectionTitle(section)}: пока пусто.`;
      if (ctx.callbackQuery?.message) {
        await ctx.editMessageText(msg, { reply_markup: dailyPackMainKeyboard() });
      } else {
        await ctx.reply(msg, { reply_markup: dailyPackMainKeyboard() });
      }
      return;
    }

    const safePage = Math.max(0, Math.min(page, items.length - 1));
    const item = items[safePage]!;
    const post = dailyPack.getPostForPackItem(pack.id, item.post_id);
    if (!post) {
      await ctx.reply('Кандидат не найден.');
      return;
    }

    const card = formatModerationCardForPost(post, config.timezone, sources);
    const header =
      `<b>${escapeHtml(sectionTitle(section))}</b> · ${safePage + 1}/${items.length}\n\n` + card;

    const kb = packItemKeyboard(
      pack.id,
      post.id,
      section,
      safePage,
      items.length,
      item.selected === 1,
      aiEnabled,
    );

    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(header, { parse_mode: 'HTML', reply_markup: kb });
    } else {
      await ctx.reply(header, { parse_mode: 'HTML', reply_markup: kb });
    }
  }

  async function showSchedulePreview(ctx: Context): Promise<void> {
    const pack = dailyPack.createOrGetTodayPack();
    const { preview } = dailyPack.buildSchedulePreview(pack.id);

    if (preview.assignments.length === 0) {
      const msg =
        preview.message ??
        'Нет выбранных постов или не осталось будущих слотов на сегодня.';
      await ctx.reply(msg);
      return;
    }

    const lines = preview.assignments.map((a) => `${a.slotLabel} — Пост #${a.postId}`);
    const tomorrowNote = preview.useTomorrow ? '\n\n(Слоты на завтра)' : '';
    const text =
      `🗓 <b>Будет запланировано:</b>\n\n` +
      lines.map((l) => escapeHtml(l)).join('\n') +
      tomorrowNote +
      '\n\nПодтвердить?';

    if (ctx.from) {
      setSession(ctx.from.id, {
        type: 'schedule_day_confirm',
        packId: pack.id,
        assignments: preview.assignments,
      });
    }

    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        reply_markup: scheduleConfirmKeyboard(),
      });
    } else {
      await ctx.reply(text, { parse_mode: 'HTML', reply_markup: scheduleConfirmKeyboard() });
    }
  }
}
