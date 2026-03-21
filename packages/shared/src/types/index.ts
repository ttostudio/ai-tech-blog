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
  author: string;
  status: ArticleStatus;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubmitArticleBody {
  title: string;
  slug: string;
  content: string;
  category: string;
  author: string;
  excerpt?: string;
  tags?: string[];
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
  'claude-code': 'Claude Code News',
  'ai-hacks': 'AI Hacks & Trends',
  'ai-news': 'AI News',
  'tech': 'Tech',
};
