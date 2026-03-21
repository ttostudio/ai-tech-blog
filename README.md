# AI Tech Blog

Automatically generates blog articles from AI news collected by [ttoClaw](https://github.com/ttostudio/ttoClaw).

## Overview

AI Tech Blog transforms news and technical information posted by ttoClaw to Slack channels (`#claude-code-news`, `#sns-trendy-ai-hacks`) into well-structured blog articles, viewable via a web browser over Tailscale.

## Features

- Automatic blog article generation from ttoClaw's 6-hour news collection data
- Web-based reader interface accessible via Tailscale
- Self-contained Docker Compose deployment
- Start/Stop from AI Company OS dashboard

## Tech Stack

- **Backend:** Node.js / Python (article generation pipeline)
- **Frontend:** Next.js or Astro (static blog reader)
- **Database:** PostgreSQL (article storage)
- **Infrastructure:** Docker Compose, Caddy (reverse proxy)

## Getting Started

### Prerequisites

- Docker & Docker Compose
- Access to ttoClaw news data

### Quick Start

```bash
cp .env.example .env
# Edit .env with your configuration
docker compose up -d
```

The blog will be available at `http://localhost:3100`.

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linter
npm run lint
```

## Architecture

```
ttoClaw (news collection)
  -> News Ingestion Service (fetch & parse)
  -> Article Generator (LLM-powered summarization & writing)
  -> Blog Storage (PostgreSQL)
  -> Blog Reader (web frontend)
```

## License

MIT - see [LICENSE](LICENSE) for details.

## Contributing

This is an open source project by [ttoStudio](https://github.com/ttostudio). Contributions are welcome!
