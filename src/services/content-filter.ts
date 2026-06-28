import { FORBIDDEN_CATEGORIES, type Warning } from '../types.js';

const FORBIDDEN_KEYWORDS: Record<string, string[]> = {
  политика: ['политик', 'выбор', 'партия', 'депутат', 'президент', 'правительств'],
  религия: ['бог', 'церков', 'молитв', 'ислам', 'христ', 'религ'],
  NSFW: ['порно', 'nsfw', '18+', 'голая', 'голый', 'обнажен'],
  'разжигание ненависти': ['ненавист', 'расист', 'фашист', 'genocide'],
  'унижение мужчин': ['все мужики', 'мужики —', 'мужчины — все'],
  'унижение женщин': ['все бабы', 'бабы —', 'женщины — все', 'шлюх'],
  'чёрный юмор': ['труп', 'смерть смешн', 'каннибал'],
  'нелегальный контент': ['наркот', 'оружие куп', 'взлом'],
  'сексуальный контент': ['секс', 'оргазм', 'эрекц', 'интим'],
  'насильственный контент': ['изнасил', 'насили', 'убийств', 'избил'],
};

export function checkForbiddenContent(text: string): Warning[] {
  const lower = text.toLowerCase();
  const warnings: Warning[] = [];

  for (const category of FORBIDDEN_CATEGORIES) {
    const keywords = FORBIDDEN_KEYWORDS[category] ?? [];
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        warnings.push({
          type: 'category',
          category,
          message: `Обнаружена запрещённая категория: ${category}`,
        });
        break;
      }
    }
  }

  return warnings;
}

export function mergeWarnings(existing: string | null, newWarnings: Warning[]): string | null {
  const current: Warning[] = existing ? JSON.parse(existing) : [];
  const merged = [...current];
  for (const w of newWarnings) {
    const dup = merged.some(
      (m) => m.type === w.type && m.category === w.category && m.message === w.message,
    );
    if (!dup) merged.push(w);
  }
  return merged.length > 0 ? JSON.stringify(merged) : null;
}

export function addRiskWarning(
  existing: string | null,
  riskScore: number,
  riskReason: string,
): string {
  const warnings: Warning[] = existing ? JSON.parse(existing) : [];
  warnings.push({
    type: 'risk_score',
    risk_score: riskScore,
    message: `Risk Score: ${riskScore}/10 — ${riskReason}`,
  });
  return JSON.stringify(warnings);
}

export function isValidUrl(text: string): boolean {
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function isMessageOnlyUrl(text: string, entities?: Array<{ type: string; offset: number; length: number }>): boolean {
  const trimmed = text.trim();
  if (!entities || entities.length === 0) {
    return /^https?:\/\/\S+$/.test(trimmed);
  }
  const urlEntity = entities.find(
    (e) => (e.type === 'url' || e.type === 'text_link') && e.offset === 0 && e.length === trimmed.length,
  );
  return !!urlEntity;
}

export function truncateCaption(text: string | null | undefined, max = 200): string {
  if (!text) return '—';
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}
