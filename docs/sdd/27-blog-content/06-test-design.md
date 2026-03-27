---
issue: "#27"
version: "1.0"
author-role: QA Engineer
gate: Gate-5
status: draft
---

# テスト設計書 — AI Tech Blog #27 ブログコンテンツ拡充・関連記事機能

**最終更新**: 2026-03-27
**担当**: QA Engineer
**対象**: Issue #27（記事5本追加 / 自動記事生成パイプライン / 関連記事UI）

---

## 1. テスト方針

### 1.1 テスト戦略

| レベル | ツール | 目的 |
|--------|--------|------|
| ユニットテスト | Vitest | 関連記事ロジック・スクリプト関数の単体検証 |
| 結合テスト（実DB接続） | Vitest + 実PostgreSQL | 記事投稿・関連記事API のDB連携検証（モックのみ不可） |
| E2Eテスト | curl + Playwright / Chrome MCP | ブラウザ表示・レスポンシブ・UI動作検証 |

> **Gate 5 要件**: 結合テストは実 PostgreSQL 接続で行うこと。モックのみでは不合格。

### 1.2 テスト対象スコープ

| # | 対象 | テストレベル |
|---|------|------------|
| 1 | 記事5本の投稿・DB保存・表示 | 結合テスト + E2E |
| 2 | 自動記事生成スクリプト（`scripts/generate-article.ts`） | ユニットテスト + 結合テスト |
| 3 | 関連記事API（`GET /api/articles/:slug/related`） | ユニットテスト + 結合テスト |
| 4 | 関連記事UIコンポーネント（`[slug].astro` 関連記事セクション） | E2E（ブラウザ） |
| 5 | アイキャッチ画像の存在確認（全5記事） | 結合テスト + E2E |

### 1.3 テスト環境

```
DATABASE_URL=postgres://app:changeme@localhost:5432/ai_tech_blog
API_BASE_URL=http://localhost:3101
FRONTEND_BASE_URL=http://localhost:3100
COMFYUI_API_URL=http://localhost:8188
```

---

## 2. テストケース一覧

### 2.1 記事5本の投稿・表示確認

#### ユニットテスト（契約テスト）

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-U-101 | 各記事のスラグが正しいフォーマット（小文字英数字・ハイフン） | `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` にマッチ |
| TC-U-102 | 記事本文が1500文字以上（AC-007準拠） | `content.length >= 1500` |
| TC-U-103 | 各記事に必須フィールドが揃っている | title, slug, content, category, author が全て truthy |

**テスト対象スラグ（5件）**:
- `ai-company-os-orchestrator-architecture`
- `qmo-fullcycle-scoring-practice`
- `remotion-market-analysis-video`
- `comfyui-flux-ai-novel-illustration`
- `claude-code-multi-agent-team-operation`

#### 結合テスト（実DB接続）

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-I-101 | 5記事が DB に保存されており status=published | `COUNT(*)=5` かつ全て `status='published'` |
| TC-I-102 | 各記事が `GET /api/articles/:slug` で200を返す | レスポンス `data.slug` が一致、`data.status === 'published'` |
| TC-I-103 | `GET /api/articles` 一覧で5記事が含まれる | `data` 配列に各スラグが存在する |
| TC-I-104 | 各記事の content_length が 1500 以上 | `data[n].contentLength >= 1500` |
| TC-I-105 | 存在しないスラグで404を返す | `statusCode === 404`, `error.code === 'NOT_FOUND'` |

#### E2Eテスト（curl）

| TC-ID | テスト内容 | 確認方法 |
|-------|-----------|---------|
| TC-E-101 | 各記事のURL（`/articles/{slug}`）で200が返る | `curl -o /dev/null -w "%{http_code}" http://localhost:3100/articles/{slug}` |
| TC-E-102 | 記事一覧ページに5件の記事タイトルが表示 | Playwright: `page.locator('.article-card')` のカウント確認 |

---

### 2.2 自動記事生成パイプライン（`scripts/generate-article.ts`）

