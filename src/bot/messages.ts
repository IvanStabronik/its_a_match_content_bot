export const ACCESS_DENIED = 'Доступ запрещён';

export const WELCOME_MESSAGE = `👋 <b>Its a Match Content Bot</b>

Бот для модерации и публикации контента в канал @itsamatchchannel.

Отправьте текст, фото, видео, GIF или ссылку — бот сохранит кандидата в очередь.

Используйте /help для списка команд.`;

export const SUPPORTED_TYPES_MESSAGE =
  'Поддерживаемые типы контента: текст, фото, видео, GIF/анимация, ссылка (URL).\n' +
  'Стикеры, голосовые, документы, аудио, контакты и геолокация не поддерживаются.';

export const QUEUE_EMPTY = '📭 Очередь пуста.';

export const QUEUE_WARNING =
  '⚠️ В очереди более 50 кандидатов. Рекомендуется ускорить модерацию.';

export function queueWarningIfNeeded(pendingCount: number): string {
  return pendingCount > 50 ? `\n\n${QUEUE_WARNING}` : '';
}

export function getCommandList(aiEnabled: boolean): string {
  const base = [
    '/start — приветствие и список команд',
    '/help — справка по командам',
    '/queue — очередь модерации',
    '/add <текст> — добавить текстовый кандидат',
    '/poll Question | Opt1 | Opt2 — создать опрос',
    '/scheduled — запланированные публикации',
    '/posted — последние опубликованные посты',
    '/stats — статистика',
    '/testpost — тестовая публикация в канал',
    '/backup — резервная копия базы данных',
  ];

  if (aiEnabled) {
    base.push(
      '/ai_rewrite — AI-рерайт текста',
      '/ai_score — AI-оценка контента',
      '/ai_classify — AI-классификация',
      '/ai_poll — AI-генерация опроса',
      '/ai_cta — AI-призыв к действию',
    );
  }

  return base.join('\n');
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
