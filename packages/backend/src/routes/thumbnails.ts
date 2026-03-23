import type { FastifyInstance } from 'fastify';
import type { Sql, ApiResponse, ThumbnailStatus } from '@ai-tech-blog/shared';
import { generateThumbnail } from '../services/thumbnail.js';

interface ThumbnailStatusResponse {
  slug: string;
  thumbnailStatus: ThumbnailStatus;
  thumbnailUrl: string | null;
  thumbnailError: string | null;
  thumbnailGeneratedAt: Date | null;
}

export async function thumbnailRoutes(app: FastifyInstance): Promise<void> {
  const sql = (app as unknown as { sql: Sql }).sql;

  // サムネイル生成開始（非同期）
  app.post('/articles/:slug/thumbnail', async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const rows = await sql`
      SELECT id, title, category, thumbnail_status FROM articles WHERE slug = ${slug}
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '記事が見つかりません' } });
    }

    const article = rows[0];

    if (article.thumbnail_status === 'generating') {
      return reply.code(409).send({ error: { code: 'CONFLICT', message: 'サムネイルは既に生成中です' } });
    }

    // Fire-and-forget で生成開始
    generateThumbnail(sql, article.id, article.title, article.category).catch((err) => {
      console.error('サムネイル生成バックグラウンドエラー:', err);
    });

    return reply.code(202).send({
      data: { message: 'サムネイル生成を開始しました', slug },
    });
  });

  // サムネイルステータス取得
  app.get('/articles/:slug/thumbnail/status', async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const rows = await sql`
      SELECT slug, thumbnail_status, thumbnail_url, thumbnail_error, thumbnail_generated_at
      FROM articles WHERE slug = ${slug}
    `;

    if (rows.length === 0) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '記事が見つかりません' } });
    }

    const row = rows[0];
    const response: ApiResponse<ThumbnailStatusResponse> = {
      data: {
        slug: row.slug,
        thumbnailStatus: row.thumbnail_status,
        thumbnailUrl: row.thumbnail_url,
        thumbnailError: row.thumbnail_error,
        thumbnailGeneratedAt: row.thumbnail_generated_at,
      },
    };

    return reply.send(response);
  });

  // 一括サムネイル生成
  app.post('/thumbnails/batch', async (req, reply) => {
    const body = req.body as { slugs?: string[]; all?: boolean; limit?: number } | null;
    const limit = Math.min(50, Math.max(1, body?.limit ?? 50));

    let targetArticles;

    if (body?.slugs && body.slugs.length > 0) {
      // 指定されたslugのみ
      const slugList = body.slugs.slice(0, limit);
      targetArticles = await sql`
        SELECT id, title, slug, category, thumbnail_status
        FROM articles
        WHERE slug = ANY(${slugList})
          AND thumbnail_status != 'generating'
      `;
    } else {
      // サムネイル未生成の記事を対象
      targetArticles = await sql`
        SELECT id, title, slug, category, thumbnail_status
        FROM articles
        WHERE thumbnail_status IN ('none', 'failed')
          AND status = 'published'
        ORDER BY published_at DESC NULLS LAST
        LIMIT ${limit}
      `;
    }

    if (targetArticles.length === 0) {
      return reply.code(200).send({
        data: { message: '対象記事がありません', queued: 0 },
      });
    }

    // 全て fire-and-forget で開始
    for (const article of targetArticles) {
      generateThumbnail(sql, article.id, article.title, article.category).catch((err) => {
        console.error(`バッチサムネイル生成エラー (${article.slug}):`, err);
      });
    }

    return reply.code(202).send({
      data: {
        message: 'サムネイル一括生成を開始しました',
        queued: targetArticles.length,
        slugs: targetArticles.map((a) => a.slug),
      },
    });
  });
}
