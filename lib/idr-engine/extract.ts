import { completeWithTool } from '@/lib/llm';
import { isRealAnthropicEnabled } from '@/lib/env';
import type { CaseDocument, CaseRecord, EdgeFlag, OfferLine } from './types';
import { fullText, pageMarkedText } from './pdf-text';

/**
 * Stage 3 — Extract (spec §6): parties, CPT codes, per-line FINAL PAYMENT
 * OFFERS both sides ('the whole kit and caboodle'), QPA, dates of service,
 * batch flag.
 *
 * LLM tool-use when real Anthropic is enabled; deterministic regex
 * fallback otherwise (same doctrine as the eFax extractor). The fallback
 * NEVER invents values — anything it can't find is null plus an
 * EXTRACTION_GAP flag, because a wrong number on an offer line is worse
 * than a blank the reviewer fills from the documents.
 *
 * QPA is extracted and displayed but never used as an anchor (§2 — 'a
 * dumb number', supplied by the NIP in their own interest).
 */

const EXTRACT_TOOL = {
  name: 'record_idr_case',
  description: 'Record the structured facts of one IDR arbitration case exactly as stated in the documents. Never guess: use null for anything not explicitly stated.',
  input_schema: {
    type: 'object' as const,
    properties: {
      dispute_number: { type: ['string', 'null'], description: 'CMS dispute number, e.g. DISP-123456' },
      ip_name: { type: ['string', 'null'], description: 'Initiating party (provider) name as written' },
      nip_name: { type: ['string', 'null'], description: 'Non-initiating party (payer/TPA) name as written' },
      qpa: { type: ['number', 'null'], description: 'Qualifying Payment Amount in dollars, if stated' },
      batch: { type: 'boolean', description: 'True if this is a batched dispute with multiple line items' },
      lines: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            line: { type: 'integer' },
            cpt: { type: ['string', 'null'] },
            description: { type: ['string', 'null'] },
            date_of_service: { type: ['string', 'null'] },
            ip_offer: { type: ['number', 'null'], description: 'IP final payment offer for this line, dollars' },
            nip_offer: { type: ['number', 'null'], description: 'NIP final payment offer for this line, dollars' },
          },
          required: ['line'],
        },
      },
    },
    required: ['batch', 'lines'],
  },
};

function offerDocsText(documents: CaseDocument[]): string {
  return documents
    .filter((d) => d.kind === 'ip_offer' || d.kind === 'nip_offer')
    .map((d) => `=== ${d.kind.toUpperCase()} (${d.file}) ===\n${pageMarkedText(d.pages)}`)
    .join('\n\n');
}

// ── Heuristic fallback ─────────────────────────────────────────────────────

const CPT_RE = /\b(\d{4}[0-9A-Z])\b/g;
const MONEY_RE = /\$\s?([\d,]+(?:\.\d{2})?)/g;

function money(s: string): number {
  return Number(s.replace(/,/g, ''));
}

function heuristicOffers(doc: CaseDocument | undefined): number[] {
  if (!doc) return [];
  const out: number[] = [];
  for (const p of doc.pages) {
    // Only take dollar amounts on lines that talk about an offer — never
    // stray amounts (billed charges, QPA, fees).
    for (const lineText of p.text.split(/(?<=[.;])\s+|\n/)) {
      if (!/offer/i.test(lineText)) continue;
      for (const m of lineText.matchAll(MONEY_RE)) out.push(money(m[1]));
    }
  }
  return out;
}