#### ユニットテスト

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-U-201 | `GITHUB_TOKEN` 未設定時に適切なエラーを throw する | `Error: GITHUB_TOKEN is required` |
| TC-U-202 | PR タイトル・本文からスラグを生成する関数が小文字英数字ハイフンのみを返す | `generateSlug('My Feature PR')` → `'my-feature-pr'` 形式 |
| TC-U-203 | 既存スラグの重複チェック関数が重複時に `true` を返す | `isDuplicate('existing-slug', ['existing-slug'])` → `true` |
| TC-U-204 | `--dry-run` フラグが有効な場合、APIへのPOSTを行わない | `fetch` が呼び出されないこと |
| TC-U-205 | GitHub PR 取得件数が 50 件以内に制限される | クエリパラメータ `per_page <= 50` |

#### 結合テスト（実DB接続）

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-I-201 | `--dry-run` 実行で Markdown が stdout に出力され DB に記事が追加されない | 終了コード 0、DB に新規記事なし |
| TC-I-202 | 同一 PR スラグで 2 回実行しても重複記事が作成されない（AC-006） | 2回目は `slug already exists` ログ、DB の記事数変化なし |
| TC-I-203 | API エラー時（サーバー停止）に適切なエラーメッセージで終了 | 終了コード 非0、エラーメッセージに原因が含まれる |
| TC-I-204 | 生成記事の Bearer Token 認証が機能する | `API_SECRET_KEY` 未設定時 401 で失敗 |

---

### 2.3 関連記事API（`GET /api/articles/:slug/related`）

#### ユニットテスト（ロジックテスト）

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-U-301 | 同カテゴリの記事を優先して関連度スコアを計算する | `category` 一致は必須、タグ一致でスコア加算 |
| TC-U-302 | 自記事が関連記事に含まれない（除外ロジック） | レスポンスの `data` に現在のスラグが含まれない |
| TC-U-303 | 最大3件のみ返却する | `data.length <= 3` |
| TC-U-304 | 関連記事が0件のとき空配列を返す | `data` が `[]` |

#### 結合テスト（実DB接続）

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-I-301 | 同カテゴリの記事が存在する場合、最大3件を返す | `statusCode === 200`, `data.length <= 3` |
| TC-I-302 | 各関連記事に必須フィールドが含まれる | `id, title, slug, excerpt, category, thumbnailUrl, publishedAt` が存在 |
| TC-I-303 | 関連記事に自記事スラグが含まれない | `data.every(a => a.slug !== currentSlug)` |
| TC-I-304 | 関連記事が存在しないスラグで空配列を返す | `statusCode === 200`, `data.length === 0` |
| TC-I-305 | 存在しないスラグで404を返す | `statusCode === 404`, `error.code === 'NOT_FOUND'` |
| TC-I-306 | クエリパフォーマンス: レスポンスタイムが 100ms 以内（NFR-002） | `Date.now()` 計測で `elapsed < 100` |

---

### 2.4 関連記事UIコンポーネント

#### E2Eテスト（Playwright / ブラウザ操作）

| TC-ID | テスト内容 | 確認方法 |
|-------|-----------|---------|
| TC-E-201 | 記事詳細ページに「関連記事」セクションが表示される | `page.locator('section.related-articles-section h2')` のテキストが「関連記事」 |
| TC-E-202 | PC幅（1280px）で3カラム表示 | グリッドコンテナの CSS `grid-template-columns` が `3` カラム、カード数=3 |
| TC-E-203 | タブレット横（900px）で2カラム表示 | viewport 900px に変更後、CSS `grid-template-columns` が `2` カラム |
| TC-E-204 | スマホ（375px）で1カラム表示 | viewport 375px に変更後、カードが縦並び |
| TC-E-205 | 関連記事カードのクリックで記事詳細ページへ遷移 | カードリンクをクリック後、URL が `/articles/{slug}` に変わる |
| TC-E-206 | 関連記事が0件のスラグでセクションが非表示（AC-004） | `page.locator('.related-articles-section')` が存在しない |
| TC-E-207 | ダークテーム（デフォルト）で見出しグラデーションが表示される | 見出し要素に `background-clip: text` スタイルが適用されている |
| TC-E-208 | 各カードにタイトル・アイキャッチ（またはグラデーション）・カテゴリが表示（AC-010） | `.article-card` 内に `.card-title`, `.card-category` が存在 |

