import type { CaseDocument, DocKind, EdgeFlag, PageText } from './types';
import { fullText } from './pdf-text';

/**
 * Stage 2 — Classify (spec §6 + live-portal folder taxonomy): cases arrive
 * as ZIPs of up to ~60 files. Beyond the FOUR documents that matter
 * (IP/NIP notice of offer, IP/NIP brief), the real folders contain a known
 * long tail — classified deterministically by filename first, content
 * second, because classification must be reproducible and explainable:
 *
 *   IDRNoticeOfInitiation / IDR (Re)Selection Response Form /
 *   idr-coversheet(.docx) / ProofofCoolingOffPeriod /
 *   ProofofIncorrectlyBatched(.csv)          → cms_filler (ignored)
 *   ProofofOpenNegotiation*(.pdf), multiple  → negotiation_proof — these
 *     are PRE-LABELED factor-5 evidence (the case-winning factor) and are
 *     routed straight into factor-5 analysis.
 *   *eligibility*notes*                      → eligibility_notes (surfaced
 *     on the sheet; the portal's staff-notes grid must be read either way)
 *
 * A MISSING_DOC flag fires for any absent core doc. Files we can't read
 * (.docx/.csv/images) are still inventoried and classified by name.
 */

const CORE_KINDS: DocKind[] = ['ip_offer', 'nip_offer', 'ip_brief', 'nip_brief'];

const FILLER_NAME_PATTERNS: RegExp[] = [
  /idr\s*notice\s*of\s*initiation|idrnoticeofinitiation/i,
  /idr\s*(re)?selection\s*response\s*form/i,
  /idr[-_ ]?coversheet/i,
  /proof\s*of\s*cooling\s*off|proofofcoolingoff/i,
  /proof\s*of\s*incorrectly\s*batched|proofofincorrectlybatched/i,
];

const FILLER_CONTENT_PATTERNS: RegExp[] = [
  /certified.*idr.*entity.*selection/i,
  /notice of.*idr.*initiation/i,
  /administrative fee/i,
  /acknowledg(e)?ment of receipt/i,
  /eligibility review/i,
];

interface Scored {
  kind: DocKind;
  reason: string;
}

function classifyOne(fileName: string, pages: PageText[]): Scored {
  const name = fileName.toLowerCase();
  const text = fullText(pages).toLowerCase().slice(0, 8000);

  // Pre-labeled by filename — the taxonomy the folders actually use.
  if (/proof\s*of\s*open\s*negotiation|proofofopennegotiation/i.test(name)) {
    return { kind: 'negotiation_proof', reason: 'ProofofOpenNegotiation — pre-labeled factor-5 evidence' };
  }
  if (/eligibilit/.test(name) && /note/.test(name)) {
    return { kind: 'eligibility_notes', reason: 'eligibility-notes export' };
  }
  for (const p of FILLER_NAME_PATTERNS) {
    if (p.test(name)) return { kind: 'cms_filler', reason: `known compliance-filler filename (${p})` };
  }

  const isIp = /initiating|(^|[^a-z])ip([^a-z]|$)|provider/i;
  const nipHit = /non[- _]?initiating|(^|[^a-z])nip([^a-z]|$)/.test(name) || /non-initiating party/.test(text);
  const ipHit = !nipHit && (isIp.test(name) || /initiating party/.test(text));

  const offerHit = /notice[ _-]*of[ _-]*offer|offer/.test(name) || /notice of offer|final (payment )?offer/.test(text);
  const briefHit = /brief|statement|position/.test(name) || /arbitration brief|written statement|position statement/.test(text);

  if (offerHit && !briefHit) {
    if (nipHit) return { kind: 'nip_offer', reason: 'notice-of-offer + non-initiating markers' };
    if (ipHit) return { kind: 'ip_offer', reason: 'notice-of-offer + initiating markers' };
  }
  if (briefHit) {
    if (nipHit) return { kind: 'nip_brief', reason: 'brief + non-initiating markers' };
    if (ipHit) return { kind: 'ip_brief', reason: 'brief + initiating markers' };
  }

  for (const p of FILLER_CONTENT_PATTERNS) {
    if (p.test(text)) return { kind: 'cms_filler', reason: `matches CMS filler pattern ${p}` };
  }

  if (/eob|explanation of benefits|operative|operating report|(^|[^a-z])cv([^a-z]|$)|curriculum|exhibit|email/i.test(name)
    || /explanation of benefits|operative report|curriculum vitae/.test(text)) {
    return { kind: 'exhibit', reason: 'exhibit markers (EOB / op report / CV / email)' };
  }

  if (offerHit) return { kind: 'unknown', reason: 'offer markers but party unclear — needs human look' };
  return { kind: 'unknown', reason: 'no classification markers matched' };
}

export function classifyDocuments(
  files: Array<{ file: string; pages: PageText[] }>,
): { documents: CaseDocument[]; flags: EdgeFlag[] } {
  const documents: CaseDocument[] = files.map(({ file, pages }) => {
    const { kind, reason } = classifyOne(file, pages);
    return { file, kind, pages, classificationReason: reason };
  });

  const flags: EdgeFlag[] = [];
  for (const kind of CORE_KINDS) {
    if (!documents.some((d) => d.kind === kind)) {
      flags.push({
        code: 'MISSING_DOC',
        severity: 'block',
        message: `Core document missing or unrecognized: ${kind.replace('_', ' ')}. Verify the folder before relying on this sheet.`,
      });
    }
  }
  for (const d of documents) {
    if (d.kind === 'unknown') {
      flags.push({
        code: 'EXTRACTION_GAP',
        severity: 'warn',
        message: `Could not classify "${d.file}" (${d.classificationReason}) — treated as neither core doc nor exhibit.`,
      });
    }
  }
  return { documents, flags };
}
