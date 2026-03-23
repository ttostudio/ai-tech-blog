export interface Migration {
  version: number;
  name: string;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: 'create_news_items',
    up: `
      CREATE TABLE IF NOT EXISTS news_items (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_channel  VARCHAR(100) NOT NULL,
        title           VARCHAR(500) NOT NULL,
        url             VARCHAR(2048),
        summary         TEXT NOT NULL,
        raw_data        JSONB NOT NULL DEFAULT '{}',
        fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        content_hash    VARCHAR(64) NOT NULL UNIQUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_news_items_fetched_at ON news_items (fetched_at DESC);
      CREATE INDEX IF NOT EXISTS idx_news_items_source ON news_items (source_channel);
    `,
  },
  {
    version: 2,
    name: 'create_articles',
    up: `
      CREATE TABLE IF NOT EXISTS articles (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title           VARCHAR(500) NOT NULL,
        slug            VARCHAR(500) NOT NULL UNIQUE,
        content         TEXT NOT NULL,
        excerpt         VARCHAR(1000) NOT NULL,
        category        VARCHAR(100) NOT NULL,
        tags            TEXT[] DEFAULT '{}',
        status          VARCHAR(20) NOT NULL DEFAULT 'draft',
        published_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles (slug);
      CREATE INDEX IF NOT EXISTS idx_articles_status ON articles (status);
      CREATE INDEX IF NOT EXISTS idx_articles_published ON articles (published_at DESC) WHERE status = 'published';
      CREATE INDEX IF NOT EXISTS idx_articles_category ON articles (category);
    `,
  },
  {
    version: 3,
    name: 'create_article_sources',
    up: `
      CREATE TABLE IF NOT EXISTS article_sources (
        article_id   UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
        news_item_id UUID NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
        PRIMARY KEY (article_id, news_item_id)
      );
    `,
  },
  {
    version: 4,
    name: 'add_author_to_articles',
    up: `
      ALTER TABLE articles ADD COLUMN IF NOT EXISTS author VARCHAR(200) NOT NULL DEFAULT 'anonymous';
    `,
  },
  {
    version: 5,
    name: 'add_thumbnail_columns',
    up: `
      ALTER TABLE articles
        ADD COLUMN IF NOT EXISTS thumbnail_url VARCHAR(500),
        ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT,
        ADD COLUMN IF NOT EXISTS thumbnail_status VARCHAR(20) NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS thumbnail_error TEXT,
        ADD COLUMN IF NOT EXISTS thumbnail_generated_at TIMESTAMPTZ;
      CREATE INDEX IF NOT EXISTS idx_articles_thumbnail_status ON articles (thumbnail_status);
    `,
  },
];
