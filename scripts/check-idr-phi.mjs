/**
 * Repo-wide PHI guard.
 *
 * Dispute ids must look fake: DISP-SYN-...
 * DISP- followed by digits is never waived, including on the allowlist.
 * Non-fictional phone numbers and personal-mailbox emails are never waived.
 * Case binaries (pdf, tif, tiff, dcm) are refused outside synthetic-fixtures/.
 * The allowlist covers pre-existing demo files only and cannot cover IDR trees.
 *
 * Usage: node scripts/check-idr-phi.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const ALLOWLIST_PATH = path.join(ROOT, 'config', 'idr', 'phi-scan-allowlist.txt');
const SYNTHETIC_BIN_DIR = 'synthetic-fixtures/';

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'coverage', '.cursor']);
const TEXT_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.yaml', '.yml',
  '.json', '.txt', '.sql', '.html', '.csv', '.toml',
]);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']);
const CASE_BIN_EXT = new Set(['.pdf', '.tif', '.tiff', '.dcm', '.dicom']);

const PROTECTED_PREFIXES = [
  'config/idr/',
  'lib/idr/',
  '__tests__/lib/idr/',
  'docs/customer-ready/21-idr-determination-workflow.md',
  'docs/idr-assist/',
];

const KNOWN_FAKE_SSN = new Set([
  '000-00-0000',
  '111-11-1111',
  '123-45-6789',
  '999-99-9999',
  '078-05-1120',
]);

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'icloud.com',
  'me.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'comcast.net',
  'msn.com',
]);

const DISPUTE_RE = /\bDISP-(?!SYN-)[0-9]{3,}\b/g;
const SSN_RE = /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g;
const MRN_RE = /\bMRN[\s:#-]*[A-Z0-9]{5,}\b/gi;
const MEMBER_RE =
  /\b(?:patient_)?(?:member|subscriber)(?:_id|Id|\s+id)\b\s*[:=]\s*(['"])[A-Za-z0-9][A-Za-z0-9-]{4,}\1|\b(?:Member|Subscriber)\s+ID\s*:\s*[A-Za-z0-9][A-Za-z0-9-]{4,}/gi;
const DOB_RE =
  /(?:\b[A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+\b[\s\S]{0,80}\b(?:DOB|date of birth)\b[\s\S]{0,40}\b(?:[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})\b)|(?:\b(?:DOB|date of birth)\b[\s\S]{0,40}\b(?:[0-9]{1,2}[/-][0-9]{1,2}[/-][0-9]{2,4}|[0-9]{4}-[0-9]{2}-[0-9]{2})\b[\s\S]{0,80}\b[A-Z][a-z]+\s+(?:[A-Z]\.?\s+)?[A-Z][a-z]+\b)/gi;
const PHONE_RE = /(?:\+?1[\s.\-]?)?(?:\(\d{3}\)|\d{3})[\s.\-]\d{3}[\s.\-]\d{4}/g;
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;
const NPI_RE =
  /\b(?:requesting_provider_npi|servicing_provider_npi|provider_npi|npi)\b\s*[:=]\s*['"]?(\d{10})\b/gi;
const DUMP_NAME_RE = /(?:^|\/)(?:[^/]*\.(?:dump|bak|sqlite|sqlite3)|[^/]*pg_dump[^/]*)$/i;
const DUMP_HEAD_RE = /^(?:PGDMP|--\s*PostgreSQL database dump|MySQL dump)/;

export function loadAllowlist(filePath = ALLOWLIST_PATH) {
  if (!fs.existsSync(filePath)) return new Set();
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const entries = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const rel = trimmed.replace(/\\/g, '/');
    if (PROTECTED_PREFIXES.some((prefix) => rel === prefix.replace(/\/$/, '') || rel.startsWith(prefix))) {
      throw new Error(`PHI allowlist cannot cover IDR content: ${rel}`);
    }
    entries.push(rel);
  }
  return new Set(entries);
}

export function findViolations(text, relPath, allowPhi) {
  const violations = [];
  const normalized = relPath.replace(/\\/g, '/');
  violations.push(...pathViolations(normalized));
  collect(violations, normalized, 'dispute_number', text, DISPUTE_RE, () => true);
  collect(violations, normalized, 'phone', text, PHONE_RE, (sample) => !isFictionalPhone(sample));
  collect(violations, normalized, 'personal_email', text, EMAIL_RE, (sample) => isPersonalEmail(sample));
  collect(violations, normalized, 'ssn', text, SSN_RE, (sample) => !KNOWN_FAKE_SSN.has(sample));
  if (!allowPhi) {
    collect(violations, normalized, 'mrn', text, MRN_RE, () => true);
    collect(violations, normalized, 'member_id', text, MEMBER_RE, () => true);
    collect(violations, normalized, 'dob_with_name', text, DOB_RE, () => true);
    collectNpi(violations, normalized, text);
  }
  if (DUMP_HEAD_RE.test(text.slice(0, 200))) {
    violations.push({ path: normalized, kind: 'db_dump', sample: '[dump]' });
  }
  return violations;
}

export function pathViolations(relPath) {
  const normalized = relPath.replace(/\\/g, '/');
  const violations = [];
  const ext = path.posix.extname(normalized).toLowerCase();
  if (CASE_BIN_EXT.has(ext) && !normalized.startsWith(SYNTHETIC_BIN_DIR)) {
    violations.push({ path: normalized, kind: 'case_binary', sample: '[binary]' });
  }
  if (DUMP_NAME_RE.test(normalized)) {
    violations.push({ path: normalized, kind: 'db_dump', sample: '[dump]' });
  }
  if (normalized.toLowerCase().endsWith('.log')) {
    violations.push({ path: normalized, kind: 'log_file', sample: '[log]' });
  }
  return violations;
}

export function scanRepo(root = ROOT, allowlist = loadAllowlist()) {
  const violations = [];
  walk(root, root, allowlist, violations);
  return violations;
}

function collect(violations, relPath, kind, text, pattern, keep) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const re = new RegExp(pattern.source, flags);
  for (const match of text.matchAll(re)) {
    const sample = match[0];
    if (!keep(sample)) continue;
    violations.push({ path: relPath, kind, sample: redact(kind, sample) });
    if (violations.filter((item) => item.path === relPath && item.kind === kind).length >= 3) break;
  }
}

function collectNpi(violations, relPath, text) {
  const re = new RegExp(NPI_RE.source, NPI_RE.flags.includes('g') ? NPI_RE.flags : `${NPI_RE.flags}g`);
  for (const match of text.matchAll(re)) {
    const npi = match[1];
    if (!npi || isPatternedNpi(npi) || !npiPassesLuhn(npi)) continue;
    violations.push({ path: relPath, kind: 'npi', sample: '##########' });
    if (violations.filter((item) => item.path === relPath && item.kind === 'npi').length >= 3) break;
  }
}

function isFictionalPhone(raw) {
  const digits = raw.replace(/\D/g, '');
  const national = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  if (national.length !== 10) return true;
  const area = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  if (area === '555' || exchange === '555') return true;
  if (national === '1234567890' || national === '0000000000') return true;
  if (/^(\d)\1{9}$/.test(national)) return true;
  return false;
}

function isPersonalEmail(raw) {
  const domain = raw.split('@')[1]?.toLowerCase() ?? '';
  return PERSONAL_EMAIL_DOMAINS.has(domain);
}

function isPatternedNpi(npi) {
  if (!/^\d{10}$/.test(npi)) return true;
  if (new Set(npi).size <= 3) return true;
  const ascending = '012345678901234567890';
  const descending = '987654321098765432109';
  return ascending.includes(npi) || descending.includes(npi);
}

function npiPassesLuhn(npi) {
  const payload = `80840${npi}`;
  let sum = 0;
  let alt = false;
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    let n = payload.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function redact(kind, sample) {
  if (kind === 'dispute_number' || kind === 'phone' || kind === 'ssn') {
    return sample.replace(/\d/g, '#');
  }
  if (kind === 'personal_email') {
    const domain = sample.split('@')[1] ?? '';
    return `[local]@${domain}`;
  }
  return sample.replace(/[A-Za-z]/g, 'X').replace(/\d/g, '#');
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
    const rel = path.relative(root, full).replace(/\\/g, '/');
    violations.push(...pathViolations(rel));
    if (!TEXT_EXT.has(path.extname(entry.name).toLowerCase())) continue;
    const text = fs.readFileSync(full, 'utf8');
    const structural = pathViolations(rel);
    const hits = findViolations(text, rel, allowlist.has(rel)).filter(
      (hit) => !structural.some((item) => item.kind === hit.kind && item.path === hit.path),
    );
    violations.push(...hits);
  }
}

function main() {
  const violations = scanRepo();
  if (violations.length === 0) {
    process.stdout.write('PHI scan passed.\n');
    return;
  }
  process.stderr.write(`PHI scan found ${violations.length} problem(s):\n`);
  for (const hit of violations) {
    process.stderr.write(`${hit.path}: ${hit.kind}: ${hit.sample}\n`);
  }
  process.exitCode = 1;
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) main();
