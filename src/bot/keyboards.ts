import { InlineKeyboard } from 'grammy';
import type { Post } from '../types.js';
import { postTypeLabel, truncateCaption } from '../services/content-filter.js';
import { resolvePublishUrl } from '../services/publish-content.js';
import { escapeHtml } from './messages.js';
import { formatDateTime } from '../services/schedule-parser.js';

export function moderationKeyboard(
  postId: number,
  page: number,
  totalPages: number,
  aiEnabled: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('✅ Опубликовать', `mod:post:${postId}`)
    .text('🕒 Запланировать', `mod:schedule:${postId}`)
    .row()
    .text('📝 Изменить текст', `mod:edit:${postId}`);

  if (aiEnabled) {
    kb.text('✨ AI-варианты', `mod:rewrite:${postId}`).row();
    kb.text('✂️ Сократить', `mod:shorten:${postId}`)
      .text('🎭 Сделать живее', `mod:livelier:${postId}`)
      .row()
      .text('🧹 Исправить ошибки', `mod:proofread:${postId}`);
  }

  kb.row().text('❌ Пропустить', `mod:skip:${postId}`).text('🗑 Удалить', `mod:delete:${postId}`);

  if (totalPages > 1) {
    kb.row();
    if (page > 0) kb.text('⬅️ Назад', `queue:page:${page - 1}`);
    if (page < totalPages - 1) kb.text('➡️ Вперёд', `queue:page:${page + 1}`);
  }

  return kb;
}

export function rewriteVariantsKeyboard(postId: number, count: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  for (let i = 0; i < count; i++) {
    kb.text(`Вариант ${i + 1}`, `rewrite:pick:${postId}:${i}`).row();
  }
  kb.text('❌ Отмена', `rewrite:cancel:${postId}`);
  return kb;
}

export function aiPreviewKeyboard(postId: number): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Применить', `ai:apply:${postId}`)
    .text('❌ Отмена', `ai:cancel:${postId}`);
}

export function formatModerationCard(post: Post, timezone: string): string {
  const warnings = post.warnings
    ? (JSON.parse(post.warnings) as Array<{ message: string }>)
    : [];
  const warningText =
    warnings.length > 0
      ? '\n\n⚠️ Предупреждения:\n' + warnings.map((w) => `• ${escapeHtml(w.message)}`).join('\n')
      : '';

  const captionSource =
    post.type === 'poll' ? post.poll_question : post.caption || post.raw_text;

  const url = resolvePublishUrl(post);

  const lines = [
    `📋 <b>Кандидат #${post.id}</b>`,
    `Тип: <code>${escapeHtml(postTypeLabel(post.type))}</code>`,
    `Статус: <code>${escapeHtml(post.status)}</code>`,
    post.category ? `Категория: ${escapeHtml(post.category)}` : null,
    url ? `URL: ${escapeHtml(url)}` : null,
    `Текст: ${escapeHtml(truncateCaption(captionSource))}`,
    post.last_error ? `Последняя ошибка: ${escapeHtml(post.last_error)}` : null,
    post.scheduled_at
      ? `Запланировано: ${formatDateTime(post.scheduled_at, timezone)}`
      : null,
    warningText || null,
  ].filter(Boolean);

  return lines.join('\n');
}
