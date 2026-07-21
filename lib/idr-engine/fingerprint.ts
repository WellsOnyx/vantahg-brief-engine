import crypto from 'crypto';
import { readFile, writeFile } from 'fs/promises';
import type { CaseDocument, EdgeFlag, FingerprintResult, Party } from './types';
import { fullText } from './pdf-text';

/**
 * Stage 4 — Template fingerprint (spec §5), Phase 0 STUB.
 *
 * A QA insight from live operations, industrialized: payers reuse one brief template for
 * months or years, then quietly slip in a new exhibit or an extra
 * paragraph — and arbiters go lazy on the familiar shell exactly when
 * they shouldn't. The engine never gets lazy where humans do.
 *
 * Three-layer signature per brief:
 *   - contentHash — full normalized text → this exact instantiation.
 *   - shellHash   — text with numbers/dates/amounts/case ids stripped →
 *                   the reusable TEMPLATE. Case-specific values changing
 *                   between filings is NORMAL and stays quiet.
 *   - shellTokens — unique word set of the shell, for near-match: a
 *                   changed/added paragraph inside a familiar template is
 *                   precisely the lazy-arbiter trap → DEVIATION, loud.
 *
 * Match logic:
 *   exact shellHash + same exhibit count       → known_template (quiet)
 *   exact shellHash + exhibit count shifted    → DEVIATION
 *   no exact match but ≥80% token similarity   → DEVIATION (content changed
 *                                                within a known shell)
 *   otherwise                                  → new_template, auto-registered
 *
 * The seed library is the QA team's v3 template catalog — it arrives
 * later as a document and is ingested into the same JSON this stub
 * reads/writes (entries carry a factorMap slot for its pre-mapped factor
 * selections). Until then the library self-populates from cases as they run.
 */

export interface TemplateLibraryEntry {
  id: string;
  label: string;
  party: Party;
  shellHash: string;
  shellTokens: string[];
  contentHashes: string[]; // instantiations seen (numbers/dates vary — expected)
  exhibitCounts: number[]; // exhibit-folder sizes seen alongside this template
  factorMap: number[] | null; // pre-mapped factor selections (from the seed catalog, later)
  seenCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface TemplateLibrary {
  version: string;
  templates: TemplateLibraryEntry[];
}

const SIMILARITY_THRESHOLD = 0.8;

function sha(text: string): string {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Strip everything case-specific so only the template shell remains. */
function shellOf(text: string): string {
  return normalize(text)
    .replace(/\$\s?[\d,]+(?:\.\d{2})?/g, '<amt>')
    .replace(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g, '<date>')
    .replace(/\bdisp-\d+\b/g, '<disp>')
    .replace(/\b\d+\b/g, '<n>');
}

function tokensOf(shell: string): string[] {
  return [...new Set(shell.split(/[^a-z<>]+/).filter((t) => t.length > 2))].sort();
}

function jaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  const setB = new Set(b);
  const inter = a.filter((t) => setB.has(t)).length;
  return inter / (a.length + b.length - inter);
}

export async function loadLibrary(path: string): Promise<TemplateLibrary> {
  try {
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as TemplateLibrary;
    return { version: parsed.version ?? 'phase0-stub', templates: parsed.templates ?? [] };
  } catch {
    return { version: 'phase0-stub', templates: [] };
  }
}

export async function saveLibrary(path: string, lib: TemplateLibrary): Promise<void> {
  await writeFile(path, JSON.stringify(lib, null, 2), 'utf-8');
}

export function fingerprintBrief(
  brief: CaseDocument,
  party: Party,
  exhibitCount: number,
  library: TemplateLibrary,
  now = new Date().toISOString(),
): { result: FingerprintResult; flag: EdgeFlag | null } {
  const text = fullText(brief.pages);
  const contentHash = sha(normalize(text));
  const shell = shellOf(text);
  const shellHash = sha(shell);
  const shellTokens = tokensOf(shell);

  const base = { file: brief.file, party, contentHash, shellHash };

  const exact = library.templates.find((t) => t.shellHash === shellHash && t.party === party);
  if (exact) {
    exact.seenCount += 1;
    exact.lastSeen = now;
    if (!exact.contentHashes.includes(contentHash)) exact.contentHashes.push(contentHash);

    if (!exact.exhibitCounts.includes(exhibitCount)) {
      const seen = exact.exhibitCounts.join('/');
      exact.exhibitCounts.push(exhibitCount);
      return {
        result: {
          ...base,
          status: 'DEVIATION',
          templateId: exact.id,
          detail: `Known template ${exact.id} (seen ${exact.seenCount}×) but the exhibit count shifted (previously ${seen}, now ${exhibitCount}) — something was added or removed alongside a familiar shell.`,
        },
        flag: {
          code: 'TEMPLATE_DEVIATION',
          severity: 'block',
          message: `🚨 DEVIATION — ${brief.file} is known template ${exact.id} (seen ${exact.seenCount}×) with a SHIFTED EXHIBIT COUNT (${seen} → ${exhibitCount}). This is the lazy-arbiter trap: READ THIS BRIEF AND EVERY EXHIBIT IN FULL.`,
        },
      };
    }

    return {
      result: {
        ...base,
        status: 'known_template',
        templateId: exact.id,
        detail: `Matches known template ${exact.id}, seen ${exact.seenCount}× (case-specific values differ as expected)${exact.factorMap ? ` — pre-mapped factors: ${exact.factorMap.join(', ')}` : ''}.`,
      },
      flag: null,
    };
  }

  // Near-match: familiar shell whose CONTENT moved — the loud case (§5).
  let best: { entry: TemplateLibraryEntry; sim: number } | null = null;
  for (const t of library.templates) {
    if (t.party !== party) continue;
    const sim = jaccard(shellTokens, t.shellTokens);
    if (sim >= SIMILARITY_THRESHOLD && (!best || sim > best.sim)) best = { entry: t, sim };
  }
  if (best) {
    best.entry.seenCount += 1;
    best.entry.lastSeen = now;
    return {
      result: {
        ...base,
        status: 'DEVIATION',
        templateId: best.entry.id,
        detail: `${Math.round(best.sim * 100)}% similar to known template ${best.entry.id} but the wording changed — a paragraph was added, removed, or edited inside a familiar shell.`,
      },
      flag: {
        code: 'TEMPLATE_DEVIATION',
        severity: 'block',
        message: `🚨 DEVIATION — ${brief.file} is ${Math.round(best.sim * 100)}% similar to known template ${best.entry.id} but the WORDING CHANGED. This is the lazy-arbiter trap: READ THIS BRIEF IN FULL and diff it against the familiar version.`,
      },
    };
  }

  const id = `tmpl-${shellHash.slice(0, 12)}`;
  library.templates.push({
    id,
    label: `Auto-registered from ${brief.file}`,
    party,
    shellHash,
    shellTokens,
    contentHashes: [contentHash],
    exhibitCounts: [exhibitCount],
    factorMap: null,
    seenCount: 1,
    firstSeen: now,
    lastSeen: now,
  });
  return {
    result: {
      ...base,
      status: 'new_template',
      templateId: id,
      detail: 'First sighting — auto-registered into the template library.',
    },
    flag: null,
  };
}
