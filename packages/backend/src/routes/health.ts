import type { FastifyInstance } from 'fastify';
import type { HealthStatus, Sql } from '@ai-tech-blog/shared';

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  const sql = (app as unknown as { sql: Sql }).sql;

  app.get('/health', async (_req, reply) => {
    let dbStatus: 'ok' | 'error' = 'error';
    try {
      await sql`SELECT 1`;
      dbStatus = 'ok';
    } catch {
      // db unreachable
    }

    const status: HealthStatus = {
      status: dbStatus === 'ok' ? 'ok' : 'error',
      version: '1.0.0',
      services: {
        database: dbStatus,
        ingestion: 'ok',
      },
    };

    const code = status.status === 'ok' ? 200 : 503;
    return reply.code(code).send(status);
  });
}
