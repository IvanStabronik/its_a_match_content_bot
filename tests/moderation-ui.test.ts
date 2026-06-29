import { describe, expect, it } from 'vitest';
import { formatModerationCard, moderationKeyboard } from '../src/bot/keyboards.js';
import { discoveryFormatLabel } from '../src/discovery/format-labels.js';
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
    discovery_source_id: null,
    discovery_item_id: null,
    source_title: null,
    source_author: null,
    thumbnail_url: null,
    discovered_at: null,
    ...overrides,
  };
}

describe('Moderation UI', () => {
  it('does not include AI-варианты when AI is disabled', () => {
    const texts = keyboardTexts(false);
    expect(texts.some((t) => t.includes('AI-варианты'))).toBe(false);
    expect(texts.some((t) => t.includes('Рерайт'))).toBe(false);
  });

  it('includes AI-варианты when AI is enabled', () => {
    const texts = keyboardTexts(true);
    expect(texts).toContain('🇷🇺 Адаптировать на русский');
    expect(texts).toContain('🧠 Сделать текст-пост');
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
    const card = formatModerationCard(basePost(), 'Europe/Warsaw');
    expect(card).toContain('<b>Кандидат #1</b>');
    expect(card).toContain('Текст:');
    expect(card).toContain('Оценка AI:');
    expect(card).toContain('Риск:');
    expect(card).toContain('Причина риска:');
    expect(card).not.toContain('Caption:');
    expect(card).not.toContain('Risk reason:');
  });

  it('displays discovery metadata in moderation card', () => {
    const card = formatModerationCard(
      basePost({
        type: 'link',
        source_url: 'https://youtube.com/watch?v=abc',
        source_title: 'Video title',
        source_author: 'Channel Name',
        discovered_at: '2026-06-28T12:00:00.000Z',
        discovery_source_id: 3,
      }),
      'Europe/Warsaw',
      { platformLabel: 'YouTube канал', sourceName: 'My YT Source' },
    );
    expect(card).toContain('Источник:');
    expect(card).toContain('YouTube канал');
    expect(card).toContain('My YT Source');
    expect(card).toContain('Video title');
    expect(card).toContain('Channel Name');
    expect(card).toContain('Найдено:');
  });

  it('shows format language and duration on queue card', () => {
    const card = formatModerationCard(
      basePost({
        discovery_format: 'youtube_short_link',
        language: 'ru',
        duration_seconds: 45,
        content_angle: 'Короткий видео-формат',
        quality_score: 8,
      }),
      'Europe/Warsaw',
    );
    expect(card).toContain('Shorts-ссылка');
    expect(card).toContain('Язык: ru');
    expect(card).toContain('45 сек');
    expect(card).toContain('Качество: 8/10');
    expect(discoveryFormatLabel('youtube_short_link')).toBe('Shorts-ссылка');
  });
});
