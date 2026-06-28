import type { Api, Bot, RawApi } from 'grammy';
import { logger } from '../logger.js';
import { PublishClaimError } from '../types.js';
import type { Post } from '../types.js';
import type { PostRepository } from './posts.js';
import { buildPostLink, sendByType } from './telegram.js';

const MANUAL_RETRY_DELAY_MS = 5000;
const SCHEDULED_RETRY_DELAY_MS = 2 * 60 * 1000;
const MANUAL_SEND_ATTEMPTS = 3;
const SCHEDULED_SEND_ATTEMPTS = 3;

export class PublisherService {
  constructor(
    private readonly posts: PostRepository,
    private readonly channelUsername: string,
  ) {}

  async publishManual(
    api: Api<RawApi>,
    postId: number,
    notifyAdminId?: number,
    bot?: Bot,
  ): Promise<{ post: Post; link: string }> {
    let claim;
    try {
      claim = this.posts.claimPublishing(postId);
    } catch (err) {
      if (err instanceof PublishClaimError) throw err;
      throw err;
    }

    const { originalStatus } = claim;

    try {
      const post = this.posts.getById(postId)!;
      const messageId = await sendWithRetries(
        api,
        this.channelUsername,
        post,
        MANUAL_SEND_ATTEMPTS,
        MANUAL_RETRY_DELAY_MS,
      );
      const updated = this.posts.markPosted(postId, messageId);
      const link = buildPostLink(this.channelUsername, messageId);

      logger.info('publisher', 'Post published manually', { postId, messageId });

      if (notifyAdminId && bot) {
        await notifyAdminSafe(
          bot,
          notifyAdminId,
          `✅ Опубликовано!\nID: ${postId}\n${link}`,
        );
      }

      return { post: updated, link };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      logger.error('publisher', 'Manual publish failed', { postId, error: errorMsg });
      this.posts.releasePublishingAfterManualFailure(postId, originalStatus, errorMsg);

      if (notifyAdminId && bot) {
        await notifyAdminSafe(
          bot,
          notifyAdminId,
          `❌ Ошибка публикации ID ${postId}: ${errorMsg}`,
        );
      }
      throw new Error(errorMsg);
    }
  }

  async publishScheduled(
    api: Api<RawApi>,
    postId: number,
    bot: Bot,
    adminIds: number[],
  ): Promise<void> {
    let claim;
    try {
      claim = this.posts.claimPublishing(postId);
    } catch (err) {
      if (err instanceof PublishClaimError) {
        logger.warn('publisher', 'Scheduled publish claim rejected', {
          postId,
          error: err.message,
        });
      }
      return;
    }

    try {
      const post = this.posts.getById(postId)!;
      const messageId = await sendWithRetries(
        api,
        this.channelUsername,
        post,
        SCHEDULED_SEND_ATTEMPTS,
        SCHEDULED_RETRY_DELAY_MS,
      );
      this.posts.markPosted(postId, messageId);
      const link = buildPostLink(this.channelUsername, messageId);
      logger.info('publisher', 'Scheduled post published', { postId, messageId });

      for (const adminId of adminIds) {
        await notifyAdminSafe(
          bot,
          adminId,
          `📅 Запланированный пост опубликован!\nID: ${postId}\n${link}`,
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.posts.markScheduledPublishFailed(postId, errorMsg);
      logger.error('publisher', 'Scheduled publish failed', { postId, error: errorMsg });

      for (const adminId of adminIds) {
        await notifyAdminSafe(
          bot,
          adminId,
          `❌ Ошибка публикации запланированного поста ID ${postId}: ${errorMsg}`,
        );
      }
    }
  }
}

async function sendWithRetries(
  api: Api<RawApi>,
  channelUsername: string,
  post: Post,
  maxAttempts: number,
  delayMs: number,
): Promise<number> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await sendByType(api, channelUsername, post);
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await sleep(delayMs);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function notifyAdminSafe(bot: Bot, adminId: number, message: string): Promise<void> {
  try {
    await bot.api.sendMessage(adminId, message);
  } catch (err) {
    logger.error('publisher', 'Admin notification failed', {
      adminId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
