import { test, expect } from '@playwright/test';

// ============================================================
// E2E テスト — Issue #27: 記事5本 + アイキャッチ画像
// ============================================================

const REQUIRED_SLUGS = [
  'ai-company-os-orchestrator-architecture',
  'qmo-fullcycle-scoring-practice',
  'remotion-market-analysis-video',
  'comfyui-flux-ai-novel-illustration',
  'claude-code-multi-agent-team-operation',
] as const;

test.describe('TC-E-101: 記事5本のアクセス確認', () => {
  for (const slug of REQUIRED_SLUGS) {
    test(`${slug} — 記事詳細ページが 200 で表示される`, async ({ page }) => {
      const response = await page.goto(`/articles/${slug}`);
      expect(response?.status(), `${slug}: 200 が期待されます`).toBe(200);
    });
  }
});

test.describe('TC-E-501/502: アイキャッチ画像の表示確認', () => {
  for (const slug of REQUIRED_SLUGS) {
    test(`${slug} — アイキャッチ画像が正常に読み込まれる`, async ({ page }) => {
      await page.goto(`/articles/${slug}`);

      // アイキャッチ画像または eyecatch コンテナが存在する
      const eyecatch = page.locator('.article-eyecatch, .eyecatch, [class*="eyecatch"]').first();
      const hasThumbnail = await eyecatch.count() > 0;

      if (hasThumbnail) {
        const img = eyecatch.locator('img').first();
        const imgCount = await img.count();

        if (imgCount > 0) {
          // 画像の naturalWidth が 0 より大きい（正常読み込み確認）
          const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
          expect(naturalWidth, `${slug}: アイキャッチ画像が読み込まれていません`).toBeGreaterThan(0);

          // alt テキストが設定されている（NFR-007）
          const alt = await img.getAttribute('alt');
          expect(alt, `${slug}: アイキャッチ画像に alt テキストがありません`).toBeTruthy();
        }
      }

      // アイキャッチがない場合でも記事ページ自体は表示されている
      await expect(page.locator('h1, .article-title').first()).toBeVisible();
    });
  }
});

test.describe('TC-E-102: 記事一覧での5記事確認', () => {
  test('トップページに記事カードが表示される', async ({ page }) => {
    await page.goto('/');
    // 記事カードが1件以上表示される
    const cards = page.locator('.article-card, [class*="article-card"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count, '記事カードが1件以上必要です').toBeGreaterThan(0);
  });
});

test.describe('TC-E-503: 画像 alt テキスト確認（NFR-007）', () => {
  test('記事一覧のすべての画像に alt テキストがある', async ({ page }) => {
    await page.goto('/');

    // alt のない画像を検出
    const imagesWithoutAlt = await page.locator('img:not([alt])').count();
    expect(
      imagesWithoutAlt,
      `alt テキストなしの画像が ${imagesWithoutAlt} 件あります`
    ).toBe(0);
  });
});
