import OpenAI from 'openai';
import { logger } from '../logger.js';
import { addRiskWarning } from '../services/content-filter.js';
import { PREDEFINED_CATEGORIES, type PostCategory } from '../types.js';

const AI_TIMEOUT_MS = 30_000;

export class AiModule {
  private readonly client: OpenAI;

  constructor(apiKey: string, private readonly mainBotUsername: string | null) {
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
                'Ты редактор Telegram-канала про отношения и дейтинг. Перепиши подпись в лёгком мем-ориентированном тоне на русском. Верни JSON: {"variants": ["...", "...", "..."]} — ровно 3 варианта, каждый не длиннее 1024 символов.',
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

  async scoreContent(text: string): Promise<number> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Оцени качество контента для Telegram-канала про отношения (1-10). JSON: {"score": число}',
            },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
        }),
      'score',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { score?: number };
    return Math.min(10, Math.max(1, Math.round(parsed.score ?? 5)));
  }

  async assessRisk(text: string): Promise<{ riskScore: number; riskReason: string }> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Оцени риск контента (1-10). JSON: {"risk_score": число, "risk_reason": "кратко на русском"}',
            },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      'risk',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { risk_score?: number; risk_reason?: string };
    return {
      riskScore: Math.min(10, Math.max(1, Math.round(parsed.risk_score ?? 1))),
      riskReason: parsed.risk_reason ?? 'Без объяснения',
    };
  }

  async classify(text: string): Promise<PostCategory> {
    const categories = PREDEFINED_CATEGORIES.join(', ');
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Классифицируй контент. Верни JSON: {"category": "slug"} — slug из списка: ${categories}`,
            },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
      'classify',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { category?: string };
    const slug = parsed.category ?? 'dating_meme';
    if ((PREDEFINED_CATEGORIES as readonly string[]).includes(slug)) {
      return slug as PostCategory;
    }
    return 'dating_meme';
  }

  async generatePoll(text: string): Promise<{ question: string; options: string[] }> {
    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'Создай Telegram-опрос на русском. Вопрос до 255 символов, 2-10 вариантов. JSON: {"question": "...", "options": ["...", "..."]}',
            },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      'poll',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { question?: string; options?: string[] };
    const options = (parsed.options ?? []).slice(0, 10);
    if (options.length < 2) throw new Error('AI вернул недостаточно вариантов для опроса');
    return {
      question: (parsed.question ?? 'Ваше мнение?').slice(0, 255),
      options: options.map((o) => o.slice(0, 100)),
    };
  }

  async generateCta(): Promise<string> {
    const botHint = this.mainBotUsername
      ? `Упомяни бота @${this.mainBotUsername}.`
      : 'Призыв к действию для дейтинг-приложения.';

    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `Сгенерируй CTA на русском (до 200 символов). ${botHint} JSON: {"cta": "..."}`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.8,
        }),
      'cta',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { cta?: string };
    return (parsed.cta ?? '').slice(0, 200);
  }

  async generateDiscoveryCaption(
    item: import('../discovery/types.js').DiscoveredItem,
    channelUsername: string,
  ): Promise<{
    caption: string;
    category: PostCategory;
    aiScore: number;
    riskScore: number;
    riskReason: string;
    warnings: import('../types.js').Warning[];
  }> {
    const metadata = [
      item.title ? `Заголовок: ${item.title}` : null,
      item.description ? `Описание: ${item.description}` : null,
      item.author ? `Автор: ${item.author}` : null,
      item.url ? `URL: ${item.url}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `Ты редактор Telegram-канала @${channelUsername} про отношения, дейтинг и общение. ` +
                'Сгенерируй подпись на русском (300–700 символов): лёгкий, слегка мемный, умный тон. ' +
                'Без политики, религии, NSFW, унижения по полу. Не вставляй ссылку — пост и так будет ссылкой. ' +
                'JSON: {"caption":"...","category":"slug","ai_score":число,"risk_score":число,"risk_reason":"..."} ' +
                `category slug из: ${PREDEFINED_CATEGORIES.join(', ')}`,
            },
            { role: 'user', content: metadata || 'Без метаданных' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.7,
        }),
      'discovery_caption',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as {
      caption?: string;
      category?: string;
      ai_score?: number;
      risk_score?: number;
      risk_reason?: string;
    };

    const caption = (parsed.caption ?? '').trim().slice(0, 700);
    if (caption.length < 50) throw new Error('AI вернул слишком короткую подпись');

    const categorySlug = parsed.category ?? 'link';
    const category = (PREDEFINED_CATEGORIES as readonly string[]).includes(categorySlug)
      ? (categorySlug as PostCategory)
      : 'link';

    return {
      caption,
      category,
      aiScore: Math.min(10, Math.max(1, Math.round(parsed.ai_score ?? 6))),
      riskScore: Math.min(10, Math.max(1, Math.round(parsed.risk_score ?? 2))),
      riskReason: parsed.risk_reason ?? 'Без объяснения',
      warnings: [],
    };
  }

  async generateDiscoveryVariants(
    item: import('../discovery/types.js').DiscoveredItem,
    currentCaption: string,
    channelUsername: string,
  ): Promise<string[]> {
    const metadata = [
      item.title ? `Заголовок: ${item.title}` : null,
      item.description ? `Описание: ${item.description}` : null,
      item.author ? `Автор: ${item.author}` : null,
      `Текущая подпись: ${currentCaption}`,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `Ты редактор Telegram-канала @${channelUsername}. ` +
                'Сгенерируй 3 альтернативные подписи на русском (300–700 символов каждая) для материала про отношения. ' +
                'JSON: {"variants":["...","...","..."]}',
            },
            { role: 'user', content: metadata },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.85,
        }),
      'discovery_variants',
    );

    const content = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(content) as { variants?: string[] };
    const variants = (parsed.variants ?? []).slice(0, 3).map((v) => v.slice(0, 700));
    if (variants.length === 0) throw new Error('AI не вернул варианты');
    return variants;
  }

  async generateArticleSummary(
    item: import('../discovery/types.js').DiscoveredItem,
    channelUsername: string,
  ): Promise<{
    caption: string;
    category: PostCategory;
    aiScore: number;
    riskScore: number;
    riskReason: string;
    qualityScore: number;
    warnings: import('../types.js').Warning[];
  }> {
    const metadata = [
      item.title ? `Заголовок: ${item.title}` : null,
      item.description ? `Текст: ${item.description}` : null,
      item.url ? `Источник: ${item.url}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `Ты редактор русскоязычного Telegram-канала @${channelUsername} про отношения. ` +
                'Сделай русский пост-резюме статьи: hook, 2–4 предложения пользы, мягкий вопрос для обсуждения. ' +
                'Не выдумывай факты. Ссылку в текст не вставляй. ' +
                'JSON: {"caption":"...","category":"slug","ai_score":число,"quality_score":число,"risk_score":число,"risk_reason":"..."}',
            },
            { role: 'user', content: metadata },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.65,
        }),
      'article_summary',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as {
      caption?: string;
      category?: string;
      ai_score?: number;
      quality_score?: number;
      risk_score?: number;
      risk_reason?: string;
    };

    const caption = (parsed.caption ?? '').trim().slice(0, 900);
    const categorySlug = parsed.category ?? 'news';
    const category = (PREDEFINED_CATEGORIES as readonly string[]).includes(categorySlug)
      ? (categorySlug as PostCategory)
      : 'news';

    return {
      caption: caption.length >= 40 ? caption : buildFallbackArticle(item.title),
      category,
      aiScore: Math.min(10, Math.max(1, Math.round(parsed.ai_score ?? 6))),
      qualityScore: Math.min(10, Math.max(1, Math.round(parsed.quality_score ?? parsed.ai_score ?? 6))),
      riskScore: Math.min(10, Math.max(1, Math.round(parsed.risk_score ?? 2))),
      riskReason: parsed.risk_reason ?? 'Без объяснения',
      warnings: [],
    };
  }

  async adaptToRussian(
    post: import('../types.js').Post,
    channelUsername: string,
  ): Promise<string> {
    const context = [
      post.source_title ? `Заголовок: ${post.source_title}` : null,
      post.caption ? `Текущий текст: ${post.caption}` : null,
      post.source_url ? `Источник: ${post.source_url}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `Адаптируй контент для @${channelUsername} на русский Telegram-стиль: лёгко, умно, про отношения. ` +
                'JSON: {"caption":"..."}',
            },
            { role: 'user', content: context || 'Без контекста' },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.75,
        }),
      'adapt_ru',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { caption?: string };
    return (parsed.caption ?? post.caption ?? '').slice(0, 1024);
  }

  async convertToTextPost(
    post: import('../types.js').Post,
    channelUsername: string,
  ): Promise<string> {
    const context = [
      post.discovery_format ? `Формат: ${post.discovery_format}` : null,
      post.source_title ? `Заголовок: ${post.source_title}` : null,
      post.caption ? `Текущий текст: ${post.caption}` : null,
      post.source_url ? `Источник (только метаданные): ${post.source_url}` : null,
    ]
      .filter(Boolean)
      .join('\n');

    const response = await this.call(
      () =>
        this.client.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                `Сделай самостоятельный русский текст-пост для @${channelUsername} на основе идеи. ` +
                'Не притворяйся, что видел видео/мем. Можно упомянуть, что материал навёл на мысль. ' +
                'JSON: {"caption":"..."}',
            },
            { role: 'user', content: context },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.8,
        }),
      'text_post',
    );

    const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}') as { caption?: string };
    return (parsed.caption ?? post.caption ?? '').slice(0, 4096);
  }
}

