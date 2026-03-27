import { describe, it, expect } from 'vitest';

// ============================================================
// ユニットテスト — 関連記事ロジック
// Issue #27: FR-009, FR-010
// ============================================================

// 関連記事候補の型定義（実装時に routes/related.ts から import に変更）
type ArticleSummary = {
  id: number;
  slug: string;
  title: string;
  category: string;
  tags: string[];
};

/**
 * 関連記事フィルタリングのロジックをローカルで定義してテスト。
 * 実装後は実際のモジュールから import して置き換える。
 */
function filterRelatedArticles(
  currentSlug: string,
  articles: ArticleSummary[],
  maxCount: number = 3
): ArticleSummary[] {
  return articles.filter((a) => a.slug !== currentSlug).slice(0, maxCount);
}

function scoreRelatedArticles(
  current: { category: string; tags: string[] },
  candidates: ArticleSummary[]
): ArticleSummary[] {
  const scored = candidates.map((a) => {
    let score = 0;
    if (a.category === current.category) score += 10;
    const tagOverlap = a.tags.filter((t) => current.tags.includes(t)).length;
    score += tagOverlap * 3;
    return { article: a, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.article);
}

// ============================================================

describe('関連記事 — フィルタリングロジック', () => {
  const articles: ArticleSummary[] = [
    { id: 1, slug: 'article-a', title: 'A', category: 'ai-news', tags: ['ai', 'claude'] },
    { id: 2, slug: 'article-b', title: 'B', category: 'ai-news', tags: ['ai'] },
    { id: 3, slug: 'article-c', title: 'C', category: 'ai-news', tags: ['claude'] },
    { id: 4, slug: 'article-d', title: 'D', category: 'ai-news', tags: [] },
    { id: 5, slug: 'article-e', title: 'E', category: 'other', tags: ['ai'] },
  ];

  it('TC-U-302: 自記事スラグが関連記事に含まれない', () => {
    const result = filterRelatedArticles('article-a', articles);
    const slugs = result.map((a) => a.slug);
    expect(slugs).not.toContain('article-a');
  });

  it('TC-U-303: 最大3件のみ返却する', () => {
    const result = filterRelatedArticles('article-a', articles, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('TC-U-304: 候補が0件のとき空配列を返す', () => {
    const result = filterRelatedArticles('article-a', []);
    expect(result).toEqual([]);
  });

  it('TC-U-304b: 自記事のみの場合も空配列を返す', () => {
    const single = [articles[0]];
    const result = filterRelatedArticles('article-a', single);
    expect(result).toEqual([]);
  });
});

describe('関連記事 — スコアリングロジック', () => {
  const candidates: ArticleSummary[] = [
    { id: 1, slug: 'same-category-same-tags', title: 'A', category: 'ai-news', tags: ['ai', 'claude'] },
    { id: 2, slug: 'same-category-no-tags', title: 'B', category: 'ai-news', tags: [] },
    { id: 3, slug: 'different-category-same-tags', title: 'C', category: 'other', tags: ['ai', 'claude'] },
    { id: 4, slug: 'no-match', title: 'D', category: 'other', tags: [] },
  ];

  it('TC-U-301: 同カテゴリ + タグ一致が最上位スコアになる', () => {
    const current = { category: 'ai-news', tags: ['ai', 'claude'] };
    const result = scoreRelatedArticles(current, candidates);

    expect(result.length).toBeGreaterThan(0);
    // 同カテゴリ + タグ2一致（スコア10+6=16）が先頭
    expect(result[0].slug).toBe('same-category-same-tags');
  });

  it('TC-U-301b: 同カテゴリのみ（タグなし）は同カテゴリ+タグより低スコア', () => {
    const current = { category: 'ai-news', tags: ['ai', 'claude'] };
    const result = scoreRelatedArticles(current, candidates);
    const slugs = result.map((a) => a.slug);

    const topIndex = slugs.indexOf('same-category-same-tags');
    const sameOnlyIndex = slugs.indexOf('same-category-no-tags');
    if (sameOnlyIndex >= 0 && topIndex >= 0) {
      expect(topIndex).toBeLessThan(sameOnlyIndex);
    }
  });

  it('TC-U-301c: カテゴリもタグも一致しない記事はスコア0で除外される', () => {
    const current = { category: 'ai-news', tags: ['ai'] };
    const result = scoreRelatedArticles(current, candidates);
    const slugs = result.map((a) => a.slug);
    expect(slugs).not.toContain('no-match');
  });
});

describe('関連記事 — スラグバリデーション（AC-006との整合）', () => {
  it('TC-U-203: 重複スラグ検出ロジックが機能する', () => {
    const existingSlugs = ['article-a', 'article-b', 'article-c'];

    function isDuplicate(slug: string, existing: string[]): boolean {
      return existing.includes(slug);
    }

    expect(isDuplicate('article-a', existingSlugs)).toBe(true);
    expect(isDuplicate('article-z', existingSlugs)).toBe(false);
  });
});

describe('関連記事 API — レスポンス形式（契約テスト）', () => {
  it('TC-U-303c: 最大件数制約（maxCount=3）', () => {
    const many: ArticleSummary[] = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      slug: `article-${i}`,
      title: `Article ${i}`,
      category: 'ai-news',
      tags: [],
    }));

    const result = filterRelatedArticles('article-0', many, 3);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('TC-U-302b: 同スラグの記事が複数あっても自記事は全て除外', () => {
    // 防御的テスト: 重複スラグが混入しても除外される
    const withDups: ArticleSummary[] = [
      { id: 1, slug: 'current', title: 'Current', category: 'ai-news', tags: [] },
      { id: 2, slug: 'other', title: 'Other', category: 'ai-news', tags: [] },
    ];

    const result = filterRelatedArticles('current', withDups);
    expect(result.every((a) => a.slug !== 'current')).toBe(true);
  });
});
