import type { AppConfig } from '../src/config.js';

/** Minimal AppConfig defaults for unit tests. */
export function makeTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    contentBotToken: 'token',
    adminTelegramIds: [1],
    channelUsername: 'testchannel',
    openaiApiKey: null,
    mainBotUsername: null,
    databasePath: ':memory:',
    backupDir: '/tmp',
    timezone: 'Europe/Warsaw',
    ...overrides,
  };
}
