import type { DiscoverySummary } from '../discovery/types.js';

export function buildDiscoveryAdminNotification(summary: DiscoverySummary): string | null {
  if (summary.newCandidates === 0 && summary.errors.length === 0) {
    return null;
  }

  const parts: string[] = [];

  if (summary.newCandidates > 0) {
    parts.push(
      `🔎 Найдено новых кандидатов: ${summary.newCandidates}. Откройте /queue для модерации.`,
    );
  }

  if (summary.errors.length > 0) {
    const errorSummary = summary.errors.slice(0, 3).join('\n');
    parts.push(`⚠️ Ошибки при проверке источников:\n${errorSummary}`);
  }

  return parts.join('\n\n');
}
