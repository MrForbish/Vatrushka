import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgresql://vatrushka:vatrushka@localhost:5432/vatrushka' },
  strict: true,
  verbose: true,
});
