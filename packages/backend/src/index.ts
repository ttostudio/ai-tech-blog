import { createDb, migrate } from '@ai-tech-blog/shared';
import { buildApp } from './app.js';
import { startCron } from './services/cron.js';

const PORT = parseInt(process.env.PORT ?? '3000', 10);

async function main(): Promise<void> {
  const sql = createDb();

  // Run migrations
  console.log('Running database migrations...');
  await migrate(sql);
  console.log('Migrations complete.');

  const app = buildApp(sql);

  await app.listen({ port: PORT, host: '0.0.0.0' });
  console.log(`Backend listening on port ${PORT}`);

  // Start cron job for periodic ingestion
  startCron(sql);
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
