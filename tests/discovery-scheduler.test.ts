import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import type { AppConfig } from '../src/config.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { DiscoveryScheduler } from '../src/services/discovery-scheduler.js';

import { makeTestConfig } from './test-config.js';

function makeConfig(): AppConfig {
  return makeTestConfig({ discoveryIntervalMinutes: 60 });
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
        foreignConverted: 0,
        foreignRejected: 0,
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

  it('notifies admins with both new candidates and errors', async () => {
    const discovery = {
      discoverAll: vi.fn().mockResolvedValue({
        checkedSources: 2,
        newCandidates: 2,
        duplicatesSkipped: 1,
        errors: ['RSS timeout'],
        perSource: [],
      }),
    } as unknown as DiscoveryService;

    const scheduler = new DiscoveryScheduler(discovery, makeConfig());
    const sendMessage = vi.fn();
    const bot = { api: { sendMessage } } as unknown as Bot;

    await scheduler.tick(bot);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0][1] as string;
    expect(text).toContain('Найдено новых кандидатов: 2');
    expect(text).toContain('Ошибки');
    expect(text).toContain('RSS timeout');
  });

  it('does not notify when zero candidates and zero errors', async () => {
    const discovery = {
      discoverAll: vi.fn().mockResolvedValue({
        checkedSources: 1,
        newCandidates: 0,
        duplicatesSkipped: 0,
        errors: [],
        perSource: [],
      }),
    } as unknown as DiscoveryService;

    const scheduler = new DiscoveryScheduler(discovery, makeConfig());
    const sendMessage = vi.fn();
    const bot = { api: { sendMessage } } as unknown as Bot;

    await scheduler.tick(bot);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
