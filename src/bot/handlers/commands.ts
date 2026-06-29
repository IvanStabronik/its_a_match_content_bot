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
import { aiPreviewKeyboard } from '../keyboards.js';
import { clearSession, getSession, setSession } from '../session.js';
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

  bot.command('skip_caption', async (ctx) => {
    const session = getSession(ctx.from!.id);
    if (session.type !== 'waiting_for_caption') {
      await ctx.reply('Нет ожидающей подписи. Отправьте фото/видео/GIF без подписи.');
      return;
    }
    clearSession(ctx.from!.id);
    await ctx.reply(`✅ Подпись для #${session.postId} оставлена пустой.`);
  });

  if (ai) {
    bot.command('ai_edit', async (ctx) => {
      const raw = ctx.message?.text?.replace(/^\/ai_edit\s*/, '').trim() ?? '';
      const match = raw.match(/^(\d+)\s+([\s\S]+)/);
      if (!match) {
        await ctx.reply('Использование: /ai_edit <post_id> <instruction>\nПример: /ai_edit 12 сделай короче и ироничнее');
        return;
      }

      const postId = Number(match[1]);
      const instruction = match[2].trim();
      const post = posts.getById(postId);
      if (!post) {
        await ctx.reply('Кандидат не найден.');
        return;
      }

      try {
        const caption = post.caption || post.raw_text || '';
        const result = await ai.editWithInstruction(caption, instruction);
        setSession(ctx.from!.id, {
          type: 'ai_preview',
          postId,
          text: result,
          action: 'custom',
        });
        await ctx.reply(`Результат:\n\n${result}`, {
          reply_markup: aiPreviewKeyboard(postId),
        });
      } catch (err) {
        await ctx.reply(`❌ ${err instanceof Error ? err.message : String(err)}`);
      }
    });
  }
}
