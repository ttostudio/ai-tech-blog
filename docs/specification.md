# AI Tech Blog — Product Specification

## 1. Overview

AI Tech Blog automatically transforms AI news collected by ttoClaw (via Slack channels `#claude-code-news` and `#sns-trendy-ai-hacks`) into structured blog articles. The system runs entirely within Docker Compose and is accessible via browser on port 3100.

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Caddy (port 3100)                     │
│                    Reverse Proxy                         │
├────────────────────┬────────────────────────────────────┤
│   /api/*           │   /*                                │
│   Backend :3000    │   Frontend :4321                    │
├────────────────────┴────────────────────────────────────┤
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │   Backend     │  │  Frontend    │  │  PostgreSQL   │  │
│  │  (Fastify)    │──│  (Astro)     │  │    16         │  │
│  │  port 3000    │  │  port 4321   │  │  port 5432    │  │
│  └──────┬───────┘  └──────────────┘  └───────┬───────┘  │
│         │                                      │         │
│         └──────────────────────────────────────┘         │
│                                                          │
│  Services:                                               │
│  - News Ingestion (cron: every 6h)                       │
│  - Article Generation (Claude API)                       │
│  - REST API (articles CRUD)                              │
└──────────────────────────────────────────────────────────┘
```

## 3. Data Models

### 3.1 News Item (raw ingested data)

```sql
CREATE TABLE news_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_channel  VARCHAR(100) NOT NULL,       -- e.g. 'claude-code-news'
    title           VARCHAR(500) NOT NULL,
    url             VARCHAR(2048),
    summary         TEXT NOT NULL,
    raw_data        JSONB NOT NULL,              -- original ttoClaw payload
    fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    content_hash    VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 for dedup
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_news_items_fetched_at ON news_items (fetched_at DESC);
CREATE INDEX idx_news_items_source ON news_items (source_channel);
```

### 3.2 Article (generated blog post)

```sql
CREATE TABLE articles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(500) NOT NULL,
    slug            VARCHAR(500) NOT NULL UNIQUE,
    content         TEXT NOT NULL,                -- Markdown
    excerpt         VARCHAR(1000) NOT NULL,
    category        VARCHAR(100) NOT NULL,        -- e.g. 'claude-code', 'ai-hacks'
    tags            TEXT[] DEFAULT '{}',
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
                    -- 'draft' | 'published' | 'archived'
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_articles_slug ON articles (slug);
CREATE INDEX idx_articles_status ON articles (status);
CREATE INDEX idx_articles_published ON articles (published_at DESC)
    WHERE status = 'published';
CREATE INDEX idx_articles_category ON articles (category);
```

### 3.3 Article Sources (links articles to news items)

```sql
CREATE TABLE article_sources (
    article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
    PRIMARY KEY (article_id, news_item_id)
);
```

## 4. API Contract

Base URL: `http://localhost:3100/api`

### 4.1 Articles API

#### List Articles
```
GET /api/articles?page=1&limit=20&status=published&category=claude-code
```

Response:
```json
{
  "data": [
    {
      "id": "uuid",
      "title": "string",
      "slug": "string",
      "excerpt": "string",
      "category": "string",
      "tags": ["string"],
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

#### Get Article by Slug
```
GET /api/articles/:slug
```

Response:
```json
{
  "data": {
    "id": "uuid",
    "title": "string",
    "slug": "string",
    "content": "markdown string",
    "excerpt": "string",
    "category": "string",
    "tags": ["string"],
    "status": "published",
    "publishedAt": "2026-03-21T00:00:00Z",
    "createdAt": "2026-03-21T00:00:00Z",
    "updatedAt": "2026-03-21T00:00:00Z",
    "sources": [
      {
        "title": "string",
        "url": "string",
        "sourceChannel": "string"
      }
    ]
  }
}
```

### 4.2 News Ingestion API

#### Trigger Ingestion (manual)
```
POST /api/ingest
```

Response:
```json
{
  "data": {
    "itemsIngested": 5,
    "itemsDeduplicated": 2,
    "articlesGenerated": 1
  }
}
```

### 4.3 Health Check
```
GET /api/health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "ingestion": "ok"
  }
}
```

### 4.4 Categories API

#### List Categories
```
GET /api/categories
```

Response:
```json
{
  "data": [
    {
      "name": "claude-code",
      "displayName": "Claude Code News",
      "articleCount": 42
    }
  ]
}
```

## 5. Service Specifications

### 5.1 News Ingestion Service

**Responsibility**: Fetch news from ttoClaw endpoint, parse, deduplicate, store.

**Flow**:
1. Call `TTOCLAW_NEWS_ENDPOINT` (GET) to fetch latest news items
2. Parse response into normalized `NewsItem` objects
3. Compute SHA-256 hash of `url + title` for deduplication
4. Insert new items (skip existing by `content_hash` UNIQUE constraint)
5. Return count of new vs duplicated items

**ttoClaw Expected Payload**:
```json
{
  "items": [
    {
      "channel": "claude-code-news",
      "title": "New Claude Code feature: ...",
      "url": "https://...",
      "summary": "Claude Code now supports...",
      "postedAt": "2026-03-21T00:00:00Z",
      "metadata": {}
    }
  ]
}
```

**Schedule**: Every 6 hours via node-cron (`0 */6 * * *`), also triggerable via `POST /api/ingest`.

### 5.2 Article Generation Service

**Responsibility**: Generate blog articles from news items using Claude API.

**Flow**:
1. Query unprocessed news items (not yet linked to any article)
2. Group by source channel / topic similarity
3. For each group, call Claude API to generate article:
   - System prompt: "You are a tech blog writer..."
   - Input: grouped news summaries
   - Output: title, slug, content (Markdown), excerpt, category, tags
4. Parse Claude response (structured JSON output)
5. Store article in DB, link to source news items
6. Set status to `published`

**Claude API Call**:
```typescript
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages: [{ role: 'user', content: prompt }],
  system: ARTICLE_SYSTEM_PROMPT,
});
```

**Rate limiting**: Max 10 articles per ingestion cycle, with 1s delay between API calls.

### 5.3 Blog Reader (Astro Frontend)

**Pages**:
- `/` — Home page with latest articles (paginated)
- `/articles/:slug` — Article detail page (Markdown rendered)
- `/category/:name` — Category-filtered article list

**Design**:
- Clean, minimal blog layout
- Dark/light mode support
- Responsive (mobile-first)
- Server-side rendered (SSR mode for dynamic content)

**Data fetching**: SSR pages call backend API at build/request time.

### 5.4 Caddy Reverse Proxy

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

## 6. Docker Compose Services

```yaml
# Project name: product-ai-tech-blog
services:
  postgres:    # PostgreSQL 16, port 5432
  backend:     # Node.js Fastify, port 3000
  frontend:    # Astro SSR, port 4321
  caddy:       # Reverse proxy, port 3100
