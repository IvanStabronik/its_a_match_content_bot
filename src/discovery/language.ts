import type { AppConfig } from '../config.js';
import type { ContentLanguage } from '../types.js';

const CYRILLIC_RE = /[\u0400-\u04FF]/g;
const LATIN_RE = /[A-Za-z]/g;

export interface LanguageAssessment {
  language: ContentLanguage;
  cyrillicRatio: number;
  latinRatio: number;
  isRussianLikely: boolean;
  isForeignLikely: boolean;
}

export function assessLanguage(text: string): LanguageAssessment {
  const letters = text.replace(/[^A-Za-z\u0400-\u04FF]/g, '');
  if (letters.length === 0) {
    return {
      language: 'unknown',
      cyrillicRatio: 0,
      latinRatio: 0,
      isRussianLikely: false,
      isForeignLikely: false,
    };
  }

  const cyrillicCount = (text.match(CYRILLIC_RE) ?? []).length;
  const latinCount = (text.match(LATIN_RE) ?? []).length;
  const cyrillicRatio = cyrillicCount / letters.length;
  const latinRatio = latinCount / letters.length;

  let language: ContentLanguage = 'unknown';
  if (cyrillicRatio >= 0.25) language = 'ru';
  else if (latinRatio >= 0.5) language = 'en';

  return {
    language,
    cyrillicRatio,
    latinRatio,
    isRussianLikely: cyrillicRatio >= 0.25,
    isForeignLikely: latinRatio >= 0.5 && cyrillicRatio < 0.1,
  };
}

export function isAllowedLanguage(
  assessment: LanguageAssessment,
  config: AppConfig,
): boolean {
  const allowed = config.discoveryAllowedLanguages;
  if (allowed.length === 0) return true;
  if (assessment.language === 'unknown') return !config.discoveryRejectForeignLanguage;
  return allowed.includes(assessment.language);
}

export function itemTextForLanguage(item: {
  title?: string | null;
  description?: string | null;
}): string {
  return [item.title, item.description].filter(Boolean).join('\n');
}
