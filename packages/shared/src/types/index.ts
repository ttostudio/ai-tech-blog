// --- Article ---

export type ArticleStatus = 'draft' | 'published' | 'archived';

export type ThumbnailStatus = 'none' | 'generating' | 'completed' | 'failed';

export interface Article {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: string;
  status: ArticleStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  thumbnailUrl: string | null;
  thumbnailPrompt: string | null;
  thumbnailStatus: ThumbnailStatus;
  thumbnailError: string | null;
  thumbnailGeneratedAt: Date | null;
}

export interface SubmitArticleBody {
  title: string;
  slug: string;
  content: string;
  category: string;
  author: string;
  excerpt?: string;
  tags?: string[];
  status?: 'draft' | 'published';
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

// --- Article Topics ---

export type TopicStatus = 'pending' | 'accepted' | 'rejected' | 'generated';
export type TopicSourceType = 'commit' | 'issue' | 'pull_request';

export interface ArticleTopic {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  sourceType: TopicSourceType;
  sourceRepo: string;
  sourceRef: string | null;
  sourceUrl: string | null;
  sourceData: Record<string, unknown>;
  status: TopicStatus;
  articleId: string | null;
  createdAt: Date;
}

// --- Article Generation Jobs ---

export type JobStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface ArticleGenerationJob {
  id: string;
  topicId: string;
  author: string;
  status: JobStatus;
  articleId: string | null;
  errorMessage: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Health ---

export interface HealthStatus {
  status: 'ok' | 'error';
  version: string;
  services: {
    database: 'ok' | 'error';
  };
}

// --- Categories ---

export interface Category {
  name: string;
  displayName: string;
  articleCount: number;
}

export const CATEGORY_DISPLAY_NAMES: Record<string, string> = {
  'claude-code': 'Claude Codeニュース',
  'ai-hacks': 'AIハック＆トレンド',
  'ai-news': 'AIニュース',
  'tech': 'テクノロジー',
};