---

### 2.5 アイキャッチ画像の存在確認（全5記事）

#### 結合テスト（実DB接続）

| TC-ID | テスト内容 | 期待結果 |
|-------|-----------|---------|
| TC-I-501 | 5記事全ての `thumbnail_status` が `'completed'` | `thumbnail_status = 'completed'` |
| TC-I-502 | 5記事全ての `thumbnail_url` が NULL でない | `thumbnail_url IS NOT NULL` |
| TC-I-503 | `thumbnail_url` のパスが `/thumbnails/` で始まる | `thumbnail_url LIKE '/thumbnails/%'` |
| TC-I-504 | 各アイキャッチ画像ファイルがサーバー上に存在する | `GET /thumbnails/{filename}` が 200 を返す |
| TC-I-505 | アイキャッチ画像のサイズが 1024×576px（AC-008） | curl で画像取得後、`file` コマンドまたは `sips -g pixelHeight,pixelWidth` で確認 |

#### E2Eテスト（ブラウザ）

| TC-ID | テスト内容 | 確認方法 |
|-------|-----------|---------|
| TC-E-501 | 記事一覧ページで5記事のアイキャッチ画像が表示される | `page.locator('.article-card img')` が5件以上存在、`src` が空でない |
| TC-E-502 | 記事詳細ページのアイキャッチ画像が正常に読み込まれる | `page.locator('.article-eyecatch img')` の `naturalWidth > 0` |
| TC-E-503 | アイキャッチ画像に alt テキストが設定されている（NFR-007・AC-007） | `page.locator('img[alt]')` が存在、`alt` が空でない |

---

## 3. テスト実装計画

### 3.1 ユニットテスト

**ファイル**: `packages/backend/test/routes/related-articles.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('関連記事ロジック', () => {
  describe('フィルタリング', () => {
    it('TC-U-302: 自記事を関連記事から除外する', () => { ... });
    it('TC-U-303: 最大3件のみ返却する', () => { ... });
    it('TC-U-304: 関連記事が0件のとき空配列を返す', () => { ... });
  });

  describe('スコアリング', () => {
    it('TC-U-301: 同カテゴリを優先してスコアリングする', () => { ... });
  });
});
```

**ファイル**: `packages/backend/test/scripts/generate-article.test.ts`

```typescript
import { describe, it, expect, vi } from 'vitest';

describe('generate-article スクリプト', () => {
  it('TC-U-201: GITHUB_TOKEN 未設定時にエラーを throw する', () => { ... });
  it('TC-U-202: PR タイトルから有効なスラグを生成する', () => { ... });
  it('TC-U-203: 重複スラグを検出する', () => { ... });
  it('TC-U-204: --dry-run フラグで API への POST を行わない', () => { ... });
  it('TC-U-205: GitHub PR 取得件数が 50 件以内に制限される', () => { ... });
});
```

### 3.2 結合テスト（実DB接続）

**ファイル**: `packages/backend/test/routes/related-articles-integration.test.ts`

```typescript
// ============================================================
// 結合テスト — 実PostgreSQL接続必須（モックのみでは Gate 5 不合格）
// ============================================================

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://app:changeme@localhost:5432/ai_tech_blog';

beforeAll(async () => {
  dbAvailable = await checkDbConnection();
  if (dbAvailable) {
    sql = createDb(DATABASE_URL);
    await migrate(sql);
    app = buildApp(sql);
    await app.ready();
  }
});

describe('GET /api/articles/:slug/related (実DB)', () => {
  it.skipIf(!dbAvailable)('TC-I-301: 同カテゴリ記事を最大3件返す', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-302: 必須フィールドを含む', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-303: 自記事を除外する', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-304: 関連記事なしで空配列を返す', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-305: 存在しないスラグで404', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-306: レスポンスタイム 100ms 以内', async () => { ... });
});

describe('記事5本の DB 保存確認', () => {
  it.skipIf(!dbAvailable)('TC-I-101: 5記事が published 状態で存在する', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-104: 各記事の本文が 1500 文字以上', async () => { ... });
});

describe('アイキャッチ画像の確認 (実DB)', () => {
  it.skipIf(!dbAvailable)('TC-I-501: 全5記事のサムネイルが completed', async () => { ... });
  it.skipIf(!dbAvailable)('TC-I-502: thumbnail_url が NULL でない', async () => { ... });
});
```

