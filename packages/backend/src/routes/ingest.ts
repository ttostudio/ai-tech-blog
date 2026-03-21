import type { FastifyInstance } from 'fastify';
import type { Sql, ApiResponse, IngestionResult } from '@ai-tech-blog/shared';
import { ingestNews } from '../services/ingestion.js';
import { generateArticles } from '../services/article-generator.js';

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
  const sql = (app as unknown as { sql: Sql }).sql;

  app.post('/ingest', async (_req, reply) => {
    try {
      const ingestionResult = await ingestNews(sql);
      let articlesGenerated = 0;

      if (ingestionResult.itemsIngested > 0) {
        articlesGenerated = await generateArticles(sql);
      }

      const result: IngestionResult = {
        itemsIngested: ingestionResult.itemsIngested,
        itemsDeduplicated: ingestionResult.itemsDeduplicated,
        articlesGenerated,
      };

      const response: ApiResponse<IngestionResult> = { data: result };
      return reply.send(response);
    } catch (err) {
      app.log.error(err, 'Ingestion failed');
      return reply.code(500).send({
        error: { code: 'INGESTION_ERROR', message: 'News ingestion failed' },
      });
    }
  });
}
