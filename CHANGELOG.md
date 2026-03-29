# Changelog

## [Unreleased]

### Added
- 記事自動生成パイプライン Backend Phase 1 (#868)
  - `POST /api/pipeline/topics/extract` — GitHub commits/issues/PRs からトピック候補を自動抽出・DB保存
  - `GET /api/pipeline/topics` — トピック一覧（ページネーション・status フィルタ）
  - `PATCH /api/pipeline/topics/:id` — トピック承認/却下
  - `POST /api/pipeline/topics/:id/generate` — Claude API による非同期記事生成ジョブ（202 Accepted）
  - `GET /api/pipeline/topics/:id/job` — 生成ジョブステータスポーリング
  - DB migration 007: `article_topics` テーブル
  - DB migration 008: `article_generation_jobs` テーブル
  - 共有型: `ArticleTopic`, `ArticleGenerationJob`, `TopicStatus`, `JobStatus`

### Security
- API 認証導入: POST/PATCH/DELETE /api/articles に Bearer Token 認証を追加（環境変数 API_SECRET_KEY）
- GET /api/articles は認証不要のままパブリックアクセスを維持
- 認証なしリクエストは 401 Unauthorized を返す
- /api/pipeline/* 全エンドポイントに Bearer Token 認証を適用
