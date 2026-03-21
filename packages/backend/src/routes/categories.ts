import type { FastifyInstance } from 'fastify';
import type { Sql, ApiResponse, Category } from '@ai-tech-blog/shared';
import { CATEGORY_DISPLAY_NAMES } from '@ai-tech-blog/shared';

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

    const categories: Category[] = rows.map((r) => ({
      name: r.category,
      displayName: CATEGORY_DISPLAY_NAMES[r.category] ?? r.category,
      articleCount: r.article_count,
    }));

    const response: ApiResponse<Category[]> = { data: categories };
    return reply.send(response);
  });
}
