import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from '@ai-tech-blog/shared';
import { articleRoutes } from './routes/articles.js';
import { ingestRoutes } from './routes/ingest.js';
import { healthRoutes } from './routes/health.js';
import { categoryRoutes } from './routes/categories.js';

export function buildApp(sql: Sql) {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  // Decorate with DB
  app.decorate('sql', sql);

  // Register routes
  app.register(healthRoutes, { prefix: '/api' });
  app.register(articleRoutes, { prefix: '/api' });
  app.register(ingestRoutes, { prefix: '/api' });
  app.register(categoryRoutes, { prefix: '/api' });

  return app;
}
