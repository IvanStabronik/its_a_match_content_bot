import { describe, expect, it } from 'vitest';
import { buildDiscoveryAdminNotification } from '../src/services/discovery-notify.js';

describe('buildDiscoveryAdminNotification', () => {
  const base = {
    checkedSources: 1,
    duplicatesSkipped: 0,
    perSource: [],
  };

  it('returns null when no candidates and no errors', () => {
    expect(
      buildDiscoveryAdminNotification({ ...base, newCandidates: 0, errors: [] }),
    ).toBeNull();
  });

  it('includes new candidates count', () => {
    const text = buildDiscoveryAdminNotification({ ...base, newCandidates: 3, errors: [] });
    expect(text).toContain('Найдено новых кандидатов: 3');
    expect(text).toContain('/queue');
  });

  it('includes error summary when only errors', () => {
    const text = buildDiscoveryAdminNotification({
      ...base,
      newCandidates: 0,
      errors: ['RSS failed', 'YouTube timeout'],
    });
    expect(text).toContain('Ошибки');
    expect(text).toContain('RSS failed');
  });

  it('includes both new candidates and errors', () => {
    const text = buildDiscoveryAdminNotification({
      ...base,
      newCandidates: 2,
      errors: ['Source #1 failed'],
    });
    expect(text).toContain('Найдено новых кандидатов: 2');
    expect(text).toContain('Ошибки');
    expect(text).toContain('Source #1 failed');
  });
});