function buildFallbackArticle(title: string | null | undefined): string {
  const t = title?.trim() || 'Интересная статья';
  return `📰 ${t}\n\nКоротко: материал про отношения и общение.\n\nЧто думаете?`;
}

export function createAiModule(
  apiKey: string | null,
  mainBotUsername: string | null,
): AiModule | null {
  if (!apiKey) return null;
  return new AiModule(apiKey, mainBotUsername);
}

export function evaluateNewPostInBackground(
  ai: AiModule | null,
  posts: import('../services/posts.js').PostRepository,
  postId: number,
  text: string,
): void {
  if (!ai || !text.trim()) return;

  void (async () => {
    try {
      const existing = posts.getById(postId);
      const [aiScore, risk, category] = await Promise.all([
        ai.scoreContent(text),
        ai.assessRisk(text),
        ai.classify(text),
      ]);

      const updates: Parameters<typeof posts.update>[1] = {
        ai_score: aiScore,
        risk_score: risk.riskScore,
        risk_reason: risk.riskReason,
        category,
      };

      if (risk.riskScore > 7) {
        updates.warnings = addRiskWarning(
          existing?.warnings ?? null,
          risk.riskScore,
          risk.riskReason,
        );
      }

      posts.update(postId, updates);
    } catch (err) {
      logger.warn('ai', 'Background evaluation skipped', {
        postId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
}
