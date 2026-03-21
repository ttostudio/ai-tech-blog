import type { Sql } from './connection.js';
import { MIGRATIONS } from './migrations.js';

export async function migrate(sql: Sql): Promise<void> {
  // Create migrations tracking table
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  // Get applied migrations
  const applied = await sql<{ version: number }[]>`
    SELECT version FROM schema_migrations ORDER BY version
  `;
  const appliedVersions = new Set(applied.map((r) => r.version));

  // Apply pending migrations
  for (const migration of MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;

    await sql.begin(async (tx) => {
      await tx.unsafe(migration.up);
      await tx`
        INSERT INTO schema_migrations (version, name)
        VALUES (${migration.version}, ${migration.name})
      `;
    });

    console.log(`Applied migration ${migration.version}: ${migration.name}`);
  }
}
