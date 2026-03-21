// --- News Item ---

export interface NewsItem {
  id: string;
  sourceChannel: string;
  title: string;
  url: string | null;
  summary: string;
  rawData: Record<string, unknown>;
  fetchedAt: Date;
  contentHash: string;
  createdAt: Date;
}

export interface InsertNewsItem {
  sourceChannel: string;
  title: string;
  url?: string | null;
  summary: string;
  rawData: Record<string, unknown>;
  contentHash: string;
}

// --- Article ---

export type ArticleStatus = 'draft' | 'published' | 'archived';

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InsertArticle {
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags?: string[];
  status?: ArticleStatus;
  publishedAt?: Date | null;
}

export interface ArticleWithSources extends Article {
  sources: Array<{
    title: string;
    url: string | null;
    sourceChannel: string;
  }>;
}

// --- API Responses ---

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// --- Ingestion ---

export interface TtoClawNewsPayload {
  items: TtoClawNewsItem[];
}

export interface TtoClawNewsItem {
  channel: string;
  title: string;
  url: string;
  summary: string;
  postedAt: string;
  metadata: Record<string, unknown>;
}

export interface IngestionResult {
  itemsIngested: number;
  itemsDeduplicated: number;
  articlesGenerated: number;
}

// --- Health ---

export interface HealthStatus {
  status: 'ok' | 'error';
  version: string;
  services: {
    database: 'ok' | 'error';
    ingestion: 'ok' | 'error';
  };
}

// --- Categories ---

export interface Category {
  name: string;
  displayName: string;
  articleCount: number;
}

export const CHANNEL_CATEGORY_MAP: Record<string, { slug: string; displayName: string }> = {
  'claude-code-news': { slug: 'claude-code', displayName: 'Claude Code News' },
  'sns-trendy-ai-hacks': { slug: 'ai-hacks', displayName: 'AI Hacks & Trends' },
};
