import OpenAI from 'openai';
import { logger } from '../logger.js';

const AI_TIMEOUT_MS = 30_000;

const EDITOR_SYSTEM_PROMPT =
  'Ты редактор Telegram-канала Its A Match про отношения и дейтинг. ' +
  'Стиль: лёгкий, умный, слегка мемный, не токсичный. ' +
  'Без политики, религии, NSFW, унижения по полу. ' +
  'Не выдумывай факты и не добавляй новые утверждения.';

export class AiModule {
  private readonly client: OpenAI;

  constructor(apiKey: string, _mainBotUsername: string | null) {
    this.client = new OpenAI({ apiKey, timeout: AI_TIMEOUT_MS });
  }

  private async call<T>(fn: () => Promise<T>, operation: string): Promise<T> {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Таймаут AI (30 сек)')), AI_TIMEOUT_MS),
        ),
      ]);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error('ai', `AI ${operation} failed`, { error: msg });
      if (msg.includes('429') || msg.includes('rate')) {
        throw new Error('Лимит запросов OpenAI API');
      }
      if (msg.includes('timeout') || msg.includes('Таймаут')) {
        throw new Error('Таймаут OpenAI API');
      }
      throw new Error(`OpenAI API недоступен: ${msg}`);
    }
  }

  async rewriteCaption(caption: string): Promise<string[]> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `${EDITOR_SYSTEM_PROMPT} Перепиши подпись на русском. ` +
                'Верни JSON: {"variants": ["...", "...", "..."]} — ровно 3 варианта, каждый не длиннее 1024 символов.',
            },
            { role: 'user', content: caption || 'Без подписи' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.8,
        }),
      'rewrite',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { variants?: string[] };
    const variants = (parsed.variants ?? []).slice(0, 3).map((v) => v.slice(0, 1024));
    if (variants.length === 0) throw new Error('AI не вернул варианты');
    return variants;
  }

  async shortenCaption(caption: string): Promise<string> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `${EDITOR_SYSTEM_PROMPT} Сократи текст до лаконичной Telegram-версии. ` +
                'Сохрани смысл. JSON: {"caption":"..."}',
            },
            { role: 'user', content: caption || 'Без текста' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.5,
        }),
      'shorten',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { caption?: string };
    return (parsed.caption ?? caption).slice(0, 1024);
  }

  async makeLivelier(caption: string): Promise<string> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `${EDITOR_SYSTEM_PROMPT} Перепиши текст в более живой Telegram-стиле. ` +
                'Не добавляй новых фактов. JSON: {"caption":"..."}',
            },
            { role: 'user', content: caption || 'Без текста' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.75,
        }),
      'livelier',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { caption?: string };
    return (parsed.caption ?? caption).slice(0, 1024);
  }

  async proofreadCaption(caption: string): Promise<string> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `${EDITOR_SYSTEM_PROMPT} Исправь грамматику, опечатки и пунктуацию. ` +
                'Сохрани смысл и тон. JSON: {"caption":"..."}',
            },
            { role: 'user', content: caption || 'Без текста' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      'proofread',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { caption?: string };
    return (parsed.caption ?? caption).slice(0, 1024);
  }

  async editWithInstruction(caption: string, instruction: string): Promise<string> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `${EDITOR_SYSTEM_PROMPT} Отредактируй текст по инструкции админа. ` +
                'Не публикуй и не добавляй внешний контент. JSON: {"caption":"..."}',
            },
            {
              role: 'user',
              content: `Текст:\n${caption || 'Без текста'}\n\nИнструкция: ${instruction}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      'edit_with_instruction',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { caption?: string };
    return (parsed.caption ?? caption).slice(0, 1024);
  }
}

export function createAiModule(
  apiKey: string | null,
  mainBotUsername: string | null,
): AiModule | null {
  if (!apiKey) return null;
  return new AiModule(apiKey, mainBotUsername);
}
