import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import type { AppConfig } from '../src/config.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { DiscoveryScheduler } from '../src/services/discovery-scheduler.js';

function makeConfig(): AppConfig {
  return {
    contentBotToken: 'token',
    adminTelegramIds: [1],
    channelUsername: 'ch',
    openaiApiKey: null,
    mainBotUsername: null,
    databasePath: ':memory:',
    backupDir: '/tmp',
    timezone: 'Europe/Warsaw',
    youtubeApiKey: null,
    discoveryEnabled: true,
    discoveryIntervalMinutes: 60,
    discoveryMaxItemsPerSource: 5,
    discoveryLookbackHours: 168,
    discoveryMinScore: 0,
    discoveryAutoCreateCandidates: true,
  };
}

describe('DiscoveryScheduler overlap', () => {
  it('does not start a second run while the first is in progress', async () => {
    let resolveDiscover!: () => void;
    const discoverPromise = new Promise<void>((resolve) => {
      resolveDiscover = resolve;
    });

    const discovery = {
      discoverAll: vi.fn(() => discoverPromise.then(() => ({
        checkedSources: 0,
        newCandidates: 0,
        duplicatesSkipped: 0,
        errors: [],
        perSource: [],
      }))),
    } as unknown as DiscoveryService;

    const scheduler = new DiscoveryScheduler(discovery, makeConfig());
    const bot = { api: { sendMessage: vi.fn() } } as unknown as Bot;

    const first = scheduler.tick(bot);
    const second = scheduler.tick(bot);

    resolveDiscover();
    await Promise.all([first, second]);

    expect(discovery.discoverAll).toHaveBeenCalledTimes(1);
  });
});
