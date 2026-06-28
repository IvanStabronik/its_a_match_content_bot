import type { Context } from 'grammy';
import type { AppConfig } from '../../config.js';
import type { PostRepository } from '../../services/posts.js';
import { formatModerationCard, moderationKeyboard } from '../keyboards.js';
import { QUEUE_EMPTY, queueWarningIfNeeded } from '../messages.js';
import { getQueuePage, setQueuePage } from '../session.js';

export const QUEUE_PAGE_SIZE = 1;

export async function showQueuePage(
  ctx: Context,
  posts: PostRepository,
  config: AppConfig,
  page: number,
  aiEnabled: boolean,
): Promise<void> {
  const total = posts.countPending();
  if (total === 0) {
    await ctx.reply(QUEUE_EMPTY);
    return;
  }

  const totalPages = Math.max(1, total);
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const items = posts.getPendingPage(safePage, QUEUE_PAGE_SIZE);

  if (items.length === 0) {
    await ctx.reply(QUEUE_EMPTY);
    return;
  }

  const post = items[0];
  const warning = queueWarningIfNeeded(total);
  const text = formatModerationCard(post, config.timezone) + warning;
  const kb = moderationKeyboard(post.id, safePage, totalPages, aiEnabled);

  if (ctx.callbackQuery) {
    await ctx.editMessageText(text, { parse_mode: 'Markdown', reply_markup: kb });
  } else {
    await ctx.reply(text, { parse_mode: 'Markdown', reply_markup: kb });
  }
}

export function registerQueueCommand(
  bot: import('grammy').Bot,
  posts: PostRepository,
  config: AppConfig,
  aiEnabled: boolean,
): void {
  bot.command('queue', async (ctx) => {
    setQueuePage(ctx.from!.id, 0);
    await showQueuePage(ctx, posts, config, 0, aiEnabled);
  });
}

export { getQueuePage, setQueuePage };
