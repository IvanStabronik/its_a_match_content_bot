import { describe, expect, it, vi } from 'vitest';
import { AiModule } from '../src/ai/module.js';
import { moderationKeyboard } from '../src/bot/keyboards.js';
import {
  FINAL_COMMANDS,
  REMOVED_COMMANDS,
  getCommandList,
} from '../src/bot/messages.js';
import { clearSession, getSession, setSession } from '../src/bot/session.js';
import { loadConfig } from '../src/config.js';
import {
  extractLinkFromText,
  isMessageOnlyUrl,
} from '../src/services/content-filter.js';
import { buildLinkPublishText } from '../src/services/publish-content.js';
import { sendByType } from '../src/services/telegram.js';
import type { Post } from '../src/types.js';
import { openDatabase } from '../src/db/connection.js';
import { initSchema } from '../src/db/schema.js';
import { PostRepository } from '../src/services/posts.js';

describe('Manual Content Publisher — commands', () => {
  it('help lists only final commands', () => {
    const list = getCommandList(true);
    for (const cmd of FINAL_COMMANDS) {
      expect(list).toContain(cmd.split(' ')[0]!);
    }
    for (const removed of REMOVED_COMMANDS) {
      expect(list).not.toContain(removed);
    }
  });

  it('help without OpenAI omits /ai_edit', () => {
    const list = getCommandList(false);
    expect(list).not.toContain('/ai_edit');
  });
});

describe('Manual content intake helpers', () => {
  it('URL-only message becomes link without caption', () => {
    const r = extractLinkFromText('https://example.com/page');
    expect(r).toEqual({ url: 'https://example.com/page', caption: null });
  });

  it('URL with surrounding text becomes link with caption', () => {
    const r = extractLinkFromText('Смотри https://example.com/page тут');
    expect(r?.url).toBe('https://example.com/page');
    expect(r?.caption).toBeTruthy();
  });

  it('plain text is not treated as link', () => {
    expect(extractLinkFromText('Просто текст без ссылки')).toBeNull();
  });

  it('isMessageOnlyUrl still works for entity-based URLs', () => {
    expect(
      isMessageOnlyUrl('https://example.com', [
        { type: 'url', offset: 0, length: 19 },
      ]),
    ).toBe(true);
  });
});

describe('Pending caption session', () => {
  it('waiting_for_caption session can be set and cleared', () => {
    setSession(42, { type: 'waiting_for_caption', postId: 7 });
    expect(getSession(42)).toEqual({ type: 'waiting_for_caption', postId: 7 });
    clearSession(42);
    expect(getSession(42)).toEqual({ type: 'idle' });
  });
});

describe('Queue keyboard', () => {
  it('includes AI editing buttons when enabled', () => {
    const texts = moderationKeyboard(1, 0, 1, true).inline_keyboard.flat().map((b) => b.text);
    expect(texts).toContain('✨ AI-варианты');
    expect(texts).toContain('✂️ Сократить');
    expect(texts).toContain('🎭 Сделать живее');
    expect(texts).toContain('🧹 Исправить ошибки');
    expect(texts).not.toContain('🇷🇺 Адаптировать на русский');
    expect(texts).not.toContain('🧠 Сделать текст-пост');
  });

  it('hides AI buttons when disabled', () => {
    const texts = moderationKeyboard(1, 0, 1, false).inline_keyboard.flat().map((b) => b.text);
    expect(texts.some((t) => t.includes('AI'))).toBe(false);
  });
});

describe('Link publishing', () => {
  it('publishes caption + URL', () => {
    const post = {
      type: 'link',
      caption: 'Текст',
      raw_text: 'Текст',
      source_url: 'https://example.com',
    } as Post;
    expect(buildLinkPublishText(post)).toBe('Текст\n\nhttps://example.com');
  });
});

describe('Video publishing', () => {
  it('uses supports_streaming=true', async () => {
    const sendVideo = vi.fn().mockResolvedValue({ message_id: 99 });
    const api = { sendVideo } as unknown as import('grammy').Api;
    await sendByType(api, 'testchannel', {
      type: 'video',
      media_file_id: 'vid123',
      caption: 'cap',
    } as Post);
    expect(sendVideo).toHaveBeenCalledWith('@testchannel', 'vid123', {
      caption: 'cap',
      supports_streaming: true,
    });
  });
});

describe('AI editing only updates text', () => {
  it('rewriteCaption returns variants without publishing', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ variants: ['A', 'B', 'C'] }),
          },
        },
      ],
    });
    const ai = new AiModule('key', null);
    (ai as unknown as { client: { chat: { completions: { create: typeof mockCreate } } } }).client = {
      chat: { completions: { create: mockCreate } },
    };

    const variants = await ai.rewriteCaption('исходный текст');
    expect(variants).toEqual(['A', 'B', 'C']);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });
});

describe('Manual intake creates candidates', () => {
  it('text and link candidates are stored in SQLite', () => {
    const db = openDatabase(':memory:');
    initSchema(db);
    const posts = new PostRepository(db);

    const textPost = posts.create({
      type: 'text',
      raw_text: 'hello',
      caption: 'hello',
      created_by: '1',
    });
    expect(textPost.type).toBe('text');

    const linkPost = posts.create({
      type: 'link',
      source_url: 'https://example.com',
      caption: 'read this',
      created_by: '1',
    });
    expect(linkPost.type).toBe('link');
    expect(linkPost.source_url).toBe('https://example.com');

    db.close();
  });
});

describe('Config', () => {
  it('loadConfig accepts minimal env only', () => {
    const prev = { ...process.env };
    process.env.CONTENT_BOT_TOKEN = 'tok';
    process.env.ADMIN_TELEGRAM_IDS = '123';
    process.env.CHANNEL_USERNAME = 'chan';
    delete process.env.YOUTUBE_API_KEY;
    delete process.env.DISCOVERY_ENABLED;
    delete process.env.DAILY_PACK_ENABLED;

    const config = loadConfig();
    expect(config.contentBotToken).toBe('tok');
    expect(config.channelUsername).toBe('chan');
    expect('youtubeApiKey' in config).toBe(false);
    expect('discoveryEnabled' in config).toBe(false);

    process.env = prev;
  });
});

describe('Bot wiring', () => {
  it('bot index does not import discovery or daily pack schedulers', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync('src/bot/index.ts', 'utf8');
    expect(source).not.toContain('DiscoveryScheduler');
    expect(source).not.toContain('DailyPackScheduler');
    expect(source).not.toContain('DiscoveryService');
    expect(source).not.toContain('registerSourceHandlers');
    expect(source).not.toContain('registerDailyPackHandlers');
  });
});
