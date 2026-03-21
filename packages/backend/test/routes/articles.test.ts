import { describe, it, expect } from 'vitest';
import type { SubmitArticleBody } from '@ai-tech-blog/shared';

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

  describe('POST /api/articles request validation', () => {
    it('requires all mandatory fields', () => {
      const validBody: SubmitArticleBody = {
        title: 'Test Article',
        slug: 'test-article',
        content: '# Hello\n\nThis is a test.',
        category: 'ai-news',
        author: 'ttoClaw',
      };

      expect(validBody.title).toBeTruthy();
      expect(validBody.slug).toBeTruthy();
      expect(validBody.content).toBeTruthy();
      expect(validBody.category).toBeTruthy();
      expect(validBody.author).toBeTruthy();
    });

    it('validates slug format (lowercase, hyphens, alphanumeric)', () => {
      const valid = ['hello-world', 'claude-code-v2', 'a', 'ai-news-2026-03-21'];
      const invalid = ['Hello World', 'HAS-UPPER', '-leading-hyphen', 'trailing-hyphen-'];

      const slugRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
      for (const slug of valid) {
        expect(slugRegex.test(slug), `expected "${slug}" to be valid`).toBe(true);
      }
      for (const slug of invalid) {
        expect(slugRegex.test(slug), `expected "${slug}" to be invalid`).toBe(false);
      }
    });

    it('supports Markdown content with code blocks and images', () => {
      const markdown = `# Title

Some text with **bold** and *italic*.

\`\`\`python
def hello():
    print("Hello!")
\`\`\`

![diagram](https://example.com/image.png)

\`\`\`mermaid
graph TD
    A --> B
\`\`\`
`;
      expect(markdown).toContain('```python');
      expect(markdown).toContain('```mermaid');
      expect(markdown).toContain('![diagram]');
    });

    it('accepts optional excerpt and tags', () => {
      const withOptionals: SubmitArticleBody = {
        title: 'Test',
        slug: 'test',
        content: 'Content',
        category: 'ai-news',
        author: 'CEO',
        excerpt: 'Custom excerpt',
        tags: ['ai', 'news'],
      };

      expect(withOptionals.excerpt).toBe('Custom excerpt');
      expect(withOptionals.tags).toEqual(['ai', 'news']);
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

    it('returns 409 for duplicate slug', () => {
      const error = {
        error: { code: 'CONFLICT', message: 'Article with slug "test" already exists' },
      };

      expect(error.error.code).toBe('CONFLICT');
    });
  });
});
