import { describe, expect, it } from 'vitest';
import {
  parseScheduleInput,
  validateScheduleTime,
} from '../src/services/schedule-parser.js';

describe('schedule-parser', () => {
  const tz = 'Europe/Warsaw';

  it('parses DD.MM.YYYY HH:mm', () => {
    const date = parseScheduleInput('25.06.2026 14:30', tz);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(2026);
  });

  it('parses DD.MM HH:mm with current year', () => {
    const date = parseScheduleInput('25.12 10:00', tz);
    expect(date).not.toBeNull();
    expect(date!.getFullYear()).toBe(new Date().getFullYear());
  });

  it('rejects ISO format', () => {
    expect(parseScheduleInput('2026-06-25 14:30', tz)).toBeNull();
  });

  it('rejects past datetime', () => {
    const past = new Date(Date.now() - 60 * 60 * 1000);
    const result = validateScheduleTime(past);
    expect(result.valid).toBe(false);
  });
});
