import { describe, expect, it } from 'vitest';
import { logger } from '../src/logger.js';

describe('logger', () => {
  it('redacts secrets in output', () => {
    const original = console.log;
    let output = '';
    console.log = (msg: string) => {
      output = msg;
    };
    logger.info('test', 'token bot123456:ABCdefghijklmnopqrstuvwxyz1234567890');
    console.log = original;
    const parsed = JSON.parse(output);
    expect(parsed.message).toContain('[REDACTED]');
    expect(parsed.message).not.toContain('ABCdefghijklmnopqrstuvwxyz');
  });
});
