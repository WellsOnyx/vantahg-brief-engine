import { completeWithTool } from '@/lib/llm';
import { isRealAnthropicEnabled } from '@/lib/env';
import { FACTORS, OBSERVED_WEIGHT_DEFAULTS } from './factors';
import { loadCalibration } from './calibrate';
import type { CaseDocument, EdgeFlag, EvidenceQuote, FactorFinding, FactorGrid, Party } from './types';
import { pageMarkedText } from './pdf-text';

/**
 * Stage 5 — Factor analysis (spec §3, §6): per brief, which of the 7
 * factors the party ACTUALLY RAISES, with evidence quotes and page cites.
 *
 * THE CHECK RULE is the core mechanic: a party gets a factor checked ONLY
 * if their brief raises it. The engine must prove each check with a quote
 * — an unchecked factor needs no proof, a checked one always carries its
 * evidence, because the rationale (§4) must demonstrate the brief was
 * actually read.
 */

const FACTOR_TOOL = {
  name: 'record_factor_analysis',
  description: 'Record which of the 7 IDR factors this brief actually raises. THE CHECK RULE: raised=true ONLY if the brief genuinely argues the factor, and every raised factor MUST carry at least one verbatim supporting quote with its page number. Do not infer factors the brief does not argue.',
  input_schema: {
    type: 'object' as const,
    properties: {
      findings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            factor: { type: 'integer', minimum: 1, maximum: 7 },
            raised: { type: 'boolean' },
            summary: { type: ['string', 'null'], description: 'One sentence: what the party actually argued (null if not raised)' },
            suggested_weight: { type: ['string', 'null'], enum: ['modest weight', 'some weight', 'less weight', null] },
            evidence: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  quote: { type: 'string', description: 'Verbatim quote from the brief (≤240 chars)' },
                  page: { type: 'integer' },
                },
                required: ['quote', 'page'],
              },
            },
          },
          required: ['factor', 'raised', 'evidence'],
        },
      },
    },
    required: ['findings'],
  },
};

function emptyGridSide(): FactorFinding[] {
  return FACTORS.map((f) => ({
    factor: f.factor,
    raised: false,
    evidence: [],
    suggestedWeight: null,
    summary: null,
  }));
}

// ── Heuristic fallback: keyword scan with sentence-level evidence ──────────

function heuristicAnalyzeBrief(brief: CaseDocument): FactorFinding[] {
  const findings = emptyGridSide();
  for (const page of brief.pages) {
    const sentences = page.text.split(/(?<=[.!?])\s+|\n+/);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      for (const def of FACTORS) {
        let scanned = lower;
        for (const neg of def.negations ?? []) scanned = scanned.split(neg).join(' ');
        if (!def.keywords.some((k) => scanned.includes(k))) continue;
        const finding = findings[def.factor - 1];
        finding.raised = true;
        if (finding.evidence.length < 3) {
          finding.evidence.push({ quote: sentence.trim().slice(0, 240), page: page.page, file: brief.file });
        }
        // No summary in heuristic mode — the rationale renders a neutral
        // phrase instead; a keyword note must never enter the paste block.
        finding.suggestedWeight = finding.suggestedWeight ?? OBSERVED_WEIGHT_DEFAULTS[def.factor];
      }
    }
  }
  return findings;
}

/** Few-shot grounding from the calibration corpus (QA-approved cases). */
async function calibrationGrounding(): Promise<string> {
  const cal = await loadCalibration();
  if (!cal || cal.caseCount === 0) return '';
  const usage = Object.entries(cal.weightUsage)
    .map(([factor, u]) => {
      const total = u['modest weight'] + u['some weight'] + u['less weight'];
      if (total === 0) return null;
      const top = (Object.entries(u) as Array<[string, number]>).sort((a, b) => b[1] - a[1])[0][0];
      return `factor ${factor}: most often '${top}' (${total} observed)`;
    })
    .filter(Boolean)
    .join(' · ');
  const exemplar = cal.exemplars[0];
  return (
    `\n\nCALIBRATION (from ${cal.caseCount} QA-approved completed cases — match this demonstrated judgment, not just the format):` +
    (usage ? `\nObserved weight usage: ${usage}.` : '') +
    (exemplar ? `\nExemplar house rationale excerpt:\n"""${exemplar.excerpt.slice(0, 900)}"""` : '')
  );
}

