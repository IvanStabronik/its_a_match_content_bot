import type { Bot, Context } from 'grammy';
import type { AiModule } from '../../ai/module.js';
import type { AppConfig } from '../../config.js';
import { logger } from '../../logger.js';
import {
  checkForbiddenContent,
  extractLinkFromText,
  isValidUrl,
  mergeWarnings,
} from '../../services/content-filter.js';
import type { PostRepository } from '../../services/posts.js';
import {
  formatScheduleConfirm,
  parseScheduleInput,
  toUtcIso,
  validateScheduleTime,
} from '../../services/schedule-parser.js';
import type { CreatePostInput, PostType, Warning } from '../../types.js';
import { InvalidTransitionError } from '../../types.js';
import {
  candidateCreated,
  invalidUrlError,
  pendingCaptionPrompt,
  scheduleFormatError,
  schedulePrompt,
  SUPPORTED_TYPES_MESSAGE,
  textTooLongError,
} from '../messages.js';
import { clearSession, getSession, setSession } from '../session.js';

export function registerContentHandlers(
  bot: Bot,
  posts: PostRepository,
  _ai: AiModule | null,
  config: AppConfig,
): void {
  bot.on('message', async (ctx, next) => {
    if (!ctx.message) return next();

    const session = getSession(ctx.from!.id);

    if (session.type === 'schedule') {
      await handleScheduleInput(ctx, posts, session.postId, config);
      return;
    }

    if (session.type === 'edit_caption') {
      await handleEditCaptionInput(ctx, posts, session.postId);
      return;
    }

    if (session.type === 'waiting_for_caption') {
      await handlePendingCaptionInput(ctx, posts, session.postId);
      return;
    }

    if (ctx.message.text?.startsWith('/')) return next();

    await handleIncomingContent(ctx, posts, config);
  });
}

async function handleScheduleInput(
  ctx: Context,
  posts: PostRepository,
  postId: number,
  config: AppConfig,
): Promise<void> {
  const text = ctx.message?.text?.trim();
  if (!text) {
    await ctx.reply(scheduleFormatError());
    return;
  }

  const date = parseScheduleInput(text, config.timezone);
  if (!date) {
    await ctx.reply(scheduleFormatError());
    return;
  }

  const validation = validateScheduleTime(date);
  if (!validation.valid) {
    await ctx.reply(`❌ ${validation.error}\nПовторите ввод даты и времени.`);
    return;
  }

  const post = posts.getById(postId);
  if (!post || post.status !== 'pending') {
    clearSession(ctx.from!.id);
    await ctx.reply('❌ Кандидат недоступен для планирования (нужен статус pending).');
    return;
  }

  try {
    const iso = toUtcIso(date);
    posts.update(postId, { status: 'scheduled', scheduled_at: iso });
    clearSession(ctx.from!.id);
    await ctx.reply(
      `✅ Публикация запланирована на ${formatScheduleConfirm(iso, config.timezone)}`,
    );
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      await ctx.reply(`❌ ${err.message}`);
    } else {
      throw err;
    }
  }
}

async function handleEditCaptionInput(
  ctx: Context,
  posts: PostRepository,
  postId: number,
): Promise<void> {
  const text = ctx.message?.text ?? '';
  if (text.length > 1024) {
    await ctx.reply('❌ Текст не может быть длиннее 1024 символов.');
    return;
  }

  const post = posts.getById(postId);
  if (!post) {
    clearSession(ctx.from!.id);
    await ctx.reply('Кандидат не найден.');
    return;
  }

  const updates: { caption: string; raw_text?: string } = { caption: text };
  if (post.type === 'text') {
    updates.raw_text = text;
  }

  posts.update(postId, updates);
  clearSession(ctx.from!.id);
  await ctx.reply(`✅ Текст обновлён для кандидата #${postId}`);
}

async function handlePendingCaptionInput(
  ctx: Context,
  posts: PostRepository,
  postId: number,
): Promise<void> {
  const text = ctx.message?.text?.trim() ?? '';
  clearSession(ctx.from!.id);

  const post = posts.getById(postId);
  if (!post) {
    await ctx.reply('Кандидат не найден.');
    return;
  }

  if (text.length > 1024) {
    await ctx.reply('❌ Подпись не длиннее 1024 символов.');
    return;
  }

  posts.update(postId, { caption: text });
  await ctx.reply(`✅ Подпись обновлена для #${postId}`);
}

