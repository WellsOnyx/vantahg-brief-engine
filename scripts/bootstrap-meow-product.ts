/**
 * scripts/bootstrap-meow-product.ts
 *
 * One-time setup: creates the "VantaUM PEPM" Product in Meow and prints
 * the resulting UUID for storage in MEOW_VANTAUM_PRODUCT_ID env var.
 *
 * Usage:
 *   MEOW_API_KEY=... ENABLE_REAL_MEOW=true npx tsx scripts/bootstrap-meow-product.ts
 *
 * Idempotent: if MEOW_VANTAUM_PRODUCT_ID is already set in env, refuses
 * to run (would create a duplicate Product in Meow). Delete the env var
 * first if you genuinely want to recreate.
 */

import { createProduct } from '@/lib/billing/meow-client';

async function main() {
  if (process.env.MEOW_VANTAUM_PRODUCT_ID) {
    console.error(
      'MEOW_VANTAUM_PRODUCT_ID is already set in env:',
      process.env.MEOW_VANTAUM_PRODUCT_ID,
    );
    console.error(
      'Refusing to create a duplicate Product. Unset the env var if you want to recreate.',
    );
    process.exit(1);
  }

  if (process.env.ENABLE_REAL_MEOW !== 'true') {
    console.warn(
      'ENABLE_REAL_MEOW is not true. The script will produce a demo stub ID. ' +
        'Set ENABLE_REAL_MEOW=true and re-run for a real Meow Product.',
    );
  }

  const result = await createProduct({
    name: 'VantaUM PEPM',
    description:
      'Per-eligible-per-member monthly subscription fee for VantaUM Utilization Management services. Invoiced monthly in arrears.',
    default_price: 2.4, // canonical PEPM placeholder — actual rate overridden per invoice line item
  });

  if (!result.ok) {
    console.error('Failed to create Meow Product:', result.code, result.message);
    process.exit(1);
  }

  console.log('Created Meow Product:');
  console.log('  id:', result.data.id);
  console.log('  name:', result.data.name);
  console.log('  default_price:', result.data.default_price);
  console.log('');
  console.log('Now set this in your env (Vercel + AWS Secrets Manager):');
  console.log(`  MEOW_VANTAUM_PRODUCT_ID=${result.data.id}`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
