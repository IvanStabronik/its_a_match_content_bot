import type { Api, RawApi } from 'grammy';
import { logger } from '../logger.js';
import type { Post } from '../types.js';

const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxAttempts?: number; baseDelayMs?: number; module?: string } = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const module = options.module ?? 'telegram';

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const errorCode = (err as { error_code?: number })?.error_code;
      const isRetryable =
        errorCode !== undefined
          ? RETRYABLE_CODES.has(errorCode)
          : err instanceof Error &&
            (err.message.includes('timeout') ||
              err.message.includes('ETIMEDOUT') ||
              err.message.includes('ECONNRESET'));

      if (!isRetryable || attempt === maxAttempts) {
        logger.error(module, 'Request failed after retries', {
          attempt,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(module, 'Retrying request', { attempt, delayMs: delay });
      await sleep(delay);
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function buildPostLink(channelUsername: string, messageId: number): string {
  return `https://t.me/${channelUsername}/${messageId}`;
}

export async function sendByType(
  api: Api<RawApi>,
  channelUsername: string,
  post: Post,
): Promise<number> {
  const chatId = `@${channelUsername}`;
  const caption = post.caption ?? undefined;

  switch (post.type) {
    case 'text': {
      const text = post.caption || post.raw_text || '';
      const msg = await api.sendMessage(chatId, text);
      return msg.message_id;
    }
    case 'link': {
      const text = post.source_url || post.caption || post.raw_text || '';
      const msg = await api.sendMessage(chatId, text, {
        link_preview_options: { is_disabled: false },
      });
      return msg.message_id;
    }
    case 'photo': {
      const msg = await api.sendPhoto(chatId, post.media_file_id!, { caption });
      return msg.message_id;
    }
    case 'video': {
      const msg = await api.sendVideo(chatId, post.media_file_id!, { caption });
      return msg.message_id;
    }
    case 'animation': {
      const msg = await api.sendAnimation(chatId, post.media_file_id!, { caption });
      return msg.message_id;
    }
    case 'poll': {
      const options = JSON.parse(post.poll_options_json || '[]') as string[];
      const msg = await api.sendPoll(chatId, post.poll_question!, options, {
        is_anonymous: true,
      });
      return msg.message_id;
    }
    default:
      throw new Error(`Unsupported post type: ${post.type as string}`);
  }
}

export async function sendTestMessage(
  api: Api<RawApi>,
  channelUsername: string,
): Promise<number> {
  const chatId = `@${channelUsername}`;
  const text = `🧪 Тестовое сообщение от Content Bot\n${new Date().toISOString()}`;
  const msg = await withRetry(() => api.sendMessage(chatId, text), { module: 'telegram' });
  return msg.message_id;
}

export async function verifyTelegramConnection(
  api: Api<RawApi>,
  timeoutMs = 30000,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await Promise.race([
      api.getMe(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(new Error('Telegram API connection timeout')),
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