### 3.3 E2Eテスト（Playwright）

**ファイル**: `packages/frontend/e2e/related-articles.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('関連記事セクション', () => {
  test('TC-E-201: 「関連記事」見出しが表示される', async ({ page }) => {
    await page.goto('/articles/ai-company-os-orchestrator-architecture');
    await expect(page.locator('section.related-articles-section h2')).toHaveText('関連記事');
  });

  test('TC-E-202: PC幅で3カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/articles/ai-company-os-orchestrator-architecture');
    const grid = page.locator('.related-articles-grid');
    const columns = await grid.evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(3);
  });

  test('TC-E-203: タブレット横（900px）で2カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 600 });
    // ...
  });

  test('TC-E-204: スマホ（375px）で1カラム表示', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    // ...
  });

  test('TC-E-205: 関連記事カードクリックで遷移', async ({ page }) => {
    await page.goto('/articles/ai-company-os-orchestrator-architecture');
    const firstCard = page.locator('.related-articles-section .article-card a').first();
    await firstCard.click();
    expect(page.url()).toMatch(/\/articles\/.+/);
  });

  test('TC-E-206: 関連記事0件でセクション非表示', async ({ page }) => {
    // 関連記事のない記事スラグを使用（テスト用に孤立記事を利用）
    await page.goto('/articles/test-no-related');
    await expect(page.locator('.related-articles-section')).not.toBeVisible();
  });
});

test.describe('アイキャッチ画像', () => {
  const slugs = [
    'ai-company-os-orchestrator-architecture',
    'qmo-fullcycle-scoring-practice',
    'remotion-market-analysis-video',
    'comfyui-flux-ai-novel-illustration',
    'claude-code-multi-agent-team-operation',
  ];

  for (const slug of slugs) {
    test(`TC-E-501/502: ${slug} のアイキャッチ画像が表示される`, async ({ page }) => {
      await page.goto(`/articles/${slug}`);
      const img = page.locator('img[alt]').first();
      const naturalWidth = await img.evaluate((el: HTMLImageElement) => el.naturalWidth);
      expect(naturalWidth).toBeGreaterThan(0);
    });
  }
});
```

---

## 4. テスト実行手順

### 4.1 前提条件確認

```bash
# PostgreSQL が起動していること
pg_isready -h localhost -p 5432

# バックエンドサーバーが起動していること
curl -s http://localhost:3101/api/health | jq .

# フロントエンドが起動していること
curl -o /dev/null -w "%{http_code}" http://localhost:3100/
```

### 4.2 ユニットテスト実行

```bash
cd /Users/tto/.ttoClaw/workspace/products/ai-tech-blog/packages/backend
npx vitest run --reporter=verbose
```

**期待結果**: 全テスト PASS（skip は理由を明記した `it.skipIf()` のみ）

### 4.3 結合テスト実行（実DB接続）

```bash
cd /Users/tto/.ttoClaw/workspace/products/ai-tech-blog/packages/backend
DATABASE_URL=postgres://app:changeme@localhost:5432/ai_tech_blog \
  npx vitest run test/routes/related-articles-integration.test.ts --reporter=verbose
```

### 4.4 E2Eテスト実行（Playwright）

```bash
cd /Users/tto/.ttoClaw/workspace/products/ai-tech-blog
npx playwright test packages/frontend/e2e/related-articles.spec.ts --headed
```

### 4.5 記事5本の curl 確認

```bash
for slug in \
  "ai-company-os-orchestrator-architecture" \
  "qmo-fullcycle-scoring-practice" \
  "remotion-market-analysis-video" \
  "comfyui-flux-ai-novel-illustration" \
  "claude-code-multi-agent-team-operation"; do
  status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/articles/$slug)
  echo "$slug: $status"
done
```

**期待結果**: 全スラグで `200` が返る

