import type { Bot } from 'grammy';
import { logger } from '../logger.js';
import type { Post } from '../types.js';
import type { PostRepository } from './posts.js';

export async function recoverStaleClaimsOnStartup(
  posts: PostRepository,
  bot: Bot,
  adminIds: number[],
  olderThanMinutes = 10,
): Promise<void> {
  const recovered = posts.recoverStalePublishingClaims(olderThanMinutes);
  if (recovered.length === 0) return;

  logger.warn('recovery', 'Recovered stale publishing claims', { count: recovered.length });

  for (const post of recovered) {
    await notifyAdminsStaleClaim(bot, adminIds, post);
  }
}

async function notifyAdminsStaleClaim(
  bot: Bot,
  adminIds: number[],
  post: Post,
): Promise<void> {
  const message =
    `⚠️ Прерванная публикация восстановлена\n\n` +
    `ID: ${post.id}\n` +
    `Статус: ${post.status}\n` +
    `Ошибка: ${post.last_error ?? '—'}\n\n` +
    `Автопубликация не выполнялась. Проверьте кандидата в /queue.`;

  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId, message);
    } catch (err) {
      logger.error('recovery', 'Failed to notify admin', {
        adminId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