function heuristicExtract(caseId: string, documents: CaseDocument[]): CaseRecord {
  const flags: EdgeFlag[] = [];
  const all = documents.map((d) => fullText(d.pages)).join('\n');

  const dispute = all.match(/\b(DISP-\d{4,})\b/i)?.[1] ?? null;
  const qpaMatch = all.match(/(?:QPA|qualifying payment amount)[^$]{0,80}\$\s?([\d,]+(?:\.\d{2})?)/i);
  const qpa = qpaMatch ? money(qpaMatch[1]) : null;

  const cpts = [...new Set([...all.matchAll(CPT_RE)].map((m) => m[1]).filter((c) => /^[0-9]{4}[0-9A-Z]$/.test(c)))]
    .filter((c) => !/^(19|20)\d\d.$/.test(c)); // years are not CPT codes

  const ipOffers = heuristicOffers(documents.find((d) => d.kind === 'ip_offer'));
  const nipOffers = heuristicOffers(documents.find((d) => d.kind === 'nip_offer'));
  const lineCount = Math.max(ipOffers.length, nipOffers.length, 1);

  const lines: OfferLine[] = Array.from({ length: lineCount }, (_, i) => ({
    line: i + 1,
    cpt: cpts[i] ?? cpts[0] ?? null,
    description: null,
    dateOfService: null,
    ipOffer: ipOffers[i] ?? null,
    nipOffer: nipOffers[i] ?? null,
  }));

  for (const l of lines) {
    if (l.ipOffer === null || l.nipOffer === null) {
      flags.push({
        code: 'EXTRACTION_GAP',
        severity: 'block',
        line: l.line,
        message: `Line ${l.line}: could not extract ${l.ipOffer === null ? 'IP' : ''}${l.ipOffer === null && l.nipOffer === null ? ' and ' : ''}${l.nipOffer === null ? 'NIP' : ''} offer — fill from the notice(s) of offer before deciding.`,
      });
    }
  }

  return {
    caseId,
    disputeNumber: dispute,
    ipName: null,
    nipName: null,
    qpa,
    batch: lineCount > 1,
    lines,
    flags,
    extractionMode: 'heuristic',
  };
}

// ── LLM path ───────────────────────────────────────────────────────────────

interface LlmExtractShape {
  dispute_number?: string | null;
  ip_name?: string | null;
  nip_name?: string | null;
  qpa?: number | null;
  batch?: boolean;
  lines?: Array<{
    line: number;
    cpt?: string | null;
    description?: string | null;
    date_of_service?: string | null;
    ip_offer?: number | null;
    nip_offer?: number | null;
  }>;
}

export async function extractCaseRecord(caseId: string, documents: CaseDocument[]): Promise<CaseRecord> {
  if (!isRealAnthropicEnabled()) {
    const rec = heuristicExtract(caseId, documents);
    rec.flags.unshift({
      code: 'HEURISTIC_MODE',
      severity: 'warn',
      message: 'LLM disabled — extraction ran on deterministic heuristics only. Verify every field against the documents.',
    });
    return rec;
  }

  const { toolInput } = await completeWithTool({
    system:
      'You extract structured facts from federal IDR (No Surprises Act) arbitration documents. ' +
      'Record ONLY what the documents explicitly state; use null for anything absent or ambiguous. ' +
      'The per-line final payment offers from each notice of offer are the critical fields. ' +
      'Offers are usually identical across batch lines but NOT always — read every line.',
    user: offerDocsText(documents) || 'No offer documents were classified in this folder.',
    tool: EXTRACT_TOOL,
    maxTokens: 2048,
  });

  const x = toolInput as LlmExtractShape;
  const flags: EdgeFlag[] = [];
  const lines: OfferLine[] = (x.lines ?? []).map((l, i) => ({
    line: l.line ?? i + 1,
    cpt: l.cpt ?? null,
    description: l.description ?? null,
    dateOfService: l.date_of_service ?? null,
    ipOffer: typeof l.ip_offer === 'number' ? l.ip_offer : null,
    nipOffer: typeof l.nip_offer === 'number' ? l.nip_offer : null,
  }));
  if (lines.length === 0) lines.push({ line: 1, cpt: null, description: null, dateOfService: null, ipOffer: null, nipOffer: null });

  for (const l of lines) {
    if (l.ipOffer === null || l.nipOffer === null) {
      flags.push({
        code: 'EXTRACTION_GAP',
        severity: 'block',
        line: l.line,
        message: `Line ${l.line}: offer(s) not stated in the documents the engine read — fill from the notices before deciding.`,
      });
    }
  }

  return {
    caseId,
    disputeNumber: x.dispute_number ?? null,
    ipName: x.ip_name ?? null,
    nipName: x.nip_name ?? null,
    qpa: typeof x.qpa === 'number' ? x.qpa : null,
    batch: x.batch ?? lines.length > 1,
    lines,
    flags,
    extractionMode: 'llm',
  };
}
