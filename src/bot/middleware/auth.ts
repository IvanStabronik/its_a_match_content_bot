import type { Context, NextFunction } from 'grammy';
import type { AppConfig } from '../../config.js';
import { isAdmin } from '../../config.js';
import { logger } from '../../logger.js';
import { ACCESS_DENIED } from '../messages.js';

export function createAuthMiddleware(config: AppConfig) {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const userId = ctx.from?.id;
    if (!userId || !isAdmin(userId, config.adminTelegramIds)) {
      if (ctx.callbackQuery) {
        await ctx.answerCallbackQuery({ text: ACCESS_DENIED });
      } else if (ctx.message) {
        await ctx.reply(ACCESS_DENIED);
      }
      logger.warn('auth', 'Unauthorized access attempt', { userId });
      return;
    }
    await next();
  };
}
