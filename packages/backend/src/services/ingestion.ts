import { createHash } from 'node:crypto';
import type { Sql, TtoClawNewsPayload, InsertNewsItem } from '@ai-tech-blog/shared';

export interface IngestionStats {
  itemsIngested: number;
  itemsDeduplicated: number;
}

export function computeContentHash(url: string, title: string): string {
  return createHash('sha256').update(`${url}|${title}`).digest('hex');
}

export async function fetchNews(): Promise<TtoClawNewsPayload> {
  const endpoint = process.env.TTOCLAW_NEWS_ENDPOINT;
  if (!endpoint) {
    throw new Error('TTOCLAW_NEWS_ENDPOINT is not configured');
  }

  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`ttoClaw API returned ${response.status}`);
  }

  return (await response.json()) as TtoClawNewsPayload;
}

export function parseNewsItems(payload: TtoClawNewsPayload): InsertNewsItem[] {
  return payload.items.map((item) => ({
    sourceChannel: item.channel,
    title: item.title,
    url: item.url || null,
    summary: item.summary,
    rawData: { ...item.metadata, postedAt: item.postedAt },
    contentHash: computeContentHash(item.url, item.title),
  }));
}

export async function storeNewsItems(
  sql: Sql,
  items: InsertNewsItem[],
): Promise<IngestionStats> {
  let ingested = 0;
  let deduplicated = 0;

  for (const item of items) {
    try {
      await sql`
        INSERT INTO news_items (source_channel, title, url, summary, raw_data, content_hash)
        VALUES (${item.sourceChannel}, ${item.title}, ${item.url}, ${item.summary}, ${sql.json(item.rawData as Record<string, string>)}, ${item.contentHash})
      `;
      ingested++;
    } catch (err: unknown) {
      // Unique constraint violation = duplicate
      if (err instanceof Error && err.message.includes('unique')) {
        deduplicated++;
      } else {
        throw err;
      }
    }
  }

  return { itemsIngested: ingested, itemsDeduplicated: deduplicated };
}

export async function ingestNews(sql: Sql): Promise<IngestionStats> {
  const payload = await fetchNews();
  const items = parseNewsItems(payload);
  return storeNewsItems(sql, items);
}
