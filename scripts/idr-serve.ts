import path from 'path';
import { loadLocalEnv } from '../lib/idr-engine/env-local';
import { serve } from '../lib/idr-engine/serve';
import { defaultOutputRoot } from '../lib/idr-engine/output-guard';

/**
 * Internal serve mode — one in-VPC machine serves the queue + mirror forms
 * to many arbiter WorkSpaces, zero per-workstation installs.
 *
 *   npx tsx scripts/idr-serve.ts <batch-output-dir> [--host <ip>] [--port <n>]
 *
 * <batch-output-dir> is what `idr-batch` produced (contains _queue/ and one
 * folder per case). Run idr-batch first; this only serves the result.
 *
 * Config (via .env.idr or the environment):
 *   IDR_SERVE_CODE   REQUIRED — the shared access code arbiters type once.
 *   IDR_SERVE_HOST   bind address; default 127.0.0.1. For other WorkSpaces
 *                    to reach it, set the server's private VPC IP (10.x /
 *                    172.16–31.x / 192.168.x). PUBLIC binds are REFUSED.
 *   IDR_SERVE_PORT   default 8787.
 *
 * Guardrails: private network only (refuses public/all-interface binds),
 * shared access code, the API key + all processing stay on this machine,
 * reviewer pages are DRAFT-stamped with no tooling language. Nothing is
 * ever submitted anywhere.
 */

loadLocalEnv();

async function main() {
  const args = process.argv.slice(2);
  const dir = args.find((a) => !a.startsWith('--'));
  const flagVal = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
  const servedDir = path.resolve(dir ?? path.join(defaultOutputRoot(), 'open-cases'));

  const host = flagVal('--host') ?? process.env.IDR_SERVE_HOST ?? '127.0.0.1';
  const port = Number(flagVal('--port') ?? process.env.IDR_SERVE_PORT ?? 8787);
  const accessCode = process.env.IDR_SERVE_CODE ?? '';

  const handle = await serve({ servedDir, host, port, accessCode });
  console.log(`\nServing the review queue + mirror forms (INTERNAL, private network only):`);
  console.log(`  ${handle.url}`);
  console.log(`  serving: ${servedDir}`);
  console.log(`  arbiters open that URL from their WorkSpace browser and enter the shared access code.`);
  console.log(`  the API key and all case processing stay on THIS machine.\n  Ctrl-C to stop.\n`);
}

main().catch((err) => {
  console.error('idr-serve failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
