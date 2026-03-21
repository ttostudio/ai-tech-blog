import type { FastifyInstance } from 'fastify';
import type { Sql, ApiResponse, Category } from '@ai-tech-blog/shared';
import { CHANNEL_CATEGORY_MAP } from '@ai-tech-blog/shared';

export async function categoryRoutes(app: FastifyInstance): Promise<void> {
  const sql = (app as unknown as { sql: Sql }).sql;

  app.get('/categories', async (_req, reply) => {
    const rows = await sql`
      SELECT category, COUNT(*)::int as article_count
      FROM articles
      WHERE status = 'published'
      GROUP BY category
      ORDER BY article_count DESC
    `;

    // Build display name map from CHANNEL_CATEGORY_MAP
    const displayNames: Record<string, string> = {};
    for (const val of Object.values(CHANNEL_CATEGORY_MAP)) {
      displayNames[val.slug] = val.displayName;
    }

    const categories: Category[] = rows.map((r) => ({
      name: r.category,
      displayName: displayNames[r.category] ?? r.category,
      articleCount: r.article_count,
    }));

    const response: ApiResponse<Category[]> = { data: categories };
    return reply.send(response);
  });
}
