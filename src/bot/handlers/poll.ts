export function parsePollCommand(raw: string): {
  ok: boolean;
  question?: string;
  options?: string[];
  error?: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { ok: false, error: '❌ Формат: /poll Вопрос | Вариант1 | Вариант2' };
  }

  const parts = trimmed.split('|').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 3) {
    return {
      ok: false,
      error: '❌ Нужны вопрос и минимум 2 варианта ответа (разделитель |).',
    };
  }

  const question = parts[0];
  const options = parts.slice(1);

  if (question.length > 255) {
    return { ok: false, error: '❌ Вопрос не может быть длиннее 255 символов.' };
  }
  if (options.length < 2 || options.length > 10) {
    return { ok: false, error: '❌ Количество вариантов: от 2 до 10.' };
  }

  return { ok: true, question, options };
}