### 4.6 アイキャッチ画像の寸法確認

```bash
# DBからサムネイルURL取得
PGPASSWORD=changeme psql -h localhost -U app -d ai_tech_blog -c \
  "SELECT slug, thumbnail_url, thumbnail_status FROM articles WHERE slug IN (
    'ai-company-os-orchestrator-architecture',
    'qmo-fullcycle-scoring-practice',
    'remotion-market-analysis-video',
    'comfyui-flux-ai-novel-illustration',
    'claude-code-multi-agent-team-operation'
  );"

# 画像ファイルの寸法確認（ローカルファイルの場合）
sips -g pixelHeight,pixelWidth /path/to/thumbnails/*.png
```

---

## 5. スキップ基準（CR-Q04 準拠）

以下のテストは環境依存のため `it.skipIf()` を使用する。理由は必ずコメントに明記する。

| テストID | スキップ条件 | 理由 |
|---------|------------|------|
| TC-I-* (結合テスト全般) | `!dbAvailable` | PostgreSQL が起動していない環境（CI の一部）では実行不可 |
| TC-I-201〜204 (generate-article) | `!dbAvailable \|\| !process.env.GITHUB_TOKEN` | GitHub Token が必要。テスト環境に存在しない場合はスキップ |
| TC-I-504, TC-I-505 (画像ファイル確認) | ComfyUI が停止中 | 画像生成にComfyUIが必要。停止中は手動確認に切り替え |
| TC-E-* (E2E全般) | フロントエンドサーバー未起動 | ブラウザテストはサーバー稼働が前提 |

---

## 6. バグレポートテンプレート

```markdown
## バグ報告

**TC-ID**: TC-X-XXX
**テスト日時**: YYYY-MM-DD HH:MM
**環境**: localhost / Docker Compose

**現象**:
（実際に起きたこと）

**期待値**:
（テスト設計書に記載の期待結果）

**再現手順**:
1. ...
2. ...

**ログ / スクリーンショット**:
（添付）

**影響範囲**: 高 / 中 / 低
```

---

## 7. Gate 5 チェックリスト

- [ ] ユニットテスト全件 PASS（skip は理由明記済み）
- [ ] 結合テスト（実DB接続）が実装・通過していること（モックのみ不可）
- [ ] E2Eテスト（ブラウザ操作）が実装・通過していること
- [ ] 記事5本が `published` 状態で DB に存在する
- [ ] 全5記事のアイキャッチ画像が `completed` ステータスで設定済み
- [ ] 関連記事APIが 100ms 以内に応答する（NFR-002）
- [ ] 関連記事セクションがレスポンシブに表示される（PC/タブレット/スマホ）
- [ ] 画像 alt テキストが全記事で設定されている（NFR-007）
- [ ] skip テストには `it.skipIf()` + 理由コメントを明記（CR-Q04）
- [ ] バグ発見時はバグレポートを作成し team lead に報告済み

---

## 8. 受入基準との対応表

| AC-ID | 受入基準 | テストケース |
|-------|---------|------------|
| AC-001 | 5記事が各URLでアクセス可能 | TC-E-101, TC-I-102 |
| AC-002 | 全5記事にアイキャッチ画像設定済み | TC-I-501〜505, TC-E-501〜503 |
| AC-003 | 関連記事セクションに同カテゴリ最大3件表示 | TC-E-201, TC-I-301〜303 |
| AC-004 | 0件の場合セクション非表示 | TC-E-206, TC-I-304 |
| AC-005 | `--dry-run` で Markdown が出力される | TC-I-201 |
| AC-006 | 重複実行で重複記事が作成されない | TC-I-202 |
| AC-007 | 記事本文が1500文字以上 | TC-U-102, TC-I-104 |
| AC-008 | アイキャッチ画像が 1024×576px | TC-I-505 |
| AC-009 | GITHUB_TOKEN 未設定時のエラーメッセージ | TC-U-201 |
| AC-010 | 関連記事カードにタイトル・アイキャッチ・カテゴリ表示 | TC-E-208 |

---

**版履歴**:
- 2026-03-27: v1.0 初版作成（QA Engineer）
