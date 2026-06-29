import { describe, expect, it } from 'vitest';
import { formatModerationCard, moderationKeyboard } from '../src/bot/keyboards.js';
import type { Post } from '../src/types.js';

function keyboardTexts(aiEnabled: boolean): string[] {
  const kb = moderationKeyboard(1, 0, 1, aiEnabled);
  return kb.inline_keyboard.flat().map((button) => button.text);
}

function basePost(overrides: Partial<Post> = {}): Post {
  return {
    id: 1,
    type: 'text',
    status: 'pending',
    category: null,
    source_url: null,
    media_file_id: null,
    media_url: null,
    caption: 'Пример текста',
    raw_text: 'Пример текста',
    ai_score: null,
    risk_score: null,
    risk_reason: null,
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
    discovery_source_id: null,
    discovery_item_id: null,
    source_title: null,
    source_author: null,
    thumbnail_url: null,
    discovered_at: null,
    discovery_format: null,
    language: null,
    duration_seconds: null,
    quality_score: null,
    content_angle: null,
    publish_recommendation: null,
    shorts_url: null,
    pack_section: null,
    selected_for_today: 0,
    ...overrides,
  };
}

describe('Moderation UI', () => {
  it('does not include AI buttons when AI is disabled', () => {
    const texts = keyboardTexts(false);
    expect(texts.some((t) => t.includes('AI'))).toBe(false);
  });

  it('includes AI editing buttons when AI is enabled', () => {
    const texts = keyboardTexts(true);
    expect(texts).toContain('✨ AI-варианты');
    expect(texts).toContain('✂️ Сократить');
    expect(texts).not.toContain('🇷🇺 Адаптировать на русский');
  });

  it('uses Russian button labels', () => {
    const texts = keyboardTexts(false);
    expect(texts).toContain('✅ Опубликовать');
    expect(texts).toContain('🕒 Запланировать');
    expect(texts).toContain('📝 Изменить текст');
    expect(texts).toContain('❌ Пропустить');
    expect(texts).toContain('🗑 Удалить');
  });

  it('shows simplified queue card fields', () => {
    const card = formatModerationCard(
      basePost({
        type: 'link',
        source_url: 'https://example.com',
        caption: 'Текст',
      }),
      'Europe/Warsaw',
    );
    expect(card).toContain('<b>Кандидат #1</b>');
    expect(card).toContain('Тип:');
    expect(card).toContain('ссылка');
    expect(card).toContain('URL:');
    expect(card).not.toContain('Источник:');
    expect(card).not.toContain('Найдено:');
  });
});
