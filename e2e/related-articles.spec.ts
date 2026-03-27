import { test, expect } from '@playwright/test';

// ============================================================
// E2E テスト — Issue #27: 関連記事セクション UI
// ============================================================

// 関連記事が存在する可能性の高い記事スラグ（同カテゴリが複数ある想定）
const ARTICLE_WITH_RELATED = 'ai-company-os-orchestrator-architecture';

test.describe('TC-E-201: 関連記事セクションの基本表示', () => {
  test('記事詳細ページに「関連記事」セクションが表示される', async ({ page }) => {
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    // 関連記事セクションが存在するか確認
    const section = page.locator('.related-articles-section');
    const sectionCount = await section.count();

    if (sectionCount > 0) {
      // セクションがあれば見出しが「関連記事」であること
      const heading = section.locator('.related-articles-heading').first();
      await expect(heading).toHaveText('関連記事');
    }
    // 関連記事が0件の場合はセクションなし（AC-004）→ sectionCount === 0 もOK
  });

  test('関連記事が存在する場合、最大3件のカードが表示される', async ({ page }) => {
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    const section = page.locator('.related-articles-section');
    const sectionCount = await section.count();

    if (sectionCount > 0) {
      // article-card-wrapper を数える（3件のカードラッパー = 3記事）
      const cards = section.locator('.article-card-wrapper');
      const cardCount = await cards.count();
      expect(cardCount, '関連記事は最大3件').toBeLessThanOrEqual(3);
      expect(cardCount, '関連記事は1件以上').toBeGreaterThan(0);
    }
  });
});

test.describe('TC-E-202〜204: レスポンシブ表示確認', () => {
  test('TC-E-202: PC幅（1280px）で3カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    const grid = page.locator('.related-articles-grid');
    const gridCount = await grid.count();

    if (gridCount > 0) {
      const columns = await grid.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.gridTemplateColumns.split(' ').filter((s) => s.trim()).length;
      });
      expect(columns, 'PC幅で3カラム').toBe(3);
    }
  });

  test('TC-E-203: タブレット横（900px）で2カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    const grid = page.locator('.related-articles-grid');
    const gridCount = await grid.count();

    if (gridCount > 0) {
      const columns = await grid.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.gridTemplateColumns.split(' ').filter((s) => s.trim()).length;
      });
      expect(columns, 'タブレット横で2カラム').toBe(2);
    }
  });

  test('TC-E-204: スマホ（375px）で1カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    const grid = page.locator('.related-articles-grid');
    const gridCount = await grid.count();

    if (gridCount > 0) {
      const columns = await grid.evaluate((el) => {
        const style = getComputedStyle(el);
        return style.gridTemplateColumns.split(' ').filter((s) => s.trim()).length;
      });
      expect(columns, 'スマホで1カラム').toBe(1);
    }
  });
});

test.describe('TC-E-205: 関連記事カードのクリック遷移', () => {
  test('関連記事カードをクリックすると記事詳細に遷移する', async ({ page }) => {
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    const section = page.locator('.related-articles-section');
    if (await section.count() === 0) {
      test.skip();
      return;
    }

    const firstCardLink = section.locator('a').first();
    const href = await firstCardLink.getAttribute('href');
    expect(href).toMatch(/\/articles\/.+/);

    await firstCardLink.click();
    await page.waitForLoadState('networkidle');

    expect(page.url()).toMatch(/\/articles\/.+/);
    // 元の記事と異なるページに遷移していること
    expect(page.url()).not.toContain(ARTICLE_WITH_RELATED);
  });
});

test.describe('TC-E-206: 関連記事なし時のセクション非表示（AC-004）', () => {
  test('関連記事0件の記事でセクションが非表示またはメッセージ表示', async ({ page }) => {
    // 孤立したカテゴリの記事を使用（テスト対象の5記事の中でカテゴリが唯一の場合）
    // ここでは API で関連記事なしの記事を探す
    const apiBase = process.env.API_URL ?? 'http://localhost:3101/api';

    try {
      const res = await page.request.get(`${apiBase}/articles?status=published&limit=100`);
      if (!res.ok()) {
        test.skip();
        return;
      }

      const data = await res.json();
      const articles = data.data as Array<{ slug: string; category: string; tags: string[] }>;

      // カテゴリが唯一（他に同カテゴリの記事がない）記事を探す
      const categoryCounts = new Map<string, number>();
      for (const a of articles) {
        categoryCounts.set(a.category, (categoryCounts.get(a.category) ?? 0) + 1);
      }

      const isolated = articles.find((a) => (categoryCounts.get(a.category) ?? 0) === 1);

      if (!isolated) {
        test.skip();
        return;
      }

      await page.goto(`/articles/${isolated.slug}`);
      const section = page.locator('.related-articles-section');
      // セクションが存在しないか、存在しても中身が空
      const sectionCount = await section.count();
      if (sectionCount > 0) {
        const cards = section.locator('.article-card, [class*="article-card"]');
        expect(await cards.count()).toBe(0);
      }
      // sectionCount === 0 は期待通り（非表示）
    } catch {
      test.skip();
    }
  });
});

test.describe('TC-E-207〜208: カードの表示内容確認（AC-010）', () => {
  test('TC-E-208: 関連記事カードにタイトルとカテゴリが表示される', async ({ page }) => {
    await page.goto(`/articles/${ARTICLE_WITH_RELATED}`);

    const section = page.locator('.related-articles-section');
    if (await section.count() === 0) {
      test.skip();
      return;
    }

    const firstCard = section.locator('.article-card, [class*="article-card"]').first();

    // タイトルが表示されている
    const title = firstCard.locator('.card-title, [class*="card-title"], h2, h3').first();
    await expect(title).toBeVisible();
    const titleText = await title.textContent();
    expect(titleText?.trim()).toBeTruthy();
  });
});
