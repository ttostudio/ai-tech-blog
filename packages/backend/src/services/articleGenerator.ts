import Anthropic from '@anthropic-ai/sdk';

const TIMEOUT_MS = 120_000;
const MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `あなたはAI・技術分野を専門とするブログライターです。
以下のルールに従い、日本語のMarkdown記事を生成してください:

- 対象読者: AI・テクノロジーに興味のある日本語話者
- 文体: 親しみやすいが専門的。体言止め避ける
- 構成: はじめに → 本文（見出し3〜5個）→ まとめ
- 文字数: 1500〜2500文字
- コードブロック: 必要なら含める（バッククォート3つ）

出力形式（厳守）:
---TITLE---
記事タイトル
---SLUG---
article-slug-in-kebab-case
---EXCERPT---
記事の要約（100〜200文字）
---CONTENT---
# 記事タイトル

本文をここに...`;

export interface ArticlePromptInput {
  title: string;
  category: string;
  tags: string[];
}

export interface ParsedArticle {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
}

export interface GenerateArticleResult extends ParsedArticle {
  promptTokens: number;
  completionTokens: number;
}

export function buildArticlePrompt(input: ArticlePromptInput): {
  system: string;
  userMessage: string;
} {
  const userMessage = `以下のトピックでブログ記事を書いてください。

トピック: ${input.title}
カテゴリ: ${input.category}
タグ: ${input.tags.join(', ')}`;

  return { system: SYSTEM_PROMPT, userMessage };
}

export function parseArticleResponse(text: string): ParsedArticle {
  const titleMatch = text.match(/---TITLE---\s*([\s\S]*?)\s*---SLUG---/);
  const slugMatch = text.match(/---SLUG---\s*([\s\S]*?)\s*---EXCERPT---/);
  const excerptMatch = text.match(/---EXCERPT---\s*([\s\S]*?)\s*---CONTENT---/);
  const contentMatch = text.match(/---CONTENT---\s*([\s\S]*)$/);

  const title = titleMatch ? titleMatch[1].trim() : text.slice(0, 100).trim();
  const rawSlug = slugMatch ? slugMatch[1].trim() : '';
  const slug = rawSlug
    ? normalizeSlug(rawSlug)
    : `auto-${Date.now().toString(36)}`;
  const content = contentMatch ? contentMatch[1].trim() : text.trim();
  const excerpt = excerptMatch
    ? excerptMatch[1].trim()
    : content.replace(/[#*`[\]()>_~|]/g, '').slice(0, 150).trim();

  return { title, slug, excerpt, content };
}

function normalizeSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export async function generateArticle(
  input: ArticlePromptInput,
  client?: Anthropic,
): Promise<GenerateArticleResult> {
  const anthropic = client ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const { system, userMessage } = buildArticlePrompt(input);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: userMessage }],
      },
      { signal: controller.signal },
    );

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    const parsed = parseArticleResponse(text);

    return {
      ...parsed,
      promptTokens: response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    };
  } finally {
    clearTimeout(timer);
  }
}
