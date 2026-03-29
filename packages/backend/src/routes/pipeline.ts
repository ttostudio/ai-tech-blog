import type { FastifyInstance } from 'fastify';
import type { Sql, ArticleTopic, ArticleGenerationJob } from '@ai-tech-blog/shared';
import { requireAuth } from '../middleware/auth.js';
import { fetchCommits, fetchIssues, fetchPullRequests } from '../services/github.js';
import { generateArticle } from '../services/articleGenerator.js';
import { generateThumbnail } from '../services/thumbnail.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
const VALID_SOURCES = ['all', 'commits', 'issues', 'prs'] as const;
const VALID_TOPIC_STATUSES = ['pending', 'accepted', 'rejected', 'generated'] as const;
const DEFAULT_REPOS = ['ttostudio/ai-company-os'];

type SourceType = (typeof VALID_SOURCES)[number];

function detectCategory(title: string, description: string | null): string {
  const text = `${title} ${description ?? ''}`.toLowerCase();
  if (text.includes('claude') || text.includes('anthropic')) return 'claude-code';
  if (text.includes('ai') || text.includes('llm') || text.includes('gpt')) return 'ai-news';
  if (text.includes('hack') || text.includes('tip') || text.includes('trick')) return 'ai-hacks';
  return 'tech';
}

function rowToTopic(r: Record<string, unknown>): ArticleTopic {
  return {
    id: r['id'] as string,
    title: r['title'] as string,
    description: (r['description'] as string | null) ?? null,
    category: r['category'] as string,
    tags: (r['tags'] as string[]) ?? [],
    sourceType: r['source_type'] as ArticleTopic['sourceType'],
    sourceRepo: r['source_repo'] as string,
    sourceRef: (r['source_ref'] as string | null) ?? null,
    sourceUrl: (r['source_url'] as string | null) ?? null,
    sourceData: (r['source_data'] as Record<string, unknown>) ?? {},
    status: r['status'] as ArticleTopic['status'],
    articleId: (r['article_id'] as string | null) ?? null,
    createdAt: r['created_at'] as Date,
  };
}

function rowToJob(r: Record<string, unknown>): ArticleGenerationJob & { articleSlug?: string } {
  return {
    id: r['id'] as string,
    topicId: r['topic_id'] as string,
    author: r['author'] as string,
    status: r['status'] as ArticleGenerationJob['status'],
    articleId: (r['article_id'] as string | null) ?? null,
    errorMessage: (r['error_message'] as string | null) ?? null,
    promptTokens: (r['prompt_tokens'] as number | null) ?? null,
    completionTokens: (r['completion_tokens'] as number | null) ?? null,
    createdAt: r['created_at'] as Date,
    updatedAt: r['updated_at'] as Date,
    articleSlug: (r['article_slug'] as string | undefined) ?? undefined,
  };
}

