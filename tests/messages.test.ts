import { describe, expect, it } from 'vitest';
import {
  FINAL_COMMANDS,
  REMOVED_COMMANDS,
  formatHelpMessage,
  formatStartMessage,
  getCommandList,
} from '../src/bot/messages.js';

describe('Bot messages HTML safety', () => {
  it('does not contain raw angle brackets in HTML start/help messages', () => {
    for (const aiEnabled of [false, true]) {
      const start = formatStartMessage(aiEnabled);
      const help = formatHelpMessage(aiEnabled);

      expect(start).toContain('<b>Manual Content Publisher Bot</b>');
      expect(start).not.toMatch(/(?<!&lt;)[<][^b/]/);
      expect(help).toContain('<b>Справка по командам</b>');
      expect(help).not.toMatch(/(?<!&lt;)[<][^b/]/);
    }
  });

  it('lists final commands only', () => {
    const list = getCommandList(true);
    for (const cmd of FINAL_COMMANDS) {
      expect(list).toContain(cmd.split(' ')[0]!);
    }
    for (const removed of REMOVED_COMMANDS) {
      expect(list).not.toContain(removed);
    }
  });
});
