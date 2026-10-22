/**
 * Blocks realistic IDR dispute numbers and common PHI patterns.
 * Dispute ids must look fake: DISP-SYN-...
 * DISP- followed by digits is never waived, including on the allowlist.
 * The allowlist covers pre-existing UM demo files only.
 *
 * Usage: node scripts/check-idr-phi.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const ALLOWLIST_PATH = path.join(ROOT, 'config', 'idr', 'phi-scan-allowlist.txt');

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.cursor']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.yaml', '.yml', '.json', '.txt', '.sql', '.html']);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);

const PROTECTED_PREFIXES = [
  'config/idr/',
  'lib/idr/',
  '__tests__/lib/idr/',
  'docs/customer-ready/21-idr-determination-workflow.md',
  'docs/idr-assist/',
];

const DISPUTE_RE = /\bDISP-(?!SYN-)[0-9]{3,}\b/g;
const SSN_RE = /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g;
const MRN_RE = /\bMRN[\s:#-]*[A-Z0-9]{5,}\b/gi;
const MEMBER_RE =
  /\b(?:patient_)?member(?:_id|Id|\s+id)\b\s*[:=]\s*(['"])[A-Za-z0-9][A-Za-z0-9-]{4,}\1|\bMember\s+ID\s*:\s*[A-Za-z0-9][A-Za-z0-9-]{4,}/gi;
const DOB_RE =
  /(?:\b[A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+\b[\s\S]{0,80}\b(?:DOB|date of birth)\b[\s\S]{0,40}\b(?:[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})\b)|(?:\b(?:DOB|date of birth)\b[\s\S]{0,40}\b(?:[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})\b[\s\S]{0,80}\b[A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+\b)/gi;

export function loadAllowlist(filePath = ALLOWLIST_PATH) {
  if (!fs.existsSync(filePath)) return new Set();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const rel = trimmed.replace(/\\/g, '/');
    if (PROTECTED_PREFIXES.some((prefix) => rel === prefix || rel.startsWith(prefix))) {
      throw new Error(`PHI allowlist cannot cover IDR content: ${rel}`);
    }
    entries.push(rel);
  }
  return new Set(entries);
}

export function findViolations(text, relPath, allowPhi) {
  const violations = [];
  collect(violations, relPath, 'dispute_number', text, DISPUTE_RE);
  if (!allowPhi) {
    collect(violations, relPath, 'ssn', text, SSN_RE);
    collect(violations, relPath, 'mrn', text, MRN_RE);
    collect(violations, relPath, 'member_id', text, MEMBER_RE);
    collect(violations, relPath, 'dob_with_name', text, DOB_RE);
  }
  return violations;
}

export function scanRepo(root = ROOT, allowlist = loadAllowlist()) {
  const violations = [];
  walk(root, root, allowlist, violations);
  return violations;
}

function collect(violations, relPath, kind, text, pattern) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(re)) {
    violations.push({ path: relPath, kind, sample: match[0].slice(0, 80) });
    if (violations.filter((item) => item.path === relPath && item.kind === kind).length >= 3) break;
  }
}

function walk(root, dir, allowlist, violations) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(root, full, allowlist, violations);
      continue;
    }
    if (!entry.isFile() || SKIP_FILES.has(entry.name)) continue;
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    const rel = path.relative(root, full).replace(/\\/g, '/');
    const text = fs.readFileSync(full, 'utf8');
    violations.push(...findViolations(text, rel, allowlist.has(rel)));
  }
}

function main() {
  const violations = scanRepo();
  if (violations.length === 0) {
    process.stdout.write('IDR PHI scan passed.\n');
    return;
  }
  process.stderr.write(`IDR PHI scan found ${violations.length} problem(s):\n`);
  for (const hit of violations) {
    process.stderr.write(`${hit.path}: ${hit.kind}: ${hit.sample}\n`);
  }
  process.exitCode = 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
