import type { Bot } from 'grammy';
import type { AiModule } from '../../ai/module.js';
import type { AppConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { createBackup, formatFileSize } from '../../services/backup.js';
import type { PostRepository } from '../../services/posts.js';
import { PublisherService } from '../../services/publisher.js';
import { buildPostLink, sendTestMessage } from '../../services/telegram.js';
import {
  addUsageError,
  formatHelpMessage,
  formatStartMessage,
  pollFormatError,
  queueWarningIfNeeded,
  textTooLongError,
} from '../messages.js';
import { parsePollCommand } from './poll.js';

export function registerCommandHandlers(
  bot: Bot,
  config: AppConfig,
  posts: PostRepository,
  publisher: PublisherService,
  ai: AiModule | null,
  db: import('better-sqlite3').Database,
): void {
  const aiEnabled = ai !== null;

  bot.command('start', async (ctx) => {
    await ctx.reply(formatStartMessage(aiEnabled), { parse_mode: 'HTML' });
  });

  bot.command('help', async (ctx) => {
    await ctx.reply(formatHelpMessage(aiEnabled), { parse_mode: 'HTML' });
  });

  bot.command('add', async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/add\s*/, '').trim() ?? '';
    if (!text || text.startsWith('/')) {
      await ctx.reply(addUsageError());
      return;
    }
    if (text.length > 4096) {
      await ctx.reply(textTooLongError());
      return;
    }

    try {
      const post = posts.create({
        type: 'text',
        raw_text: text,
        caption: text,
        created_by: String(ctx.from!.id),
      });
      const pendingCount = posts.countPending();
      await ctx.reply(
        `✅ Кандидат создан. ID: ${post.id}${queueWarningIfNeeded(pendingCount)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('commands', 'Failed to create candidate via /add', { error: msg });
      await ctx.reply(`❌ Ошибка: ${msg}`);
    }
  });

  bot.command('poll', async (ctx) => {
    const raw = ctx.message?.text?.replace(/^\/poll\s*/, '').trim() ?? '';
    const parsed = parsePollCommand(raw);
    if (!parsed.ok) {
      await ctx.reply(parsed.error ?? pollFormatError());
      return;
    }

    try {
      const post = posts.create({
        type: 'poll',
        poll_question: parsed.question,
        poll_options_json: JSON.stringify(parsed.options),
        caption: parsed.question,
        created_by: String(ctx.from!.id),
      });
      await ctx.reply(`✅ Опрос создан. ID кандидата: ${post.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ Ошибка: ${msg}`);
    }
  });

  bot.command('scheduled', async (ctx) => {
    const scheduled = posts.getScheduled(10);
    if (scheduled.length === 0) {
      await ctx.reply('📅 Нет запланированных публикаций.');
      return;
    }
    const lines = scheduled.map(
      (p) => `#${p.id} — ${p.scheduled_at} (${p.type})`,
    );
    await ctx.reply('📅 Запланированные публикации:\n\n' + lines.join('\n'));
  });

  bot.command('posted', async (ctx) => {
    const posted = posts.getPosted(10);
    if (posted.length === 0) {
      await ctx.reply('📤 Нет опубликованных постов.');
      return;
    }
    const lines = posted.map((p) => {
      const link =
        p.telegram_message_id
          ? buildPostLink(config.channelUsername, p.telegram_message_id)
          : '—';
      return `#${p.id} — ${p.posted_at} — ${link}`;
    });
    await ctx.reply('📤 Последние публикации:\n\n' + lines.join('\n'));
  });

  bot.command('stats', async (ctx) => {
    const stats = posts.getStats();
    const lines = [
      '📊 <b>Статистика</b>',
      '',
      '<b>По статусам:</b>',
      ...Object.entries(stats.byStatus).map(([s, c]) => `• ${s}: ${c}`),
      '',
      `Сегодня: ${stats.today}`,
      `За 7 дней: ${stats.last7Days}`,
      `Всего опубликовано: ${stats.allTime}`,
    ];
    await ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
  });

  bot.command('testpost', async (ctx) => {
    try {
      const messageId = await sendTestMessage(bot.api, config.channelUsername);
      const link = buildPostLink(config.channelUsername, messageId);
      await ctx.reply(`✅ Тестовое сообщение отправлено!\n${link}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await ctx.reply(`❌ Ошибка отправки: ${msg}`);
    }
  });

  bot.command('backup', async (ctx) => {
    try {
      const result = createBackup(db, config.backupDir);
      await ctx.reply(
        `✅ Резервная копия создана.\nФайл: ${result.filename}\nРазмер: ${formatFileSize(result.sizeBytes)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('commands', 'Backup failed', { error: msg });
      await ctx.reply(`❌ Ошибка резервного копирования: ${msg}`);
    }
  });

  if (ai) {
    registerAiCommands(bot, ai, posts);
  }
}

function registerAiCommands(
  bot: Bot,
  ai: AiModule,
  posts: PostRepository,
): void {
  bot.command('ai_rewrite', async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/ai_rewrite\s*/, '').trim() ?? '';
    if (!text) {
      await ctx.reply('Использование: /ai_rewrite [текст]');
      return;
    }
    try {
      const variants = await ai.rewriteCaption(text);
      const formatted = variants.map((v, i) => `${i + 1}. ${v}`).join('\n\n');
      await ctx.reply(`♻️ Варианты рерайта:\n\n${formatted}`);
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command('ai_score', async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/ai_score\s*/, '').trim() ?? '';
    if (!text) {
      await ctx.reply('Использование: /ai_score [текст]');
      return;
    }
    try {
      const score = await ai.scoreContent(text);
      await ctx.reply(`📊 AI Score: ${score}/10`);
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command('ai_classify', async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/ai_classify\s*/, '').trim() ?? '';
    if (!text) {
      await ctx.reply('Использование: /ai_classify [текст]');
      return;
    }
    try {
      const category = await ai.classify(text);
      await ctx.reply(`🏷 Категория: ${category}`);
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command('ai_poll', async (ctx) => {
    const text = ctx.message?.text?.replace(/^\/ai_poll\s*/, '').trim() ?? 'Тема: отношения';
    try {
      const poll = await ai.generatePoll(text);
      const post = posts.create({
        type: 'poll',
        poll_question: poll.question,
        poll_options_json: JSON.stringify(poll.options),
        caption: poll.question,
        created_by: String(ctx.from!.id),
      });
      await ctx.reply(
        `📊 Опрос создан (ID: ${post.id})\n\n❓ ${poll.question}\n${poll.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
      );
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  bot.command('ai_cta', async (ctx) => {
    try {
      const cta = await ai.generateCta();
      await ctx.reply(`📣 CTA:\n${cta}`);
    } catch (err) {
      await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });
}
