import { InlineKeyboard } from 'grammy';
import type { PackSection, PackSummary } from '../types.js';
import { formatPackDateDisplay } from '../services/daily-schedule.js';

export function dailyPackMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎬 Видео', 'pack:section:videos:0')
    .text('😂 Мемы', 'pack:section:memes:0')
    .row()
    .text('📰 Разборы', 'pack:section:articles:0')
    .text('📊 Опросы', 'pack:section:polls:0')
    .row()
    .text('💬 Идеи', 'pack:section:ideas:0')
    .text('✅ Выбранное', 'pack:section:selected:0')
    .row()
    .text('🗓 Запланировать выбранное', 'pack:schedule_preview')
    .row()
    .text('🔄 Пересобрать пакет', 'pack:rebuild')
    .text('🩺 Диагностика', 'pack:diagnostics');
}

function formatSectionLine(
  emoji: string,
  label: string,
  section: PackSection,
  count: number,
  summary: PackSummary,
): string {
  const br = summary.breakdown?.[section];
  if (br && (br.real > 0 || br.backfill > 0)) {
    return `${emoji} ${label}: ${count} (${br.real} найдено, ${br.backfill} AI)`;
  }
  return `${emoji} ${label}: ${count}`;
}

export function formatDailyPackSummary(packDate: string, summary: PackSummary): string {
  const lines = [
    `🗓 <b>Контент-пакет на ${formatPackDateDisplay(packDate)}</b>`,
    '',
    formatSectionLine('🎬', 'Видео', 'videos', summary.videos, summary),
    formatSectionLine('😂', 'Мемы', 'memes', summary.memes, summary),
    formatSectionLine('📰', 'Разборы', 'articles', summary.articles, summary),
    formatSectionLine('📊', 'Опросы', 'polls', summary.polls, summary),
    formatSectionLine('💬', 'Идеи', 'ideas', summary.ideas, summary),
    '',
    `Выбрано: ${summary.selected}`,
  ];

  if (summary.warnings && summary.warnings.length > 0) {
    lines.push('', '⚠️ ' + summary.warnings.join('\n⚠️ '));
  }

  return lines.join('\n');
}

export function packItemKeyboard(
  packId: number,
  postId: number,
  section: PackSection | 'selected',
  page: number,
  total: number,
  selected: boolean,
  aiEnabled: boolean,
): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(selected ? '☑️ Выбрано' : '✅ Выбрать', `pack:select:${packId}:${postId}`);
  kb.text('❌ Не брать', `pack:unselect:${packId}:${postId}`).row();

  if (aiEnabled) {
    kb.text('✨ AI-варианты', `pack:rewrite:${postId}`)
      .text('🇷🇺 Адаптировать', `pack:adapt_ru:${postId}`)
      .row();
    kb.text('🧠 Сделать текст-пост', `pack:text_post:${postId}`).row();
  }

  kb.text('📝 Изменить текст', `mod:edit:${postId}`)
    .text('🗓 Запланировать этот', `mod:schedule:${postId}`)
    .row();

  if (page > 0) kb.text('⬅️ Назад', `pack:section:${section}:${page - 1}`);
  if (page < total - 1) kb.text('➡️ Вперёд', `pack:section:${section}:${page + 1}`);
  if (page > 0 || page < total - 1) kb.row();

  kb.text('🔙 К пакету', 'pack:menu');
  return kb;
}

export function scheduleConfirmKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Подтвердить расписание', 'pack:schedule_confirm')
    .row()
    .text('❌ Отмена', 'pack:schedule_cancel');
}

export function sectionTitle(section: PackSection | 'selected'): string {
  if (section === 'selected') return '✅ Выбранное';
  const labels: Record<PackSection, string> = {
    videos: '🎬 Видео',
    memes: '😂 Мемы',
    articles: '📰 Разборы',
    polls: '📊 Опросы',
    ideas: '💬 Идеи',
    other: '📎 Прочее',
  };
  return labels[section];
}
