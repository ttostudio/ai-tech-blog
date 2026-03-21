import cron from 'node-cron';
import type { Sql } from '@ai-tech-blog/shared';
import { ingestNews } from './ingestion.js';
import { generateArticles } from './article-generator.js';

export function startCron(sql: Sql): void {
  const schedule = process.env.INGESTION_CRON ?? '0 */6 * * *';

  cron.schedule(schedule, async () => {
    console.log('Cron: starting news ingestion...');
    try {
      const stats = await ingestNews(sql);
      console.log(`Cron: ingested ${stats.itemsIngested}, deduped ${stats.itemsDeduplicated}`);

      if (stats.itemsIngested > 0) {
        const articles = await generateArticles(sql);
        console.log(`Cron: generated ${articles} articles`);
      }
    } catch (err) {
      console.error('Cron: ingestion failed', err);
    }
  });

  console.log(`Cron scheduled: ${schedule}`);
}
