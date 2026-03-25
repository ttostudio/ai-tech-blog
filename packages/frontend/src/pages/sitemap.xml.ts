import type { APIRoute } from 'astro';

const API_BASE = import.meta.env.PUBLIC_API_URL ?? 'http://backend:3000/api';

interface ArticleSummary {
  slug: string;
  publishedAt: string | null;
  updatedAt?: string | null;
}

interface ApiResponse {
  data: ArticleSummary[];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const GET: APIRoute = async ({ url }) => {
  const baseUrl = `${url.protocol}//${url.host}`;

  let articles: ArticleSummary[] = [];
  try {
    const res = await fetch(`${API_BASE}/articles?status=published&limit=1000`);
    if (res.ok) {
      const json = (await res.json()) as ApiResponse;
      articles = json.data ?? [];
    }
  } catch {
    // サイトマップ生成失敗時はトップページのみ含む
  }

  const now = new Date().toISOString().split('T')[0];

  const urls: string[] = [
    `  <url>
    <loc>${escapeXml(baseUrl)}/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`,
  ];

  for (const article of articles) {
    const lastmod = article.updatedAt
      ? article.updatedAt.split('T')[0]
      : article.publishedAt
        ? article.publishedAt.split('T')[0]
        : now;

    urls.push(`  <url>
    <loc>${escapeXml(`${baseUrl}/articles/${article.slug}`)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
