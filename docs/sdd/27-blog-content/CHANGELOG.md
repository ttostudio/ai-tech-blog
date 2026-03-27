# CHANGELOG — SDD #27 ブログコンテンツ自動生成

## [1.0.0] - 2026-03-27

### 追加
- `packages/frontend/src/components/RelatedArticles.astro` — 関連記事セクションコンポーネント
  - `GET /api/articles/{slug}/related` を呼び出し、最大3件の関連記事を表示
  - 3列グリッド（PC）→ 2列（タブレット横）→ 1列（モバイル）のレスポンシブ対応
  - 「関連記事」見出しにグラデーション装飾（既存デザイントークン使用）
  - 関連記事0件の場合はセクション全体を非表示
- `packages/frontend/src/lib/api.ts` — `fetchRelatedArticles(slug)` 関数を追加
  - `RelatedArticle` 型インターフェースを定義
- `packages/frontend/src/pages/articles/[slug].astro` — 関連記事セクションを組み込み
  - `.content` の直後、`.article-nav` の前に `<RelatedArticles slug={article.slug} />` を追加
