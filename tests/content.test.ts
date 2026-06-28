import { describe, expect, it } from 'vitest';
import { parsePollCommand } from '../src/bot/handlers/poll.js';
import { isMessageOnlyUrl, isValidUrl } from '../src/services/content-filter.js';

describe('poll parser', () => {
  it('accepts valid poll', () => {
    const r = parsePollCommand('Question? | A | B');
    expect(r.ok).toBe(true);
    expect(r.options).toHaveLength(2);
  });

  it('rejects single option', () => {
    const r = parsePollCommand('Question? | A');
    expect(r.ok).toBe(false);
  });
});

describe('URL detection', () => {
  it('detects URL-only message', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(
      isMessageOnlyUrl('https://example.com', [
        { type: 'url', offset: 0, length: 19 },
      ]),
    ).toBe(true);
  });
});
