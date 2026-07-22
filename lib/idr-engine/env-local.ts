import { readFileSync, existsSync } from 'fs';
import path from 'path';

/**
 * Self-serve env loading for the CLIs (deploy-ready doctrine): a
 * non-engineer puts the API key in ONE file — `.env.idr` in the repo
 * root — and every idr-* command picks it up. Values already present in
 * the process environment always win. Never committed (gitignored).
 *
 *   ANTHROPIC_API_KEY=sk-ant-...
 *   ENABLE_REAL_ANTHROPIC=true
 *   IDR_OUTPUT_DIR=C:\Users\me\Desktop\engine-output   (optional)
 */
export function loadLocalEnv(repoRoot = process.cwd()): void {
  const file = path.join(repoRoot, '.env.idr');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
