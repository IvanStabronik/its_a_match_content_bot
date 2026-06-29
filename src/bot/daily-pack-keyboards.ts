import { InlineKeyboard } from 'grammy';
import type { PackSection, PackSummary } from '../types.js';
import { PACK_SECTION_LABELS } from '../services/pack-sections.js';
import { formatPackDateDisplay } from '../services/daily-schedule.js';

export function dailyPackMainKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎬 Видео', 'pack:section:videos:0')
    .text('😂 Мемы', 'pack:section:memes:0')
    .row()
    .text('📰 Статьи', 'pack:section:articles:0')
    .text('📊 Опросы', 'pack:section:polls:0')
    .row()
    .text('💬 Идеи', 'pack:section:ideas:0')
    .text('✅ Выбранное', 'pack:section:selected:0')
    .row()
    .text('🗓 Запланировать выбранное', 'pack:schedule_preview')
    .row()
    .text('🔄 Пересобрать пакет', 'pack:rebuild');
}

export function formatDailyPackSummary(packDate: string, summary: PackSummary): string {
  return (
    `🗓 <b>Контент-пакет на ${formatPackDateDisplay(packDate)}</b>\n\n` +
    `🎬 Видео: ${summary.videos}\n` +
    `😂 Мемы: ${summary.memes}\n` +
    `📰 Статьи: ${summary.articles}\n` +
    `📊 Опросы: ${summary.polls}\n` +
    `💬 Идеи: ${summary.ideas}\n\n` +
    `Выбрано: ${summary.selected}`
  );
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
  return PACK_SECTION_LABELS[section];
}
