import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import { loadConfig } from '../config.js';

const config = loadConfig();
const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 2 });

try {
  await migrate(drizzle(pool), { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });
} finally {
  await pool.end();
}
