import { InlineKeyboard } from 'grammy';
import type { Post } from '../types.js';
import { truncateCaption } from '../services/content-filter.js';
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
    kb.text('♻️ Рерайт', `mod:rewrite:${postId}`);
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

export function formatModerationCard(post: Post, timezone: string): string {
  const warnings = post.warnings
    ? (JSON.parse(post.warnings) as Array<{ message: string }>)
    : [];
  const warningText =
    warnings.length > 0
      ? '\n\n⚠️ Предупреждения:\n' + warnings.map((w) => `• ${w.message}`).join('\n')
      : '';

  const captionSource =
    post.type === 'poll' ? post.poll_question : post.caption || post.raw_text;

  const lines = [
    `📋 <b>Кандидат #${post.id}</b>`,
    `Тип: <code>${escapeHtml(post.type)}</code>`,
    `Статус: <code>${escapeHtml(post.status)}</code>`,
    post.category ? `Категория: ${escapeHtml(post.category)}` : null,
    post.source_url ? `URL: ${escapeHtml(post.source_url)}` : null,
    `Текст: ${escapeHtml(truncateCaption(captionSource))}`,
    post.ai_score != null ? `Оценка AI: ${post.ai_score}/10` : null,
    post.risk_score != null ? `Риск: ${post.risk_score}/10` : null,
    post.risk_reason ? `Причина риска: ${escapeHtml(post.risk_reason)}` : null,
    post.last_error ? `Последняя ошибка: ${escapeHtml(post.last_error)}` : null,
    post.scheduled_at
      ? `Запланировано: ${formatDateTime(post.scheduled_at, timezone)}`
      : null,
    warningText || null,
  ].filter(Boolean);

  return lines.join('\n');
}
