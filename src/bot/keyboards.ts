import { InlineKeyboard } from 'grammy';
import type { Post } from '../types.js';
import { truncateCaption } from '../services/content-filter.js';
import { formatDateTime } from '../services/schedule-parser.js';

export function moderationKeyboard(
  postId: number,
  page: number,
  totalPages: number,
  aiEnabled: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard()
    .text('✅ Post Now', `mod:post:${postId}`)
    .text('🕒 Schedule', `mod:schedule:${postId}`)
    .row()
    .text('📝 Edit Caption', `mod:edit:${postId}`);

  if (aiEnabled) {
    kb.text('♻️ Rewrite', `mod:rewrite:${postId}`);
  }

  kb.row().text('❌ Skip', `mod:skip:${postId}`).text('🗑 Delete', `mod:delete:${postId}`);

  if (totalPages > 1) {
    kb.row();
    if (page > 0) kb.text('⬅️ Prev', `queue:page:${page - 1}`);
    if (page < totalPages - 1) kb.text('➡️ Next', `queue:page:${page + 1}`);
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
    `📋 *Кандидат #${post.id}*`,
    `Тип: \`${post.type}\``,
    `Статус: \`${post.status}\``,
    post.category ? `Категория: ${post.category}` : null,
    post.source_url ? `URL: ${post.source_url}` : null,
    `Caption: ${truncateCaption(captionSource)}`,
    post.ai_score != null ? `AI Score: ${post.ai_score}/10` : null,
    post.risk_score != null ? `Risk Score: ${post.risk_score}/10` : null,
    post.risk_reason ? `Risk reason: ${post.risk_reason}` : null,
    post.last_error ? `Последняя ошибка: ${post.last_error}` : null,
    post.scheduled_at
      ? `Запланировано: ${formatDateTime(post.scheduled_at, timezone)}`
      : null,
    warningText || null,
  ].filter(Boolean);

  return lines.join('\n');
}
