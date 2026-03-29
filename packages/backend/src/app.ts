import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { Sql } from '@ai-tech-blog/shared';
import { articleRoutes } from './routes/articles.js';
import { healthRoutes } from './routes/health.js';
import { categoryRoutes } from './routes/categories.js';
import { thumbnailRoutes } from './routes/thumbnails.js';
import { pipelineRoutes } from './routes/pipeline.js';

export function buildApp(sql: Sql) {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });

  app.decorate('sql', sql);

  app.register(healthRoutes, { prefix: '/api' });
  app.register(articleRoutes, { prefix: '/api' });
  app.register(categoryRoutes, { prefix: '/api' });
  app.register(thumbnailRoutes, { prefix: '/api' });
  app.register(pipelineRoutes, { prefix: '/api' });

  return app;
}
