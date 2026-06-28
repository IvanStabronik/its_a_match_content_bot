import type { Api, Bot, RawApi } from 'grammy';
import { logger } from '../logger.js';
import { PublishClaimError } from '../types.js';
import type { Post } from '../types.js';
import type { PostRepository } from './posts.js';
import { buildPostLink, sendByType } from './telegram.js';

const MANUAL_RETRY_DELAY_MS = 5000;
const SCHEDULED_RETRY_DELAY_MS = 2 * 60 * 1000;

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
    let lastError: unknown;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const post = this.posts.getById(postId)!;
        const messageId = await sendByType(api, this.channelUsername, post);
        const updated = this.posts.markPosted(postId, messageId);
        const link = buildPostLink(this.channelUsername, messageId);

        logger.info('publisher', 'Post published manually', { postId, messageId });

        if (notifyAdminId && bot) {
          await bot.api.sendMessage(notifyAdminId, `✅ Опубликовано!\nID: ${postId}\n${link}`);
        }

        return { post: updated, link };
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          await sleep(MANUAL_RETRY_DELAY_MS);
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
    logger.error('publisher', 'Manual publish failed', { postId, error: errorMsg });
    this.posts.releasePublishingAfterManualFailure(postId, originalStatus, errorMsg);

    if (notifyAdminId && bot) {
      await bot.api.sendMessage(notifyAdminId, `❌ Ошибка публикации ID ${postId}: ${errorMsg}`);
    }
    throw new Error(errorMsg);
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

    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const post = this.posts.getById(postId)!;
        const messageId = await sendByType(api, this.channelUsername, post);
        this.posts.markPosted(postId, messageId);
        const link = buildPostLink(this.channelUsername, messageId);
        logger.info('publisher', 'Scheduled post published', { postId, messageId });
        for (const adminId of adminIds) {
          await bot.api.sendMessage(
            adminId,
            `📅 Запланированный пост опубликован!\nID: ${postId}\n${link}`,
          );
        }
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          await sleep(SCHEDULED_RETRY_DELAY_MS);
        }
      }
    }

    const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
    this.posts.markScheduledPublishFailed(postId, errorMsg);
    logger.error('publisher', 'Scheduled publish failed', { postId, error: errorMsg });
    for (const adminId of adminIds) {
      await bot.api.sendMessage(
        adminId,
        `❌ Ошибка публикации запланированного поста ID ${postId}: ${errorMsg}`,
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
