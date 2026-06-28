import type { Bot } from 'grammy';
import type { AiModule } from '../../ai/module.js';
import type { AppConfig } from '../../config.js';
import { logger } from '../../logger.js';
import { PublishClaimError } from '../../types.js';
import type { PostRepository } from '../../services/posts.js';
import { PublisherService } from '../../services/publisher.js';
import {
  formatModerationCard,
  moderationKeyboard,
  rewriteVariantsKeyboard,
} from '../keyboards.js';
import { alreadyPublishedError, publishInProgressError } from '../messages.js';
import { schedulePrompt } from './content.js';
import {
  QUEUE_PAGE_SIZE,
  showQueuePage,
} from './moderation.js';
import { clearSession, getQueuePage, getSession, setQueuePage, setSession } from '../session.js';

export function registerCallbackHandlers(
  bot: Bot,
  config: AppConfig,
  posts: PostRepository,
  publisher: PublisherService,
  ai: AiModule | null,
): void {
  const aiEnabled = ai !== null;

  bot.callbackQuery(/^queue:page:(\d+)$/, async (ctx) => {
    const page = Number(ctx.match[1]);
    setQueuePage(ctx.from.id, page);
    await showQueuePage(ctx, posts, config, page, aiEnabled);
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^mod:post:(\d+)$/, async (ctx) => {
    const postId = Number(ctx.match[1]);

    try {
      const { link } = await publisher.publishManual(
        bot.api,
        postId,
        ctx.from.id,
        bot,
      );
      await ctx.answerCallbackQuery({ text: 'Опубликовано!' });
      if (ctx.callbackQuery.message) {
        await ctx.editMessageText(`✅ Опубликовано #${postId}\n${link}`);
      }
    } catch (err) {
      let text = err instanceof Error ? err.message : String(err);
      if (err instanceof PublishClaimError) {
        if (text.includes('опубликован')) text = alreadyPublishedError();
        else if (text.includes('выполняется')) text = publishInProgressError();
      }
      await ctx.answerCallbackQuery({ text });
    }
  });

  bot.callbackQuery(/^mod:schedule:(\d+)$/, async (ctx) => {
    const postId = Number(ctx.match[1]);
    const post = posts.getById(postId);

    if (!post || post.status !== 'pending') {
      await ctx.answerCallbackQuery({
        text: 'Планирование доступно только для статуса pending',
      });
      return;
    }

    setSession(ctx.from.id, { type: 'schedule', postId });
    await ctx.answerCallbackQuery();
    await ctx.reply(schedulePrompt(config.timezone));
  });

  if (aiEnabled && ai) {
    bot.callbackQuery(/^mod:rewrite:(\d+)$/, async (ctx) => {
      const postId = Number(ctx.match[1]);
      const post = posts.getById(postId);

      if (!post) {
        await ctx.answerCallbackQuery({ text: 'Кандидат не найден' });
        return;
      }

      await ctx.answerCallbackQuery({ text: 'Генерация…' });

      try {
        const caption = post.caption || post.raw_text || '';
        const variants = await ai.rewriteCaption(caption);

        setSession(ctx.from.id, { type: 'rewrite_select', postId, variants });

      const formatted = variants.map((v, i) => `Вариант ${i + 1}:\n${v}`).join('\n\n');

        await ctx.reply(`♻️ Варианты рерайта:\n\n${formatted}`, {
          reply_markup: rewriteVariantsKeyboard(postId, variants.length),
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error('moderation', 'Rewrite failed', { postId, error: msg });
        await ctx.reply(`❌ ${msg}`);
      }
    });
  }

  bot.callbackQuery(/^rewrite:pick:(\d+):(\d+)$/, async (ctx) => {
    const postId = Number(ctx.match[1]);
    const variantIdx = Number(ctx.match[2]);
    const post = posts.getById(postId);

    if (!post) {
      await ctx.answerCallbackQuery({ text: 'Кандидат не найден' });
      return;
    }

    const userSession = getSession(ctx.from.id);

    if (userSession.type !== 'rewrite_select' || userSession.postId !== postId) {
      await ctx.answerCallbackQuery({ text: 'Сессия истекла' });
      return;
    }

    const variant = userSession.variants[variantIdx];
    if (!variant) {
      await ctx.answerCallbackQuery({ text: 'Вариант не найден' });
      return;
    }

    posts.update(postId, { caption: variant });
    clearSession(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Caption обновлён' });
    await ctx.reply(`✅ Caption обновлён для #${postId}`);
  });

  bot.callbackQuery(/^rewrite:cancel:(\d+)$/, async (ctx) => {
    clearSession(ctx.from.id);
    await ctx.answerCallbackQuery({ text: 'Отменено' });
  });

  bot.callbackQuery(/^mod:edit:(\d+)$/, async (ctx) => {
    const postId = Number(ctx.match[1]);
    const post = posts.getById(postId);

    if (!post) {
      await ctx.answerCallbackQuery({ text: 'Кандидат не найден' });
      return;
    }

    setSession(ctx.from.id, { type: 'edit_caption', postId });
    await ctx.answerCallbackQuery();
    await ctx.reply('📝 Отправьте новый caption (до 1024 символов):');
  });

  bot.callbackQuery(/^mod:skip:(\d+)$/, async (ctx) => {
    const postId = Number(ctx.match[1]);
    posts.update(postId, { status: 'skipped' });
    await ctx.answerCallbackQuery({ text: 'Пропущено' });

    const page = getQueuePage(ctx.from.id);
    await showNextInQueue(ctx, posts, config, page, aiEnabled);
  });

  bot.callbackQuery(/^mod:delete:(\d+)$/, async (ctx) => {
    const postId = Number(ctx.match[1]);
    posts.update(postId, {
      status: 'deleted',
      deleted_at: new Date().toISOString(),
    });
    await ctx.answerCallbackQuery({ text: 'Удалено' });

    const page = getQueuePage(ctx.from.id);
    await showNextInQueue(ctx, posts, config, page, aiEnabled);
  });
}

async function showNextInQueue(
  ctx: import('grammy').Context,
  posts: PostRepository,
  config: AppConfig,
  page: number,
  aiEnabled: boolean,
): Promise<void> {
  const total = posts.countPending();
  if (total === 0) {
    if (ctx.callbackQuery?.message) {
      await ctx.editMessageText('📭 Очередь пуста.');
    }
    return;
  }

  const totalPages = Math.max(1, total);
  const safePage = Math.min(page, totalPages - 1);
  const items = posts.getPendingPage(safePage, QUEUE_PAGE_SIZE);

  if (items.length === 0 && safePage > 0) {
    await showQueuePage(ctx, posts, config, safePage - 1, aiEnabled);
    return;
  }

  if (items.length === 0) {
    await ctx.editMessageText('📭 Очередь пуста.');
    return;
  }

  const post = items[0];
  await ctx.editMessageText(formatModerationCard(post, config.timezone), {
    parse_mode: 'HTML',
    reply_markup: moderationKeyboard(post.id, safePage, totalPages, aiEnabled),
  });
}