```

All services have health checks. Backend runs DB migrations on startup.

## 7. Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for article generation |
| `TTOCLAW_NEWS_ENDPOINT` | Yes | URL to fetch ttoClaw news data |
| `PORT` | No | Caddy external port (default: 3100) |
| `NODE_ENV` | No | Environment (default: production) |
| `INGESTION_CRON` | No | Cron schedule (default: `0 */6 * * *`) |
| `LOG_LEVEL` | No | Log level (default: info) |

## 8. Category Mapping

| Slack Channel | Category Slug | Display Name |
|---|---|---|
| `#claude-code-news` | `claude-code` | Claude Code News |
| `#sns-trendy-ai-hacks` | `ai-hacks` | AI Hacks & Trends |

## 9. Error Handling

- All API errors return standard format: `{ "error": { "code": "string", "message": "string" } }`
- HTTP status codes: 400 (bad request), 404 (not found), 500 (internal error)
- Failed article generation does not block ingestion
- Failed ingestion is logged and retried on next cron cycle
- Database connection retries with exponential backoff on startup

## 10. Security Considerations

- No secrets in code — all via environment variables
- SQL injection prevention via parameterized queries (pg driver)
- Input validation on all API endpoints (Fastify JSON Schema)
- CORS restricted to same-origin
- Rate limiting on ingestion endpoint
- Content sanitization on rendered Markdown (XSS prevention)
