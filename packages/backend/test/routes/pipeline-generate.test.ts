import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildApp } from '../../src/app.js';

function createMockSql(defaultResult: unknown[] = []) {
  const fn = vi.fn().mockResolvedValue(defaultResult);
  const proxy = new Proxy(fn, {
    apply(_target, _thisArg, args) {
      return fn(...args);
    },
    get(_target, prop) {
      if (prop === 'json') return (v: unknown) => v;
      return undefined;
    },
  });
  return { sql: proxy as never, fn };
}

const VALID_AUTH = { Authorization: 'Bearer test-secret', 'Content-Type': 'application/json' };
const VALID_ID = '550e8400-e29b-41d4-a716-446655440000';

function makeTopic(overrides: Record<string, unknown> = {}) {
  return {
    id: VALID_ID,
    title: 'テストトピック',
    description: null,
    category: 'tech',
    tags: ['AI'],
    source_type: 'commit',
    source_repo: 'owner/repo',
    source_ref: 'sha001',
    source_url: null,
    source_data: {},
    status: 'accepted',
    article_id: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-uuid-1',
    topic_id: VALID_ID,
    author: 'AI Tech Blog',
    status: 'pending',
    article_id: null,
    error_message: null,
    prompt_tokens: null,
    completion_tokens: null,
    created_at: new Date(),
    updated_at: new Date(),
    article_slug: null,
    ...overrides,
  };
}

describe('POST /api/pipeline/topics/:id/generate', () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = 'test-secret';
  });
  afterEach(() => {
    delete process.env.API_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it('UT-301: accepted トピックから生成ジョブを作成する', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic()])            // SELECT topic
      .mockResolvedValueOnce([])                        // SELECT active jobs for topic (none)
      .mockResolvedValueOnce([{ count: 0 }])            // SELECT COUNT global concurrent jobs
      .mockResolvedValue([makeJob()]);                  // INSERT job

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({ author: 'Test Author' }),
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('topicId');
    expect(body.data).toHaveProperty('jobId');
    expect(body.data.status).toBe('pending');
  });

  it('UT-302: author 未指定時のデフォルト値 "AI Tech Blog"', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValue([makeJob()]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(202);
    // Verify INSERT was called with default author
    const insertCall = fn.mock.calls.find(
      (args) => JSON.stringify(args).includes('AI Tech Blog'),
    );
    expect(insertCall).toBeDefined();
  });

  it('UT-303: pending トピックへの generate は 409', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([makeTopic({ status: 'pending' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('accepted status');
  });

  it('UT-304: rejected トピックへの generate は 409', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([makeTopic({ status: 'rejected' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(409);
  });

  it('UT-305: 処理中ジョブが既に存在する場合 409', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic()])
      .mockResolvedValue([{ id: 'existing-job' }]); // active job exists

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('already in progress');
  });

  it('UT-306: 存在しない UUID（404）', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/00000000-0000-0000-0000-000000000000/generate',
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Topic not found');
  });

  it('UT-307: id が UUID 形式でない（400）', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/not-a-uuid/generate',
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Invalid topic ID format');
  });

  it('UT-309: 同時生成ジョブが5件の場合 429', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic()])    // SELECT topic
      .mockResolvedValueOnce([])               // SELECT active jobs for topic (none)
      .mockResolvedValueOnce([{ count: 5 }]);  // SELECT COUNT global concurrent jobs

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(429);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Maximum 5 allowed');
  });

  it('UT-310: 202 レスポンスに createdAt が含まれる', async () => {
    const createdAt = new Date('2026-01-15T00:00:00Z');
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic()])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValue([makeJob({ created_at: createdAt })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(202);
    const body = JSON.parse(res.body);
    expect(body.data).toHaveProperty('createdAt');
  });

  it('UT-308: 認証ヘッダーなしで 401', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: `/api/pipeline/topics/${VALID_ID}/generate`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('GET /api/pipeline/topics/:id/job', () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = 'test-secret';
  });
  afterEach(() => {
    delete process.env.API_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it('UT-311: pending ジョブのステータスを返す', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([makeJob({ status: 'pending' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: `/api/pipeline/topics/${VALID_ID}/job`,
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('pending');
    expect(body.data).toHaveProperty('topicId');
    expect(body.data).toHaveProperty('id');
  });

  it('UT-312: completed ジョブが articleSlug を含む', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([makeJob({
      status: 'completed',
      article_id: 'article-uuid',
      article_slug: 'my-article-slug',
    })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: `/api/pipeline/topics/${VALID_ID}/job`,
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('completed');
    expect(body.data.articleSlug).toBe('my-article-slug');
  });

  it('UT-313: failed ジョブが errorMessage を含む', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([makeJob({
      status: 'failed',
      error_message: 'Claude API request timed out',
    })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: `/api/pipeline/topics/${VALID_ID}/job`,
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('failed');
    expect(body.data.errorMessage).toBe('Claude API request timed out');
  });

  it('UT-314: ジョブ未作成のトピック（404）', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: `/api/pipeline/topics/${VALID_ID}/job`,
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Job not found');
  });

  it('UT-315: 認証ヘッダーなしで 401', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: `/api/pipeline/topics/${VALID_ID}/job`,
    });

    expect(res.statusCode).toBe(401);
  });
});
