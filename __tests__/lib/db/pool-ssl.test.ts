import { describe, expect, it } from 'vitest';
import { resolvePgSsl } from '@/lib/db/pool';

describe('resolvePgSsl', () => {
  it('disables SSL for local docker Postgres', () => {
    expect(resolvePgSsl({ DATABASE_SSL: 'disable' })).toBe(false);
    expect(resolvePgSsl({ DB_HOST: '127.0.0.1', DB_PASSWORD: 'localdev' })).toBe(false);
    expect(
      resolvePgSsl({ DATABASE_URL: 'postgres://vantaum:localdev@localhost:5432/vantaum' }),
    ).toBe(false);
  });

  it('keeps SSL for a remote RDS host', () => {
    expect(
      resolvePgSsl({ DATABASE_URL: 'postgres://vantaum:secret-value@db.example:5432/vantaum' }),
    ).toEqual({ rejectUnauthorized: false });
  });
});
