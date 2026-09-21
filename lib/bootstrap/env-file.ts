/**
 * Minimal KEY=VALUE loader for operator scripts.
 *
 * Does not override variables already set in the process environment.
 * Does not print values. Not a general dotenv implementation.
 */

export function applyEnvFile(contents: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const applied: string[] = [];
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (env[key]) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
    applied.push(key);
  }
  return applied;
}
