import type { FastifyInstance } from 'fastify';
import type { Sql, PaginatedResponse, Article, ApiResponse, ArticleWithSources } from '@ai-tech-blog/shared';

export async function articleRoutes(app: FastifyInstance): Promise<void> {
  const sql = (app as unknown as { sql: Sql }).sql;

  // List articles
  app.get('/articles', async (req, reply) => {
    const { page = '1', limit = '20', status = 'published', category } = req.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let countResult;
    let rows;

    if (category) {
      countResult = await sql`
        SELECT COUNT(*)::int as total FROM articles WHERE status = ${status} AND category = ${category}
      `;
      rows = await sql`
        SELECT id, title, slug, excerpt, category, tags, status, published_at, created_at
        FROM articles
        WHERE status = ${status} AND category = ${category}
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `;
    } else {
      countResult = await sql`
        SELECT COUNT(*)::int as total FROM articles WHERE status = ${status}
      `;
      rows = await sql`
        SELECT id, title, slug, excerpt, category, tags, status, published_at, created_at
        FROM articles
        WHERE status = ${status}
        ORDER BY published_at DESC NULLS LAST, created_at DESC
        LIMIT ${limitNum} OFFSET ${offset}
      `;
    }

    const total = countResult[0].total;

    const response: PaginatedResponse<Omit<Article, 'content' | 'updatedAt'>> = {
      data: rows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        excerpt: r.excerpt,
        category: r.category,
        tags: r.tags,
        status: r.status,
        publishedAt: r.published_at,
        createdAt: r.created_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };

    return reply.send(response);
  });

  // Get article by slug
  app.get('/articles/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const rows = await sql`
      SELECT * FROM articles WHERE slug = ${slug}
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Article not found' } });
    }

    const article = rows[0];

    const sources = await sql`
      SELECT n.title, n.url, n.source_channel
      FROM article_sources a_s
      JOIN news_items n ON n.id = a_s.news_item_id
      WHERE a_s.article_id = ${article.id}
    `;

    const response: ApiResponse<ArticleWithSources> = {
      data: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        excerpt: article.excerpt,
        category: article.category,
        tags: article.tags,
        status: article.status,
        publishedAt: article.published_at,
        createdAt: article.created_at,
        updatedAt: article.updated_at,
        sources: sources.map((s) => ({
          title: s.title,
          url: s.url,
          sourceChannel: s.source_channel,
        })),
      },
    };

    return reply.send(response);
  });
}
