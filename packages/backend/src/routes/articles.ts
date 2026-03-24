import type { FastifyInstance } from 'fastify';
import type { Sql, PaginatedResponse, Article, ApiResponse, SubmitArticleBody } from '@ai-tech-blog/shared';
import { notifySlack } from '../services/slack.js';
import { requireAuth } from '../middleware/auth.js';

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
        SELECT id, title, slug, excerpt, category, tags, author, status, published_at, created_at, thumbnail_url, thumbnail_prompt, thumbnail_status, thumbnail_error, thumbnail_generated_at
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
        SELECT id, title, slug, excerpt, category, tags, author, status, published_at, created_at, thumbnail_url, thumbnail_prompt, thumbnail_status, thumbnail_error, thumbnail_generated_at
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
        thumbnailUrl: r.thumbnail_url ?? null,
        thumbnailPrompt: r.thumbnail_prompt ?? null,
        thumbnailStatus: r.thumbnail_status ?? 'none',
        thumbnailError: r.thumbnail_error ?? null,
        thumbnailGeneratedAt: r.thumbnail_generated_at ?? null,
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
        thumbnailUrl: article.thumbnail_url ?? null,
        thumbnailPrompt: article.thumbnail_prompt ?? null,
        thumbnailStatus: article.thumbnail_status ?? 'none',
        thumbnailError: article.thumbnail_error ?? null,
        thumbnailGeneratedAt: article.thumbnail_generated_at ?? null,
      },
    };

    return reply.send(response);
  });

  // Submit a new article
  app.post('/articles', { preHandler: requireAuth }, async (req, reply) => {
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

    const status = body.status === 'draft' ? 'draft' : 'published';
    const publishedAt = status === 'published' ? new Date().toISOString() : null;

    const [article] = await sql`
      INSERT INTO articles (title, slug, content, excerpt, category, tags, author, status, published_at)
      VALUES (${body.title}, ${body.slug}, ${body.content}, ${excerpt}, ${body.category}, ${tags}, ${body.author}, ${status}, ${publishedAt})
      RETURNING *
    `;

    // Fire-and-forget Slack notification (only for published articles)
    if (status === 'published') {
      const baseUrl = process.env.PUBLIC_BASE_URL ?? 'http://localhost:3100';
      const articleUrl = `${baseUrl}/articles/${article.slug}`;
      notifySlack(article.title, articleUrl).catch(() => {});
    }

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
        thumbnailUrl: article.thumbnail_url ?? null,
        thumbnailPrompt: article.thumbnail_prompt ?? null,
        thumbnailStatus: article.thumbnail_status ?? 'none',
        thumbnailError: article.thumbnail_error ?? null,
        thumbnailGeneratedAt: article.thumbnail_generated_at ?? null,
      },
    };

    return reply.code(201).send(response);
  });

  // Update article by slug (partial update)
  app.patch('/articles/:slug', { preHandler: requireAuth }, async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const body = req.body as Record<string, unknown>;

    if (!body || Object.keys(body).length === 0) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'Request body must contain at least one field to update' },
      });
    }

    // Check article exists
    const existing = await sql`SELECT id FROM articles WHERE slug = ${slug}`;
    if (existing.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Article not found' } });
    }

    // Allow only known fields
    const allowedFields = ['title', 'content', 'excerpt', 'category', 'tags', 'status', 'published_at'] as const;
    const updates: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return reply.code(400).send({
        error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' },
      });
    }

    // If publishing, set published_at automatically
    if (updates.status === 'published' && !updates.published_at) {
      updates.published_at = new Date().toISOString();
    }

    // Use COALESCE to only update provided fields
    const [article] = await sql`
      UPDATE articles
      SET title = COALESCE(${(updates.title as string) ?? null}, title),
          content = COALESCE(${(updates.content as string) ?? null}, content),
          excerpt = COALESCE(${(updates.excerpt as string) ?? null}, excerpt),
          category = COALESCE(${(updates.category as string) ?? null}, category),
          tags = COALESCE(${(updates.tags as string[]) ?? null}, tags),
          status = COALESCE(${(updates.status as string) ?? null}, status),
          published_at = COALESCE(${(updates.published_at as string) ?? null}, published_at),
          updated_at = NOW()
      WHERE slug = ${slug}
      RETURNING *
    `;

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
        thumbnailUrl: article.thumbnail_url ?? null,
        thumbnailPrompt: article.thumbnail_prompt ?? null,
        thumbnailStatus: article.thumbnail_status ?? 'none',
        thumbnailError: article.thumbnail_error ?? null,
        thumbnailGeneratedAt: article.thumbnail_generated_at ?? null,
      },
    };

    return reply.send(response);
  });

  // Delete article by slug
  app.delete('/articles/:slug', { preHandler: requireAuth }, async (req, reply) => {
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
