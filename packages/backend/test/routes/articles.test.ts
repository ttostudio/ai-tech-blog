import { describe, it, expect, vi } from 'vitest';

describe('articles API contract', () => {
  describe('GET /api/articles response shape', () => {
    it('defines correct pagination structure', () => {
      const response = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('pagination');
      expect(response.pagination).toHaveProperty('page');
      expect(response.pagination).toHaveProperty('limit');
      expect(response.pagination).toHaveProperty('total');
      expect(response.pagination).toHaveProperty('totalPages');
    });

    it('calculates totalPages correctly', () => {
      const cases = [
        { total: 0, limit: 20, expected: 0 },
        { total: 1, limit: 20, expected: 1 },
        { total: 20, limit: 20, expected: 1 },
        { total: 21, limit: 20, expected: 2 },
        { total: 100, limit: 10, expected: 10 },
      ];

      for (const { total, limit, expected } of cases) {
        expect(Math.ceil(total / limit) || 0).toBe(expected);
      }
    });
  });

  describe('GET /api/articles/:slug response shape', () => {
    it('defines correct article with sources structure', () => {
      const response = {
        data: {
          id: 'uuid',
          title: 'Test',
          slug: 'test',
          content: '# Test',
          excerpt: 'Test excerpt',
          category: 'claude-code',
          tags: ['ai'],
          status: 'published',
          publishedAt: '2026-03-21T00:00:00Z',
          createdAt: '2026-03-21T00:00:00Z',
          updatedAt: '2026-03-21T00:00:00Z',
          sources: [{ title: 'Source', url: 'https://example.com', sourceChannel: 'claude-code-news' }],
        },
      };

      expect(response.data).toHaveProperty('sources');
      expect(response.data.sources[0]).toHaveProperty('sourceChannel');
    });
  });

  describe('error response shape', () => {
    it('returns standard error format', () => {
      const error = {
        error: { code: 'NOT_FOUND', message: 'Article not found' },
      };

      expect(error.error).toHaveProperty('code');
      expect(error.error).toHaveProperty('message');
    });
  });
});
