const API_BASE = import.meta.env.PUBLIC_API_URL ?? 'http://backend:3000/api';

export async function fetchApi<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export interface RelatedArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  tags: string[];
  author: string;
  publishedAt: string | null;
  thumbnailUrl?: string | null;
}

export async function fetchRelatedArticles(slug: string): Promise<RelatedArticle[]> {
  const res = await fetchApi<{ data: RelatedArticle[] }>(`/articles/${encodeURIComponent(slug)}/related`);
  return res.data;
}
