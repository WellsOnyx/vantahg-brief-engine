import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './lib/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
  // We continue to use the existing supabase/migrations/*.sql files as the
  // authoritative DDL. Drizzle-kit is here for type-safe query building and
  // for the eventual `drizzle-kit generate` workflow once we're fully off
  // Supabase migrations.
  verbose: true,
  strict: true,
} satisfies Config;
