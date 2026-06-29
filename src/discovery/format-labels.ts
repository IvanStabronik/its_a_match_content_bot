import type { DiscoveryFormat, ContentLanguage } from '../types.js';

export function discoveryFormatLabel(format: DiscoveryFormat | null | undefined): string {
  switch (format) {
    case 'youtube_short_link':
      return 'Shorts-ссылка';
    case 'youtube_video_link':
      return 'Видео-ссылка';
    case 'article_summary':
      return 'Статья';
    case 'meme_image':
      return 'Мем';
    case 'text_idea':
      return 'Текстовая идея';
    case 'native_video':
      return 'Нативное видео';
    default:
      return '—';
  }
}

export function languageLabel(lang: ContentLanguage | null | undefined): string {
  switch (lang) {
    case 'ru':
      return 'ru';
    case 'en':
      return 'en';
    default:
      return 'unknown';
  }
}
