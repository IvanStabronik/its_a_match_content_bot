import { describe, expect, it } from 'vitest';
import { formatHelpMessage, formatStartMessage, getCommandList } from '../src/bot/messages.js';

describe('Bot messages HTML safety', () => {
  it('does not contain raw angle brackets in HTML start/help messages', () => {
    for (const aiEnabled of [false, true]) {
      const start = formatStartMessage(aiEnabled);
      const help = formatHelpMessage(aiEnabled);

      expect(start).toContain('<b>Its a Match Content Bot</b>');
      expect(start).not.toMatch(/(?<!&lt;)[<][^b/]/);
      expect(help).toContain('<b>Справка по командам</b>');
      expect(help).not.toMatch(/(?<!&lt;)[<][^b/]/);
    }
  });

  it('includes /add usage without HTML tags in command list source', () => {
    const list = getCommandList(false);
    expect(list).toContain('/add [текст]');
    expect(list).not.toContain('<текст>');
  });
});
