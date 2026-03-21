import postgres from 'postgres';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Sql = postgres.Sql<any>;

export function createDb(connectionString?: string): Sql {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL is required');
  }
  return postgres(url, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
}
