import type { FastifyInstance } from 'fastify';
import type { Sql, PaginatedResponse, Article, ApiResponse, SubmitArticleBody } from '@ai-tech-blog/shared';
import { notifySlack } from '../services/slack.js';

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
        SELECT id, title, slug, excerpt, category, tags, author, status, published_at, created_at
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
        SELECT id, title, slug, excerpt, category, tags, author, status, published_at, created_at
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
        author: r.author,
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

    const response: ApiResponse<Article> = {
      data: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        excerpt: article.excerpt,
        category: article.category,
        tags: article.tags,
        author: article.author,
        status: article.status,
        publishedAt: article.published_at,
        createdAt: article.created_at,
        updatedAt: article.updated_at,
      },
    };

    return reply.send(response);
  });

  // Submit a new article
  app.post('/articles', async (req, reply) => {
    const body = req.body as SubmitArticleBody;

    // Validate required fields
    if (!body.title || !body.slug || !body.content || !body.category || !body.author) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'title, slug, content, category, and author are required' },
      });
    }

    // Validate slug format
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(body.slug) && !/^[a-z0-9]$/.test(body.slug)) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'slug must be lowercase alphanumeric with hyphens' },
      });
    }

    // Check slug uniqueness
    const existing = await sql`SELECT 1 FROM articles WHERE slug = ${body.slug}`;
    if (existing.length > 0) {
      return reply.code(409).send({
        error: { code: 'CONFLICT', message: `Article with slug "${body.slug}" already exists` },
      });
    }

    // Auto-generate excerpt from content if not provided
    const excerpt = body.excerpt ?? body.content.replace(/[#*`[\]()>_~|]/g, '').slice(0, 200).trim();
    const tags = body.tags ?? [];

    const [article] = await sql`
      INSERT INTO articles (title, slug, content, excerpt, category, tags, author, status, published_at)
      VALUES (${body.title}, ${body.slug}, ${body.content}, ${excerpt}, ${body.category}, ${tags}, ${body.author}, 'published', NOW())
      RETURNING *
    `;

    const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3100';
    const articleUrl = `${baseUrl}/articles/${article.slug}`;

    // Fire-and-forget Slack notification
    notifySlack(article.title, articleUrl).catch(() => {});

    const response: ApiResponse<Article> = {
      data: {
        id: article.id,
        title: article.title,
        slug: article.slug,
        content: article.content,
        excerpt: article.excerpt,
        category: article.category,
        tags: article.tags,
        author: article.author,
        status: article.status,
        publishedAt: article.published_at,
        createdAt: article.created_at,
        updatedAt: article.updated_at,
      },
    };

    return reply.code(201).send(response);
  });

  // Delete article by slug
  app.delete('/articles/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const rows = await sql`
      DELETE FROM articles WHERE slug = ${slug} RETURNING id
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Article not found' } });
    }

    return reply.code(204).send();
  });
}
