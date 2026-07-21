import type { CaseDocument, DocKind, EdgeFlag, PageText } from './types';
import { fullText } from './pdf-text';

/**
 * Stage 2 — Classify (spec §6): sort a case folder into the FOUR documents
 * that matter (IP offer / NIP offer / IP brief / NIP brief), exhibits, and
 * CMS-generated compliance filler. Deterministic filename+content
 * heuristics — classification must be reproducible and explainable, so no
 * LLM in this stage. A MISSING_DOC flag fires for any absent core doc.
 */

const CORE_KINDS: DocKind[] = ['ip_offer', 'nip_offer', 'ip_brief', 'nip_brief'];

const CMS_FILLER_PATTERNS = [
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

  for (const p of CMS_FILLER_PATTERNS) {
    if (p.test(name) || p.test(text)) return { kind: 'cms_filler', reason: `matches CMS filler pattern ${p}` };
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
