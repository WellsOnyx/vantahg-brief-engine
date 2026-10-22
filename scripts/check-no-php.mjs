/**
 * Fails if PHP shows up anywhere in the working tree.
 * Looks for PHP source files, Composer manifests, PHP open tags,
 * and PHP base images in Docker or CI workflow files.
 *
 * The open-tag needle is built at runtime so this file does not contain it.
 *
 * Usage: node scripts/check-no-php.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.cursor']);
const PHP_EXT = new Set(['.php', '.phtml', '.inc']);
const OPEN_TAG = new RegExp('<' + '\\?php', 'i');
const FROM_PHP = new RegExp('^\\s*FROM\\s+' + 'php' + '(?:[:@\\s]|$)', 'i');
const IMAGE_PHP = new RegExp('image:\\s*[\'"]?' + 'php' + '(?:[:@\\s]|$)', 'i');
const FPM = new RegExp('php' + '-fpm', 'i');

export function findPhpViolations(text, relPath) {
  const violations = [];
  const normalized = relPath.replace(/\\/g, '/');
  const base = path.posix.basename(normalized);
  const ext = path.posix.extname(base).toLowerCase();

  if (PHP_EXT.has(ext)) {
    violations.push({ path: normalized, kind: 'php_file' });
  }
  if (base === 'composer.json' || base === 'composer.lock') {
    violations.push({ path: normalized, kind: 'composer_manifest' });
  }
  if (text && OPEN_TAG.test(text)) {
    violations.push({ path: normalized, kind: 'php_open_tag' });
  }

  const dockerish =
    /^dockerfile/i.test(base) ||
    /^docker-compose/i.test(base) ||
    normalized.startsWith('.github/workflows/');
  if (dockerish && text && (FROM_PHP.test(text) || IMAGE_PHP.test(text) || FPM.test(text))) {
    violations.push({ path: normalized, kind: 'php_image' });
  }
  return violations;
}

export function scanRepo(root = ROOT) {
  const violations = [];
  walk(root, root, violations);
  return violations;
}

function walk(root, dir, violations) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, violations);
      continue;
    }
    if (!entry.isFile()) continue;
    const rel = path.relative(root, full).replace(/\\/g, '/');
    let text = '';
    try {
      const buf = fs.readFileSync(full);
      if (buf.length <= 2_000_000) text = buf.toString('utf8');
    } catch {
      continue;
    }
    violations.push(...findPhpViolations(text, rel));
  }
}

function main() {
  const violations = scanRepo();
  if (violations.length === 0) {
    process.stdout.write('PHP scan passed.\n');
    return;
  }
  process.stderr.write(`PHP scan found ${violations.length} problem(s):\n`);
  for (const hit of violations) {
    process.stderr.write(`${hit.path}: ${hit.kind}\n`);
  }
  process.exitCode = 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
