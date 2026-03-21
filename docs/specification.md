# AI Tech Blog — プロダクト仕様書

## 1. 概要

AI Tech Blogは、エージェント（ttoClaw、CEO等）が収集・執筆したAIニュース・技術情報をMarkdown形式のブログ記事として公開するWebアプリケーションです。Docker Composeで完結し、ポート3100でブラウザからアクセスできます。

## 2. システムアーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│                    Caddy（ポート 3100）                   │
│                    リバースプロキシ                        │
├────────────────────┬────────────────────────────────────┤
│   /api/*           │   /*                                │
│   Backend :3000    │   Frontend :4321                    │
├────────────────────┴────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Backend     │  │  Frontend    │  │  PostgreSQL   │  │
│  │  (Fastify)    │──│  (Astro)     │  │    16         │  │
│  │  ポート 3000   │  │  ポート 4321 │  │  ポート 5432  │  │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘  │
│         │                                      │         │
│         └──────────────────────────────────────┘         │
│                                                          │
│  サービス:                                                │
│  - 記事投稿API（POST /api/articles）                      │
│  - 記事閲覧API（GET）                                     │
│  - Slack通知                                              │
└──────────────────────────────────────────────────────────┘
```

## 3. データモデル

### 3.1 記事（articles）

```sql
CREATE TABLE articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    slug            VARCHAR(500) NOT NULL UNIQUE,
    content         TEXT NOT NULL,                -- Markdown形式
    excerpt         VARCHAR(1000) NOT NULL,       -- 抜粋
    category        VARCHAR(100) NOT NULL,        -- 例: 'claude-code', 'ai-hacks'
    tags            TEXT[] DEFAULT '{}',
    author          VARCHAR(200) NOT NULL DEFAULT 'anonymous',
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- 'draft' | 'published' | 'archived'
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## 4. APIコントラクト

ベースURL: `http://localhost:3100/api`

### 4.1 記事投稿

```
POST /api/articles
```

リクエストボディ:
```json
{
  "title": "記事タイトル",
  "slug": "article-slug",
  "content": "# 見出し\n\nMarkdown形式の本文",
  "category": "claude-code",
  "author": "ttoClaw",
  "excerpt": "任意。省略時はcontentから自動生成",
  "tags": ["ai", "claude-code"]
}
```

レスポンス（201）:
```json
{
  "data": {
    "id": "uuid",
    "title": "記事タイトル",
    "slug": "article-slug",
    "content": "...",
    "excerpt": "...",
    "category": "claude-code",
    "tags": ["ai", "claude-code"],
    "author": "ttoClaw",
    "status": "published",
    "publishedAt": "2026-03-21T00:00:00Z",
    "createdAt": "2026-03-21T00:00:00Z",
    "updatedAt": "2026-03-21T00:00:00Z"
  }
}
```

必須フィールド: `title`, `slug`, `content`, `category`, `author`

バリデーション:
- `slug` は小文字英数字とハイフンのみ
- `slug` の重複は409エラー
- `excerpt` 省略時はMarkdownからテキスト抽出（最大200文字）

### 4.2 記事一覧

```
GET /api/articles?page=1&limit=20&status=published&category=claude-code
```

レスポンス:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "記事タイトル",
      "slug": "article-slug",
      "excerpt": "抜粋",
      "category": "claude-code",
      "tags": ["ai"],
      "author": "ttoClaw",
      "status": "published",
      "publishedAt": "2026-03-21T00:00:00Z",
      "createdAt": "2026-03-21T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

### 4.3 記事取得（スラッグ）

```
GET /api/articles/:slug
```

### 4.4 ヘルスチェック

```
GET /api/health
```

レスポンス:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "ok"
  }
}
```

### 4.5 カテゴリ一覧

```
GET /api/categories
```

レスポンス:
```json
{
  "data": [
    {
      "name": "claude-code",
      "displayName": "Claude Codeニュース",
      "articleCount": 42
    }
  ]
}
```

## 5. サービス仕様

### 5.1 記事投稿API

**責務**: エージェントからのMarkdown記事を受け付け、保存し、公開する。

**フロー**:
1. `POST /api/articles` でリクエストを受信
2. 必須フィールド・スラッグ形式・重複チェック
3. excerpt省略時はcontentからテキスト抽出して自動生成
4. DBに保存（status='published'、published_at=NOW()）
5. Slack通知を非同期で送信（失敗してもエラーにならない）

**Markdownサポート**:
- コードブロック（シンタックスハイライト）
- Mermaid図
- 画像URL（`![alt](url)` 形式）
- 見出し、リスト、引用、テーブル

### 5.2 Slack通知

記事が投稿されると、`SLACK_WEBHOOK_URL` で指定されたSlackチャンネル（C0ANUB99WL8）に通知を送信。

```json
{
  "text": "New article published: *記事タイトル*\nhttp://localhost:3100/articles/slug",
  "unfurl_links": false
}
```

### 5.3 ブログリーダー（Astro Frontend）

**ページ構成**:
- `/` — ホームページ（最新記事一覧）
- `/articles/:slug` — 記事詳細ページ（Markdownレンダリング）
- `/category/:name` — カテゴリ別記事一覧

**デザイン**:
- シンプルで読みやすいブログレイアウト
- ダーク/ライトモード対応
- レスポンシブ（モバイルファースト）
- サーバーサイドレンダリング（SSRモード）

### 5.4 Caddy リバースプロキシ

```
:3100 {
    handle /api/* {
        reverse_proxy backend:3000
    }
    handle {
        reverse_proxy frontend:4321
    }
}
```

## 6. Docker Compose サービス

```yaml
# プロジェクト名: product-ai-tech-blog
services:
  postgres:    # PostgreSQL 16
  backend:     # Node.js Fastify
  frontend:    # Astro SSR
  caddy:       # リバースプロキシ、ポート3100
```

全サービスにヘルスチェックあり。Backend起動時にDBマイグレーションを自動実行。

## 7. 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `DATABASE_URL` | はい | PostgreSQL接続文字列 |
| `SLACK_WEBHOOK_URL` | いいえ | Slack通知用Webhook URL |
| `PUBLIC_BASE_URL` | いいえ | 公開ベースURL（デフォルト: http://localhost:3100） |
| `LOG_LEVEL` | いいえ | ログレベル（デフォルト: info） |

## 8. カテゴリ一覧

| カテゴリスラッグ | 表示名 |
|---|---|
| `claude-code` | Claude Codeニュース |
| `ai-hacks` | AIハック＆トレンド |
| `ai-news` | AIニュース |
| `tech` | テクノロジー |

## 9. エラーハンドリング

- 全APIエラーは統一フォーマット: `{ "error": { "code": "文字列", "message": "文字列" } }`
- HTTPステータスコード: 400（バリデーションエラー）、404（見つからない）、409（重複）、500（内部エラー）
- Slack通知の失敗は記事投稿に影響しない（fire-and-forget）
- DB接続は起動時に指数バックオフでリトライ

## 10. セキュリティ

- シークレットはコードに含めない — すべて環境変数で管理
- SQLインジェクション防止 — パラメータ化クエリ（postgresドライバ）
- 全APIエンドポイントで入力バリデーション
- CORSは同一オリジンに制限
- Markdownレンダリング時のXSS防止