async function llmAnalyzeBrief(brief: CaseDocument, party: Party): Promise<FactorFinding[]> {
  const factorTable = FACTORS.map(
    (f) => `${f.factor}. ${f.title}\n   Typical ${party === 'IP' ? 'IP' : 'NIP'} shape: ${party === 'IP' ? f.ipStandardArgument : f.nipStandardArgument}`,
  ).join('\n');
  const grounding = await calibrationGrounding();

  const { toolInput } = await completeWithTool({
    system:
      `You analyze a federal IDR arbitration brief submitted by the ${party === 'IP' ? 'INITIATING party (the provider)' : 'NON-INITIATING party (the payer/TPA)'}. ` +
      `Decide, for each of the 7 factors below, whether this brief ACTUALLY raises it.\n\n${factorTable}\n\n` +
      'Apply the check rule strictly: raised=true only for factors the brief genuinely argues, each with verbatim quotes and page numbers from the [PAGE n] markers. ' +
      'IP position statements are often STRUCTURED BY FACTOR with headings (e.g., a "did not negotiate in good faith" section) — use the document structure when present. ' +
      "Assign each raised factor one rung of the house weight ladder — 'modest weight' / 'some weight' / 'less weight' — matching observed house usage: " +
      'good-faith negotiation emails = modest weight · acuity operating report = some weight · provider CV/training = less weight. Never fabricate quotes.' +
      grounding,
    user: pageMarkedText(brief.pages),
    tool: FACTOR_TOOL,
    maxTokens: 3072,
  });

  const findings = emptyGridSide();
  const shape = toolInput as {
    findings?: Array<{
      factor: number;
      raised: boolean;
      summary?: string | null;
      suggested_weight?: string | null;
      evidence?: Array<{ quote: string; page: number }>;
    }>;
  };
  for (const f of shape.findings ?? []) {
    if (f.factor < 1 || f.factor > 7) continue;
    const target = findings[f.factor - 1];
    // Check rule enforced structurally: a raised factor without evidence is demoted.
    const evidence: EvidenceQuote[] = (f.evidence ?? []).map((e) => ({ quote: e.quote.slice(0, 240), page: e.page, file: brief.file }));
    target.raised = f.raised && evidence.length > 0;
    target.evidence = target.raised ? evidence : [];
    target.summary = target.raised ? (f.summary ?? null) : null;
    target.suggestedWeight = target.raised
      ? (['modest weight', 'some weight', 'less weight'].includes(f.suggested_weight ?? '')
        ? (f.suggested_weight as FactorFinding['suggestedWeight'])
        : OBSERVED_WEIGHT_DEFAULTS[f.factor as 1 | 2 | 3 | 4 | 5 | 6 | 7])
      : null;
  }
  return findings;
}

/**
 * Missing-evidence check (spec §6): briefs referencing exhibits that are
 * not in the folder — the classic gap a rushed reviewer misses.
 */
function missingExhibitFlags(briefs: CaseDocument[], exhibitCount: number): EdgeFlag[] {
  const flags: EdgeFlag[] = [];
  for (const brief of briefs) {
    const refs = new Set<string>();
    for (const p of brief.pages) {
      for (const m of p.text.matchAll(/exhibit\s+([A-Z0-9]{1,3})\b/gi)) refs.add(m[1].toUpperCase());
    }
    if (refs.size > exhibitCount) {
      flags.push({
        code: 'MISSING_CITED_EXHIBIT',
        severity: 'warn',
        message: `${brief.file} references ${refs.size} exhibit(s) (${[...refs].sort().join(', ')}) but only ${exhibitCount} exhibit file(s) are in the folder — check for missing evidence before crediting those arguments.`,
      });
    }
  }
  return flags;
}

/**
 * ProofofOpenNegotiation files are PRE-LABELED factor-5 evidence — the
 * case-winning factor (§5 of the frame). Their presence is itself the
 * IP raising good-faith negotiation; route them into the IP's factor-5
 * findings with file/page cites (text snippet when the PDF has text,
 * filename cite otherwise).
 */
function applyNegotiationProofs(ip: FactorFinding[], proofs: CaseDocument[]): void {
  if (proofs.length === 0) return;
  const f5 = ip[4];
  f5.raised = true;
  f5.suggestedWeight = f5.suggestedWeight ?? OBSERVED_WEIGHT_DEFAULTS[5];
  if (!f5.summary) f5.summary = `open-negotiation proof (${proofs.length} file${proofs.length > 1 ? 's' : ''}) documenting good-faith negotiation efforts`;
  for (const p of proofs) {
    if (f5.evidence.length >= 6) break;
    const firstText = p.pages.find((pg) => pg.text.trim());
    f5.evidence.push(
      firstText
        ? { quote: firstText.text.trim().slice(0, 240), page: firstText.page, file: p.file }
        : { quote: '(open-negotiation proof — see file)', page: 1, file: p.file },
    );
  }
}

export async function analyzeFactors(
  documents: CaseDocument[],
): Promise<{ grid: FactorGrid; flags: EdgeFlag[]; mode: 'llm' | 'heuristic' }> {
  const ipBrief = documents.find((d) => d.kind === 'ip_brief');
  const nipBrief = documents.find((d) => d.kind === 'nip_brief');
  const exhibits = documents.filter((d) => d.kind === 'exhibit' || d.kind === 'negotiation_proof');
  const proofs = documents.filter((d) => d.kind === 'negotiation_proof');
  const flags = missingExhibitFlags([ipBrief, nipBrief].filter((b): b is CaseDocument => !!b), exhibits.length);

  const llm = isRealAnthropicEnabled();
  const analyze = async (brief: CaseDocument | undefined, party: Party): Promise<FactorFinding[]> => {
    if (!brief) return emptyGridSide(); // MISSING_DOC flag already fired in classify
    return llm ? llmAnalyzeBrief(brief, party) : heuristicAnalyzeBrief(brief);
  };

  const [ip, nip] = await Promise.all([analyze(ipBrief, 'IP'), analyze(nipBrief, 'NIP')]);
  applyNegotiationProofs(ip, proofs);
  return { grid: { ip, nip }, flags, mode: llm ? 'llm' : 'heuristic' };
}
