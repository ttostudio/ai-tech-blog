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

describe('POST /api/pipeline/topics/extract', () => {
  beforeEach(() => {
    process.env.API_SECRET_KEY = 'test-secret';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    delete process.env.API_SECRET_KEY;
    vi.restoreAllMocks();
  });

  it('UT-101: GitHub活動からトピックを抽出しDBに保存する', async () => {
    // source: 'commits' で1つのアイテムのみ取得
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          sha: 'abc123',
          html_url: 'https://github.com/ttostudio/ai-company-os/commit/abc123',
          commit: { message: 'feat: add pipeline API' },
        },
      ],
    } as Response);

    const insertedTopic = {
      id: 'topic-uuid-1',
      title: 'feat: add pipeline API',
      description: null,
      category: 'tech',
      tags: [],
      source_type: 'commit',
      source_repo: 'ttostudio/ai-company-os',
      source_ref: 'abc123',
      source_url: 'https://github.com/ttostudio/ai-company-os/commit/abc123',
      source_data: {},
      status: 'pending',
      article_id: null,
      created_at: new Date(),
    };

    const { sql, fn } = createMockSql();
    fn.mockResolvedValueOnce([])          // dedup SELECT returns no existing refs
      .mockResolvedValue([insertedTopic]); // INSERT returns topic

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ source: 'commits', repos: ['ttostudio/ai-company-os'] }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.extracted).toBeGreaterThanOrEqual(1);
    expect(body.data.saved).toBeGreaterThanOrEqual(1);
  });

  it('UT-102: source="commits" でコミットのみ取得', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          sha: 'sha001',
          html_url: 'https://github.com/owner/repo/commit/sha001',
          commit: { message: 'fix: bug fix' },
        },
      ],
    } as Response);

    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([]) // dedup
      .mockResolvedValue([{
        id: 'tid1', title: 'fix: bug fix', description: null,
        category: 'tech', tags: [], source_type: 'commit',
        source_repo: 'owner/repo', source_ref: 'sha001',
        source_url: 'https://github.com/owner/repo/commit/sha001',
        source_data: {}, status: 'pending', article_id: null, created_at: new Date(),
      }]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ source: 'commits', repos: ['owner/repo'] }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.topics.every((t: { sourceType: string }) => t.sourceType === 'commit')).toBe(true);
  });

  it('UT-103: 重複 source_ref はスキップされる', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          sha: 'existing-sha',
          html_url: 'https://github.com/owner/repo/commit/existing-sha',
          commit: { message: 'existing commit' },
        },
      ],
    } as Response);

    const { sql, fn } = createMockSql([]);
    // dedup check returns existing ref
    fn.mockResolvedValue([{ source_ref: 'existing-sha' }]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ source: 'commits', repos: ['owner/repo'] }),
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.skipped).toBeGreaterThanOrEqual(1);
    expect(body.data.saved).toBe(0);
  });

  it('UT-104: since 未指定時は7日前のデフォルト値が適用される', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([]);

    const app = buildApp(sql);
    await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({}),
    });

    // fetch が呼ばれていること（since パラメータ付き）を確認
    expect(fetch).toHaveBeenCalled();
    const url = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(url).toContain('since=');
  });

  it('UT-105: repos 形式不正（owner/repo でない）', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ repos: ['invalid-repo'] }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('owner/repo format');
  });

  it('UT-106: source 不正値', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ source: 'unknown' }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Invalid source parameter');
  });

  it('UT-107: limit 範囲外（51）', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ limit: 51 }),
    });

    expect(res.statusCode).toBe(400);
  });

  it('UT-108: GitHub API タイムアウト / エラーで 502', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('fetch failed: network error'));

    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ source: 'commits', repos: ['owner/repo'] }),
    });

    expect(res.statusCode).toBe(502);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Failed to fetch GitHub activity');
  });

  it('UT-111: since が不正な ISO 8601 形式の場合 400', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ since: 'not-a-date' }),
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error.message).toContain('Invalid since parameter');
  });

  it('UT-112: since が有効な ISO 8601 の場合は通過する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValue([]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ since: '2026-01-01T00:00:00Z', source: 'commits', repos: ['owner/repo'] }),
    });

    expect(res.statusCode).toBe(200);
  });

  it('UT-109: 認証ヘッダーなしで 401', async () => {
    const { sql } = createMockSql();
    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
    });

    expect(res.statusCode).toBe(401);
  });

  it('UT-110: レスポンストピックに必須フィールドが存在する', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          sha: 'sha-111',
          html_url: 'https://github.com/owner/repo/commit/sha-111',
          commit: { message: 'test commit' },
        },
      ],
    } as Response);

    const { sql, fn } = createMockSql([]);
    fn.mockResolvedValueOnce([]) // dedup
      .mockResolvedValue([{
        id: 'topic-shape-test', title: 'test commit', description: null,
        category: 'tech', tags: [], source_type: 'commit',
        source_repo: 'owner/repo', source_ref: 'sha-111',
        source_url: 'https://github.com/owner/repo/commit/sha-111',
        source_data: {}, status: 'pending', article_id: null, created_at: new Date(),
      }]);

    const app = buildApp(sql);
    const res = await app.inject({
      method: 'POST',
      url: '/api/pipeline/topics/extract',
      headers: VALID_AUTH,
      body: JSON.stringify({ source: 'commits', repos: ['owner/repo'] }),
    });

    const body = JSON.parse(res.body);
    const topic = body.data.topics[0];
    expect(topic).toHaveProperty('id');
    expect(topic).toHaveProperty('title');
    expect(topic).toHaveProperty('category');
    expect(topic).toHaveProperty('sourceType');
    expect(topic).toHaveProperty('sourceRef');
    expect(topic).toHaveProperty('status');
  });
});