export async function pipelineRoutes(app: FastifyInstance): Promise<void> {
  const sql = (app as unknown as { sql: Sql }).sql;

  // POST /api/pipeline/topics/extract
  app.post('/pipeline/topics/extract', { preHandler: requireAuth }, async (req, reply) => {
    const body = (req.body as Record<string, unknown>) ?? {};

    const source = (body['source'] as string | undefined) ?? 'all';
    if (!(VALID_SOURCES as readonly string[]).includes(source)) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid source parameter' } });
    }

    const repos = (body['repos'] as string[] | undefined) ?? DEFAULT_REPOS;
    if (!Array.isArray(repos) || repos.length === 0 || repos.length > 10) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'repos must be an array of 1-10 items' } });
    }
    for (const r of repos) {
      if (!REPO_RE.test(r)) {
        return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'repos must be in owner/repo format' } });
      }
    }

    const limitRaw = body['limit'] !== undefined ? Number(body['limit']) : 20;
    if (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > 50) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'limit must be between 1 and 50' } });
    }

    const defaultSince = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since = (body['since'] as string | undefined) ?? defaultSince;
    if (body['since'] !== undefined && isNaN(Date.parse(since))) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid since parameter: must be ISO 8601 format' } });
    }

    const shouldFetch = (s: SourceType) =>
      source === 'all' || source === s;

    try {
      const allItems = (
        await Promise.all(
          repos.flatMap((repo) => {
            const fetches = [];
            if (shouldFetch('commits'))
              fetches.push(fetchCommits({ repo, since, limit: limitRaw }));
            if (shouldFetch('issues'))
              fetches.push(fetchIssues({ repo, since, limit: limitRaw }));
            if (shouldFetch('prs'))
              fetches.push(fetchPullRequests({ repo, limit: limitRaw }));
            return fetches;
          }),
        )
      ).flat();

      const extracted = allItems.length;

      // Dedup: get existing source_refs
      const sourceRefs = allItems.map((i) => i.sourceRef).filter(Boolean);
      const existingRows = sourceRefs.length > 0
        ? await sql`SELECT source_ref FROM article_topics WHERE source_ref = ANY(${sourceRefs})`
        : [];
      const existingRefs = new Set(existingRows.map((r) => r['source_ref'] as string));

      const newItems = allItems.filter((i) => !existingRefs.has(i.sourceRef));
      const skipped = extracted - newItems.length;

      const saved: ArticleTopic[] = [];
      for (const item of newItems) {
        const category = detectCategory(item.title, item.description);
        const tags: string[] = [];
        const [row] = await sql`
          INSERT INTO article_topics (title, description, category, tags, source_type, source_repo, source_ref, source_url, source_data)
          VALUES (
            ${item.title},
            ${item.description},
            ${category},
            ${tags},
            ${item.sourceType},
            ${item.sourceRepo},
            ${item.sourceRef},
            ${item.sourceUrl},
            ${sql.json(item.sourceData as any)}
          )
          RETURNING *
        `;
        saved.push(rowToTopic(row as Record<string, unknown>));
      }

      return reply.send({
        data: {
          extracted,
          saved: saved.length,
          skipped,
          topics: saved,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('GitHub API error') || msg.includes('abort') || msg.toLowerCase().includes('fetch')) {
        return reply.code(502).send({ error: { code: 'BAD_GATEWAY', message: 'Failed to fetch GitHub activity' } });
      }
      throw err;
    }
  });

  // GET /api/pipeline/topics
  app.get('/pipeline/topics', { preHandler: requireAuth }, async (req, reply) => {
    const query = (req.query as Record<string, string>) ?? {};
    const { status, page = '1', limit = '20' } = query;

    if (status && !(VALID_TOPIC_STATUSES as readonly string[]).includes(status)) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid status parameter' } });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const statusCondition = status ? sql`WHERE status = ${status}` : sql``;

    const [countResult] = await sql`
      SELECT COUNT(*)::int as total FROM article_topics ${statusCondition}
    `;
    const rows = await sql`
      SELECT * FROM article_topics ${statusCondition}
      ORDER BY created_at DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    return reply.send({
      data: rows.map((r) => rowToTopic(r as Record<string, unknown>)),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: countResult['total'] as number,
        totalPages: Math.ceil((countResult['total'] as number) / limitNum),
      },
    });
  });

  // PATCH /api/pipeline/topics/:id
  app.patch('/pipeline/topics/:id', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid topic ID format' } });
    }

    const body = (req.body as Record<string, unknown>) ?? {};
    const newStatus = body['status'] as string | undefined;
    if (!newStatus || !['accepted', 'rejected'].includes(newStatus)) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'status must be accepted or rejected' } });
    }

    const rows = await sql`SELECT * FROM article_topics WHERE id = ${id}`;
    if (rows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Topic not found' } });
    }

    const topic = rows[0];
    if (topic['status'] === 'generated') {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Cannot update a generated topic' } });
    }

    const [updated] = await sql`
      UPDATE article_topics
      SET status = ${newStatus}
      WHERE id = ${id}
      RETURNING *
    `;

    return reply.send({ data: rowToTopic(updated as Record<string, unknown>) });
  });

  // POST /api/pipeline/topics/:id/generate
  app.post('/pipeline/topics/:id/generate', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid topic ID format' } });
    }

    const body = (req.body as Record<string, unknown>) ?? {};
    const author = typeof body['author'] === 'string' && body['author'].trim()
      ? body['author'].trim().slice(0, 200)
      : 'AI Tech Blog';

    const topicRows = await sql`SELECT * FROM article_topics WHERE id = ${id}`;
    if (topicRows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Topic not found' } });
    }

    const topic = topicRows[0];
    if (topic['status'] !== 'accepted') {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'Topic must be in accepted status to generate' } });
    }

    const activeJobs = await sql`
      SELECT id FROM article_generation_jobs
      WHERE topic_id = ${id} AND status IN ('pending', 'generating')
    `;
    if (activeJobs.length > 0) {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'A generation job is already in progress for this topic' } });
    }

    const [{ count }] = await sql`SELECT COUNT(*)::int as count FROM article_generation_jobs WHERE status IN ('pending', 'generating')`;
    if ((count as number) >= 5) {
      return reply.code(429).send({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many concurrent generation jobs. Maximum 5 allowed.' } });
    }

    const [job] = await sql`
      INSERT INTO article_generation_jobs (topic_id, author)
      VALUES (${id}, ${author})
      RETURNING id, created_at
    `;
    const jobId = job['id'] as string;

    // Async worker
    setImmediate(() => {
      runGenerationWorker(sql, jobId, id, topic as Record<string, unknown>).catch((err) => {
        app.log.error({ err, jobId }, 'Generation worker uncaught error');
      });
    });

    return reply.code(202).send({
      data: { topicId: id, jobId, status: 'pending', createdAt: job['created_at'] as Date },
    });
  });

  // GET /api/pipeline/topics/:id/job
  app.get('/pipeline/topics/:id/job', { preHandler: requireAuth }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!UUID_RE.test(id)) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid topic ID format' } });
    }

    const rows = await sql`
      SELECT j.*, a.slug AS article_slug
      FROM article_generation_jobs j
      LEFT JOIN articles a ON a.id = j.article_id
      WHERE j.topic_id = ${id}
      ORDER BY j.created_at DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Job not found for this topic' } });
    }

    const job = rowToJob(rows[0] as Record<string, unknown>);
    return reply.send({ data: job });
  });
}

