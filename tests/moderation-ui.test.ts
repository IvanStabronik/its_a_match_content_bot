import { describe, expect, it } from 'vitest';
import { formatModerationCard, moderationKeyboard } from '../src/bot/keyboards.js';
import type { Post } from '../src/types.js';

function keyboardTexts(aiEnabled: boolean): string[] {
  const kb = moderationKeyboard(1, 0, 1, aiEnabled);
  return kb.inline_keyboard.flat().map((button) => button.text);
}

describe('Moderation UI', () => {
  it('does not include ♻️ Рерайт when AI is disabled', () => {
    const texts = keyboardTexts(false);
    expect(texts.some((t) => t.includes('Рерайт'))).toBe(false);
    expect(texts.some((t) => t.includes('Rewrite'))).toBe(false);
  });

  it('includes ♻️ Рерайт when AI is enabled', () => {
    const texts = keyboardTexts(true);
    expect(texts).toContain('♻️ Рерайт');
  });

  it('uses Russian button labels', () => {
    const texts = keyboardTexts(false);
    expect(texts).toContain('✅ Опубликовать');
    expect(texts).toContain('🕒 Запланировать');
    expect(texts).toContain('📝 Изменить текст');
    expect(texts).toContain('❌ Пропустить');
    expect(texts).toContain('🗑 Удалить');
  });

  it('uses Russian labels in Moderation_Card', () => {
    const post: Post = {
      id: 1,
      type: 'text',
      status: 'pending',
      category: 'dating_meme',
      source_url: null,
      media_file_id: null,
      media_url: null,
      caption: 'Пример текста',
      raw_text: 'Пример текста',
      ai_score: 7,
      risk_score: 8,
      risk_reason: 'тестовая причина',
      warnings: null,
      poll_question: null,
      poll_options_json: null,
      scheduled_at: null,
      posted_at: null,
      telegram_message_id: null,
      last_error: null,
      publishing_started_at: null,
      created_by: '1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      deleted_at: null,
    };

    const card = formatModerationCard(post, 'Europe/Warsaw');
    expect(card).toContain('Текст:');
    expect(card).toContain('Оценка AI:');
    expect(card).toContain('Риск:');
    expect(card).toContain('Причина риска:');
    expect(card).not.toContain('Caption:');
    expect(card).not.toContain('Risk reason:');
  });
});