async function handleIncomingContent(
  ctx: Context,
  posts: PostRepository,
  config: AppConfig,
): Promise<void> {
  const msg = ctx.message!;
  const userId = String(ctx.from!.id);
  const isForwarded = Boolean(msg.forward_origin);

  try {
    let input: CreatePostInput | null = null;

    if (msg.forward_origin) {
      input = extractForwardedContent(msg, userId);
      if (!input) {
        await ctx.reply('❌ Не удалось обработать пересланное сообщение — нет доступного контента.');
        return;
      }
    } else if (msg.photo && msg.photo.length > 0) {
      input = {
        type: 'photo',
        media_file_id: msg.photo[msg.photo.length - 1].file_id,
        caption: msg.caption ?? null,
        created_by: userId,
      };
    } else if (msg.video) {
      input = {
        type: 'video',
        media_file_id: msg.video.file_id,
        caption: msg.caption ?? null,
        created_by: userId,
      };
    } else if (msg.animation) {
      input = {
        type: 'animation',
        media_file_id: msg.animation.file_id,
        caption: msg.caption ?? null,
        created_by: userId,
      };
    } else if (msg.text) {
      const text = msg.text.trim();
      if (text.length > 4096) {
        await ctx.reply(textTooLongError());
        return;
      }

      const linkExtract = extractLinkFromText(text);
      if (linkExtract) {
        if (!isValidUrl(linkExtract.url)) {
          await ctx.reply(invalidUrlError());
          return;
        }
        input = {
          type: 'link',
          source_url: linkExtract.url,
          caption: linkExtract.caption,
          created_by: userId,
        };
      } else if (!text.startsWith('/')) {
        input = {
          type: 'text',
          raw_text: text,
          caption: text,
          created_by: userId,
        };
      }
    } else if (
      msg.sticker ||
      msg.voice ||
      msg.video_note ||
      msg.document ||
      msg.audio ||
      msg.contact ||
      msg.location
    ) {
      await ctx.reply(SUPPORTED_TYPES_MESSAGE);
      return;
    }

    if (!input) return;

    const textForEval = input.caption || input.raw_text || input.source_url || '';
    const forbiddenWarnings = checkForbiddenContent(textForEval);
    let warnings = mergeWarnings(null, forbiddenWarnings);

    if (isForwarded) {
      const forwardWarning: Warning = {
        type: 'forward',
        message: 'Проверьте права/источник перед публикацией.',
      };
      warnings = mergeWarnings(warnings, [forwardWarning]);
    }

    const post = posts.create(input);

    if (warnings) {
      posts.update(post.id, { warnings });
    }

    const pendingCount = posts.countPending();
    await ctx.reply(candidateCreated(post.id, pendingCount));

    const needsCaption =
      (input.type === 'video' || input.type === 'photo' || input.type === 'animation') &&
      !input.caption;

    if (needsCaption) {
      setSession(ctx.from!.id, { type: 'waiting_for_caption', postId: post.id });
      await ctx.reply(pendingCaptionPrompt(post.id));
    }

    logger.info('content', 'Candidate created', { postId: post.id, type: input.type });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.error('content', 'Failed to save candidate', { error: errMsg });
    await ctx.reply(`❌ Ошибка сохранения: ${errMsg}`);
  }
}

function extractForwardedContent(
  msg: NonNullable<Context['message']>,
  userId: string,
): CreatePostInput | null {
  if (msg.text) {
    const linkExtract = extractLinkFromText(msg.text);
    if (linkExtract) {
      return {
        type: 'link',
        source_url: linkExtract.url,
        caption: linkExtract.caption,
        created_by: userId,
      };
    }
    return { type: 'text', raw_text: msg.text, caption: msg.text, created_by: userId };
  }
  if (msg.caption) {
    const type: PostType = msg.photo
      ? 'photo'
      : msg.video
        ? 'video'
        : msg.animation
          ? 'animation'
          : 'text';
    const fileId =
      msg.photo?.[msg.photo.length - 1]?.file_id ??
      msg.video?.file_id ??
      msg.animation?.file_id ??
      null;
    return {
      type,
      media_file_id: fileId,
      caption: msg.caption,
      raw_text: msg.caption,
      created_by: userId,
    };
  }
  if (msg.photo?.length) {
    return {
      type: 'photo',
      media_file_id: msg.photo[msg.photo.length - 1].file_id,
      created_by: userId,
    };
  }
  if (msg.video) {
    return { type: 'video', media_file_id: msg.video.file_id, created_by: userId };
  }
  if (msg.animation) {
    return { type: 'animation', media_file_id: msg.animation.file_id, created_by: userId };
  }
  return null;
}

export { schedulePrompt };
