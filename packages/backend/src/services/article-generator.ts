import Anthropic from '@anthropic-ai/sdk';
import type { Sql } from '@ai-tech-blog/shared';
import { CHANNEL_CATEGORY_MAP } from '@ai-tech-blog/shared';

const ARTICLE_SYSTEM_PROMPT = `You are a professional tech blog writer specializing in AI and developer tools.
Given a set of news items, write a well-structured blog article in Japanese.

Output ONLY valid JSON with this exact structure:
{
  "title": "Article title in Japanese",
  "slug": "url-friendly-slug-in-english",
  "content": "Full article content in Markdown format, in Japanese",
  "excerpt": "1-2 sentence summary in Japanese",
  "tags": ["tag1", "tag2"]
}

Guidelines:
- Write naturally in Japanese, suitable for a tech blog audience
- Synthesize multiple news items into a coherent article
- Include analysis and context, not just summaries
- Use proper Markdown formatting with headers, lists, and code blocks where appropriate
- The slug should be descriptive, lowercase, and use hyphens`;

interface GeneratedArticle {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  tags: string[];
}

export async function generateArticles(sql: Sql): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn('ANTHROPIC_API_KEY not set, skipping article generation');
    return 0;
  }

  const anthropic = new Anthropic({ apiKey });

  // Find unprocessed news items (not linked to any article)
  const unprocessed: Record<string, unknown>[] = await sql`
    SELECT n.*
    FROM news_items n
    LEFT JOIN article_sources a_s ON n.id = a_s.news_item_id
    WHERE a_s.article_id IS NULL
    ORDER BY n.fetched_at DESC
    LIMIT 50
  `;

  if (unprocessed.length === 0) return 0;

  // Group by source channel
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const item of unprocessed) {
    const channel = item.source_channel as string;
    if (!groups.has(channel)) groups.set(channel, []);
    groups.get(channel)!.push(item);
  }

  let articlesGenerated = 0;
  const MAX_ARTICLES = 10;

  for (const [channel, items] of groups) {
    if (articlesGenerated >= MAX_ARTICLES) break;

    const categoryInfo = CHANNEL_CATEGORY_MAP[channel] ?? { slug: channel, displayName: channel };

    // Build prompt with news items
    const newsContext = items
      .map((item, i) => `${i + 1}. **${item.title}**\n   URL: ${item.url ?? 'N/A'}\n   ${item.summary}`)
      .join('\n\n');

    const userPrompt = `以下の${items.length}件のニュース項目から、ブログ記事を1つ作成してください。\nカテゴリ: ${categoryInfo.displayName}\n\n${newsContext}`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: ARTICLE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      const parsed = parseArticleResponse(text);
      if (!parsed) continue;

      // Ensure unique slug
      const slug = await ensureUniqueSlug(sql, parsed.slug);

      // Store article
      const [article] = await sql`
        INSERT INTO articles (title, slug, content, excerpt, category, tags, status, published_at)
        VALUES (${parsed.title}, ${slug}, ${parsed.content}, ${parsed.excerpt}, ${categoryInfo.slug}, ${parsed.tags}, 'published', NOW())
        RETURNING id
      `;

      // Link sources
      for (const item of items) {
        await sql`
          INSERT INTO article_sources (article_id, news_item_id)
          VALUES (${article.id}, ${item.id})
        `;
      }

      articlesGenerated++;

      // Rate limiting: 1s delay between API calls
      if (articlesGenerated < MAX_ARTICLES) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`Failed to generate article for channel ${channel}:`, err);
    }
  }

  return articlesGenerated;
}

function parseArticleResponse(text: string): GeneratedArticle | null {
  try {
    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.title || !parsed.slug || !parsed.content || !parsed.excerpt) return null;
    return {
      title: parsed.title,
      slug: parsed.slug,
      content: parsed.content,
      excerpt: parsed.excerpt,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    };
  } catch {
    return null;
  }
}

async function ensureUniqueSlug(sql: Sql, baseSlug: string): Promise<string> {
  let slug = baseSlug;
  let counter = 1;
  while (true) {
    const existing = await sql`SELECT 1 FROM articles WHERE slug = ${slug}`;
    if (existing.length === 0) return slug;
    slug = `${baseSlug}-${++counter}`;
  }
}
