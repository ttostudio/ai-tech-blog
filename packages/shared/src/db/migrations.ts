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
  {
    version: 6,
    name: 'add_tags_gin_index_for_related',
    up: `
      CREATE INDEX IF NOT EXISTS idx_articles_tags_gin
        ON articles USING GIN (tags);
      CREATE INDEX IF NOT EXISTS idx_articles_category_status
        ON articles (category, status);
    `,
  },
  {
    version: 7,
    name: 'create_article_topics',
    up: `
      CREATE TABLE IF NOT EXISTS article_topics (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title        VARCHAR(500) NOT NULL,
        description  TEXT,
        category     VARCHAR(100) NOT NULL,
        tags         TEXT[] NOT NULL DEFAULT '{}',
        source_type  VARCHAR(50) NOT NULL,
        source_repo  VARCHAR(200) NOT NULL,
        source_ref   VARCHAR(500),
        source_url   VARCHAR(2048),
        source_data  JSONB NOT NULL DEFAULT '{}',
        status       VARCHAR(20) NOT NULL DEFAULT 'pending',
        article_id   UUID REFERENCES articles(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_article_topics_status      ON article_topics(status);
      CREATE INDEX IF NOT EXISTS idx_article_topics_source_type ON article_topics(source_type);
      CREATE INDEX IF NOT EXISTS idx_article_topics_created_at  ON article_topics(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_article_topics_source_ref  ON article_topics(source_ref);
    `,
  },
  {
    version: 8,
    name: 'create_article_generation_jobs',
    up: `
      CREATE TABLE IF NOT EXISTS article_generation_jobs (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        topic_id          UUID NOT NULL REFERENCES article_topics(id) ON DELETE CASCADE,
        author            VARCHAR(200) NOT NULL DEFAULT 'AI Tech Blog',
        status            VARCHAR(20) NOT NULL DEFAULT 'pending',
        article_id        UUID REFERENCES articles(id) ON DELETE SET NULL,
        error_message     TEXT,
        prompt_tokens     INTEGER,
        completion_tokens INTEGER,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_gen_jobs_topic_id   ON article_generation_jobs(topic_id);
      CREATE INDEX IF NOT EXISTS idx_gen_jobs_status     ON article_generation_jobs(status);
      CREATE INDEX IF NOT EXISTS idx_gen_jobs_created_at ON article_generation_jobs(created_at DESC);
    `,
  },
];
