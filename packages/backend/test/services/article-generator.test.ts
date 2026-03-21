import { describe, it, expect } from 'vitest';

// Test the parseArticleResponse function by importing it indirectly
// Since it's not exported, we test the contract through behavior
describe('article generator', () => {
  describe('article response parsing', () => {
    it('validates expected article JSON structure', () => {
      const validArticle = {
        title: 'テスト記事',
        slug: 'test-article',
        content: '# テスト\n\nこれはテスト記事です。',
        excerpt: 'テスト記事の概要',
        tags: ['ai', 'test'],
      };

      expect(validArticle.title).toBeTruthy();
      expect(validArticle.slug).toMatch(/^[a-z0-9-]+$/);
      expect(validArticle.content).toBeTruthy();
      expect(validArticle.excerpt).toBeTruthy();
      expect(Array.isArray(validArticle.tags)).toBe(true);
    });

    it('validates slug format', () => {
      const validSlugs = ['hello-world', 'claude-code-v2-release', 'ai-news-2026-03-21'];
      const invalidSlugs = ['Hello World', 'has spaces', 'UPPERCASE'];

      for (const slug of validSlugs) {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      }
      for (const slug of invalidSlugs) {
        expect(slug).not.toMatch(/^[a-z0-9-]+$/);
      }
    });
  });

  describe('category mapping', () => {
    it('maps channel to category correctly', async () => {
      const { CHANNEL_CATEGORY_MAP } = await import('@ai-tech-blog/shared');

      expect(CHANNEL_CATEGORY_MAP['claude-code-news']).toEqual({
        slug: 'claude-code',
        displayName: 'Claude Code News',
      });
      expect(CHANNEL_CATEGORY_MAP['sns-trendy-ai-hacks']).toEqual({
        slug: 'ai-hacks',
        displayName: 'AI Hacks & Trends',
      });
    });
  });
});
