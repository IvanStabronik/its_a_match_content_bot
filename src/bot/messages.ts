export const ACCESS_DENIED = 'Доступ запрещён';

export const WELCOME_MESSAGE = `👋 <b>Manual Content Publisher Bot</b>

Бот для ручной модерации и публикации контента в канал @itsamatchchannel.

Отправьте текст, фото, видео, GIF, ссылку или перешлите пост — бот сохранит кандидата в очередь.

Откройте /queue для редактирования и публикации.`;

export const SUPPORTED_TYPES_MESSAGE =
  'Поддерживаемые типы контента: текст, фото, видео, GIF/анимация, ссылка (URL).\n' +
  'Стикеры, голосовые, документы, аудио, контакты и геолокация не поддерживаются.';

export const QUEUE_EMPTY = '📭 Очередь пуста.';

export const QUEUE_WARNING =
  '⚠️ В очереди более 50 кандидатов. Рекомендуется ускорить модерацию.';

export function queueWarningIfNeeded(pendingCount: number): string {
  return pendingCount > 50 ? `\n\n${QUEUE_WARNING}` : '';
}

export const FINAL_COMMANDS = [
  '/start — краткое меню',
  '/help — помощь',
  '/queue — очередь',
  '/add &lt;текст&gt; — добавить текст',
  '/poll Question | Opt1 | Opt2 — создать опрос',
  '/scheduled — запланированные',
  '/posted — последние опубликованные',
  '/stats — статистика',
  '/testpost — тестовая публикация',
  '/backup — резервная копия',
  '/skip_caption — оставить подпись пустой',
] as const;

export function getCommandList(aiEnabled: boolean): string {
  const lines: string[] = [...FINAL_COMMANDS];
  if (aiEnabled) {
    lines.push('/ai_edit &lt;post_id&gt; &lt;instruction&gt; — AI-редактура кандидата');
  }
  return lines.join('\n');
}

export function formatStartMessage(aiEnabled: boolean): string {
  return `${WELCOME_MESSAGE}\n\n<b>Команды:</b>\n${getCommandList(aiEnabled)}`;
}

export function formatHelpMessage(aiEnabled: boolean): string {
  return `<b>Справка по командам</b>\n\n${getCommandList(aiEnabled)}`;
}

export function schedulePrompt(timezone: string): string {
  return (
    `🕒 Введите дату и время публикации (${timezone}):\n\n` +
    'Форматы:\n• DD.MM.YYYY HH:mm\n• DD.MM HH:mm'
  );
}

export function scheduleFormatError(): string {
  return '❌ Неверный формат даты.\nПримеры:\n• 25.01.2026 14:30\n• 25.01 14:30';
}

export function candidateCreated(id: number, pendingCount: number): string {
  return `✅ Сохранено. ID кандидата: ${id}${queueWarningIfNeeded(pendingCount)}`;
}

export function pendingCaptionPrompt(postId: number): string {
  return `Добавьте подпись к кандидату #${postId} или отправьте /skip_caption.`;
}

export function addUsageError(): string {
  return '❌ Укажите текст после /add (от 1 до 4096 символов).';
}

export function textTooLongError(): string {
  return '❌ Текст слишком длинный. Допустимая длина: 1–4096 символов.';
}

export function invalidUrlError(): string {
  return '❌ Некорректный формат URL.';
}

export function pollFormatError(): string {
  return '❌ Формат: /poll Вопрос | Вариант1 | Вариант2 [| Вариант3 …]\n2–10 вариантов, вопрос до 255 символов.';
}

export function alreadyPublishedError(): string {
  return 'Данный контент уже был опубликован';
}

export function publishInProgressError(): string {
  return 'Публикация уже выполняется';
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Commands that must not appear in /help after simplification. */
export const REMOVED_COMMANDS = [
  '/sources',
  '/source_add',
  '/source_add_url',
  '/source_pause',
  '/source_resume',
  '/source_remove',
  '/source_check',
  '/source_presets',
  '/discover',
  '/today',
  '/today_generate',
  '/today_rebuild',
  '/selected',
  '/schedule_day',
  '/pack_diagnostics',
  '/setup_sources',
  '/ai_rewrite',
  '/ai_score',
  '/ai_classify',
  '/ai_poll',
  '/ai_cta',
] as const;
