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

function makeTopic(overrides: Record<string, unknown> = {}) {
  return {
    id: 'topic-uuid-1',
    title: 'テストトピック',
    description: null,
    category: 'tech',
    tags: [],
    source_type: 'commit',
    source_repo: 'owner/repo',
    source_ref: 'sha001',
    source_url: null,
    source_data: {},
    status: 'pending',
    article_id: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe('GET /api/pipeline/topics', () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = 'test-secret';
  });
  afterEach(() => {
    delete process.env.API_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it('UT-201: トピック一覧を返す', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([{ total: 3 }])
      .mockResolvedValue([makeTopic(), makeTopic({ id: 't2' }), makeTopic({ id: 't3' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: '/api/pipeline/topics',
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body).toHaveProperty('pagination');
  });

  it('UT-202: status フィルタが機能する', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([{ total: 1 }])
      .mockResolvedValue([makeTopic({ status: 'pending' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: '/api/pipeline/topics?status=pending',
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.every((t: { status: string }) => t.status === 'pending')).toBe(true);
  });

  it('UT-203: ページネーションが機能する', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([{ total: 25 }])
      .mockResolvedValue(Array.from({ length: 5 }, (_, i) => makeTopic({ id: `t${i + 21}` })));

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: '/api/pipeline/topics?page=2&limit=20',
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.pagination.page).toBe(2);
    expect(body.data.length).toBe(5);
  });

  it('UT-204: status 不正値で 400', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: '/api/pipeline/topics?status=unknown',
      headers: VALID_AUTH,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Invalid status parameter');
  });

  it('UT-205: 認証ヘッダーなしで 401', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'GET',
      url: '/api/pipeline/topics',
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('PATCH /api/pipeline/topics/:id', () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = 'test-secret';
  });
  afterEach(() => {
    delete process.env.API_SECRET_KEY;
    vi.restoreAllMocks();
  });

  const VALID_ID = '550e8400-e29b-41d4-a716-446655440000';

  it('UT-211: pending トピックを accepted に更新', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic({ id: VALID_ID, status: 'pending' })])
      .mockResolvedValue([makeTopic({ id: VALID_ID, status: 'accepted' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/pipeline/topics/${VALID_ID}`,
      headers: VALID_AUTH,
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('accepted');
    expect(body.data).toHaveProperty('id');
  });

  it('UT-212: pending トピックを rejected に更新', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([makeTopic({ id: VALID_ID, status: 'pending' })])
      .mockResolvedValue([makeTopic({ id: VALID_ID, status: 'rejected' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/pipeline/topics/${VALID_ID}`,
      headers: VALID_AUTH,
      body: JSON.stringify({ status: 'rejected' }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.status).toBe('rejected');
  });

  it('UT-213: generated トピックは更新不可（409）', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([makeTopic({ id: VALID_ID, status: 'generated' })]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/pipeline/topics/${VALID_ID}`,
      headers: VALID_AUTH,
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Cannot update a generated topic');
  });

  it('UT-214: 存在しない UUID（404）', async () => {
    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pipeline/topics/00000000-0000-0000-0000-000000000000',
      headers: VALID_AUTH,
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Topic not found');
  });

  it('UT-215: id が UUID 形式でない（400）', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/pipeline/topics/not-a-uuid',
      headers: VALID_AUTH,
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Invalid topic ID format');
  });

  it('UT-216: status が accepted/rejected 以外（400）', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/pipeline/topics/${VALID_ID}`,
      headers: VALID_AUTH,
      body: JSON.stringify({ status: 'pending' }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('status must be accepted or rejected');
  });

  it('UT-217: 認証ヘッダーなしで 401', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/pipeline/topics/${VALID_ID}`,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });

    expect(res.statusCode).toBe(401);
  });
});