async function runGenerationWorker(
  sql: Sql,
  jobId: string,
  topicId: string,
  topic: Record<string, unknown>,
): Promise<void> {
  await sql`
    UPDATE article_generation_jobs SET status = 'generating', updated_at = NOW() WHERE id = ${jobId}
  `;

  try {
    const result = await generateArticle({
      title: topic['title'] as string,
      category: topic['category'] as string,
      tags: (topic['tags'] as string[]) ?? [],
    });

    // Ensure slug uniqueness
    let slug = result.slug;
    let attempt = 1;
    while (true) {
      const existing = await sql`SELECT 1 FROM articles WHERE slug = ${slug}`;
      if (existing.length === 0) break;
      attempt++;
      if (attempt > 5) {
        slug = `${result.slug}-${Date.now().toString(36)}`;
        break;
      }
      slug = `${result.slug}-${attempt}`;
    }

    const author = (
      await sql`SELECT author FROM article_generation_jobs WHERE id = ${jobId}`
    )[0]['author'] as string;

    const [article] = await sql`
      INSERT INTO articles (title, slug, content, excerpt, category, tags, author, status)
      VALUES (
        ${result.title},
        ${slug},
        ${result.content},
        ${result.excerpt},
        ${topic['category'] as string},
        ${(topic['tags'] as string[]) ?? []},
        ${author},
        'draft'
      )
      RETURNING id, slug
    `;

    const articleId = article['id'] as string;

    // Fire-and-forget thumbnail generation
    generateThumbnail(sql, articleId, result.title, topic['category'] as string).catch(() => {});

    await sql`
      UPDATE article_generation_jobs
      SET status = 'completed',
          article_id = ${articleId},
          prompt_tokens = ${result.promptTokens},
          completion_tokens = ${result.completionTokens},
          updated_at = NOW()
      WHERE id = ${jobId}
    `;

    await sql`
      UPDATE article_topics
      SET status = 'generated', article_id = ${articleId}
      WHERE id = ${topicId}
    `;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      UPDATE article_generation_jobs
      SET status = 'failed',
          error_message = ${message},
          updated_at = NOW()
      WHERE id = ${jobId}
    `;
  }
}
