import { describe, it, expect } from 'vitest';

const API_URL = process.env.TEST_API_URL ?? 'http://localhost:3100/api';

describe('GET /api/articles/:slug/related', () => {
  it('存在しない slug は 404 を返す', async () => {
    const res = await fetch(`${API_URL}/articles/nonexistent-slug-xyz/related`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('不正な slug フォーマットは 400 を返す', async () => {
    const res = await fetch(`${API_URL}/articles/${encodeURIComponent("'; DROP TABLE articles; --")}/related`);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('存在する slug で最大3件の関連記事を返す', async () => {
    const res = await fetch(`${API_URL}/articles/ai-company-os-orchestrator-architecture/related`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(3);
  });

  it('自記事は含まれない', async () => {
    const slug = 'ai-company-os-orchestrator-architecture';
    const res = await fetch(`${API_URL}/articles/${slug}/related`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const slugs = body.data.map((a: { slug: string }) => a.slug);
    expect(slugs).not.toContain(slug);
  });

  it('同カテゴリの記事が優先される', async () => {
    const res = await fetch(`${API_URL}/articles/ai-company-os-orchestrator-architecture/related`);
    expect(res.status).toBe(200);
    const body = await res.json();
    // orchestrator article is claude-code category
    // Related articles should be mostly claude-code category
    const claudeCodeCount = body.data.filter(
      (a: { category: string }) => a.category === 'claude-code'
    ).length;
    expect(claudeCodeCount).toBeGreaterThan(0);
  });

  it('レスポンスに content フィールドを含まない', async () => {
    const res = await fetch(`${API_URL}/articles/ai-company-os-orchestrator-architecture/related`);
    expect(res.status).toBe(200);
    const body = await res.json();
    if (body.data.length > 0) {
      expect(body.data[0]).not.toHaveProperty('content');
    }
  });

  it('公開記事のみが返される', async () => {
    const res = await fetch(`${API_URL}/articles/ai-company-os-orchestrator-architecture/related`);
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const article of body.data) {
      expect(article.status).toBe('published');
    }
  });
});
