# AI Tech Blog

Automatically generates blog articles from AI news collected by [ttoClaw](https://github.com/ttostudio/ttoClaw).

## Overview

AI Tech Blog transforms news and technical information posted by ttoClaw to Slack channels (`#claude-code-news`, `#sns-trendy-ai-hacks`) into well-structured blog articles, viewable via a web browser over Tailscale.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                 Caddy (port 3100)                    │
│                 Reverse Proxy                        │
├──────────────────┬──────────────────────────────────┤
│  /api/*          │  /*                               │
│  Backend :3000   │  Frontend :4321                   │
├──────────────────┴──────────────────────────────────┤
│                                                      │
│  Backend (Fastify)     Frontend (Astro SSR)          │
│  - News ingestion      - Article listing              │
│  - Article generation  - Article detail               │
│  - REST API            - Category pages               │
│  - Cron (6h cycle)                                    │
│                                                      │
│  PostgreSQL 16 (article & news storage)              │
└──────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Docker & Docker Compose

### Setup

```bash
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY and TTOCLAW_NEWS_ENDPOINT

docker compose up -d
```

The blog will be available at `http://localhost:3100`.

### Services

| Service    | Port | Description                              |
|------------|------|------------------------------------------|
| Caddy      | 3100 | Reverse proxy (main entry point)         |
| Backend    | 3000 | Fastify API + ingestion + article gen    |
| Frontend   | 4321 | Astro SSR blog reader                    |
| PostgreSQL | 5432 | Database                                 |

## Development

```bash
# Install dependencies
npm install

# Build shared package (required first)
npm run build --workspace=packages/shared

# Run tests
npm test

# Run linter
npm run lint

# Dev mode
npm run dev:backend
npm run dev:frontend
```

### Project Structure

```
packages/
  shared/     # Types, DB schema, migrations
  backend/    # Fastify API, ingestion, article generation
  frontend/   # Astro SSR blog reader
```

### API Endpoints

- `GET /api/health` — Health check
- `GET /api/articles` — List articles (paginated)
- `GET /api/articles/:slug` — Get article by slug
- `GET /api/categories` — List categories with counts
- `POST /api/ingest` — Trigger manual ingestion

See [docs/specification.md](docs/specification.md) for full API contracts.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key |
| `TTOCLAW_NEWS_ENDPOINT` | Yes | ttoClaw news data URL |
| `POSTGRES_PASSWORD` | No | DB password (default: changeme) |
| `INGESTION_CRON` | No | Cron schedule (default: `0 */6 * * *`) |
| `LOG_LEVEL` | No | Log level (default: info) |

## License

MIT - see [LICENSE](LICENSE) for details.
