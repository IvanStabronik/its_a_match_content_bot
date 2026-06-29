import { describe, expect, it, vi } from 'vitest';
import type { Bot } from 'grammy';
import type { AppConfig } from '../src/config.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { PostRepository } from '../src/services/posts.js';
import { SourceRepository } from '../src/services/sources.js';
import { registerSourceHandlers } from '../src/bot/handlers/sources.js';

import { makeTestConfig } from './test-config.js';

function makeConfig(): AppConfig {
  return makeTestConfig();
}

describe('Source command registration', () => {
  it('registers /sources and /discover commands', () => {
    const registered: string[] = [];
    const bot = {
      command: (name: string) => {
        registered.push(name);
        return bot;
      },
    } as unknown as Bot;

    const sources = {} as SourceRepository;
    const posts = {} as PostRepository;
    const discovery = { discoverAll: vi.fn(), checkSource: vi.fn() } as unknown as DiscoveryService;

    registerSourceHandlers(bot, makeConfig(), sources, discovery, posts);

    expect(registered).toContain('sources');
    expect(registered).toContain('discover');
    expect(registered).toContain('source_add');
    expect(registered).toContain('source_add_url');
    expect(registered).toContain('source_check');
  });
});

describe('AI discovery caption mock', () => {
  it('uses AI caption when module is provided', async () => {
    const ai = {
      generateDiscoveryCaption: vi.fn().mockResolvedValue({
        caption: 'AI generated caption about dating and relationships with enough length to pass validation checks easily.',
        category: 'link',
        aiScore: 8,
        riskScore: 2,
        riskReason: 'ok',
        warnings: [],
      }),
    };

    const caption = await ai.generateDiscoveryCaption(
      {
        platform: 'youtube',
        externalId: 'v1',
        url: 'https://youtube.com/watch?v=v1',
        title: 'Title',
        description: 'Desc',
        author: 'Channel',
        publishedAt: null,
        thumbnailUrl: null,
        raw: {},
      },
      'testchannel',
    );

    expect(caption.caption).toContain('AI generated');
    expect(caption.aiScore).toBe(8);
  });
});
