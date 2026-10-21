import { formatCents } from './money';
import { renderPartyParagraph } from './factors';
import type {
  DraftPacket,
  FactorEvidence,
  Figure,
  IntakeRecord,
  NipBranch,
  Party,
  QaChecklist,
  TemplateFile,
} from './types';
import { templateKey, nipTemplateId } from './load';

export interface ComposeOk {
  ok: true;
  packet: DraftPacket;
}

export interface ComposeStop {
  ok: false;
  code: 'wrong_template' | 'draft_structure';
  message: string;
}

const SLOT_KEYS = ['chart_paragraph', 'ip_paragraph', 'nip_paragraph', 'winner_paragraph'] as const;

export function templateMatchesCase(
  template: TemplateFile,
  party: Party,
  brief: IntakeRecord['nip_brief'],
  shape: IntakeRecord['shape'],
  nipBranch: NipBranch | null,
): boolean {
  if (template.party_variant !== party) return false;
  if (party === 'IP') {
    const qpa = shape === 'single' ? 'single' : 'batch';
    return (
      nipBranch === null &&
      template.nip_branch === 'none' &&
      template.id === templateKey('IP', brief, shape) &&
      template.nip_brief === brief &&
      template.dispute_shape === shape &&
      template.qpa_wording === qpa
    );
  }
  if (!nipBranch) return false;
  if (template.id !== nipTemplateId(nipBranch) || template.nip_branch !== nipBranch) return false;
  if (template.dispute_shape !== 'any' && template.dispute_shape !== shape) return false;
  const qpa = shape === 'single' ? 'single' : 'batch';
  if (template.qpa_wording !== 'any' && template.qpa_wording !== qpa) return false;
  return true;
}

export function buildDraftParagraphs(input: {
  checklist: QaChecklist;
  intake: IntakeRecord;
  figures: readonly Figure[];
  factors: readonly FactorEvidence[];
  prevailingParty: Party;
  reason: string;
}): { ok: true; chart: string; ip: string; nip: string; winner: string } | { ok: false; message: string } {
  const chart = chartParagraph(input.checklist, input.intake, input.figures);
  const ip = renderPartyParagraph(input.factors, 'IP');
  const nip = renderPartyParagraph(input.factors, 'NIP');
  const winner = `prevailing_party:${input.prevailingParty} reason:${input.reason.replace(/\s+/g, ' ').trim()}`;
  for (const [name, value] of [
    ['chart', chart],
    ['IP', ip],
    ['NIP', nip],
    ['winner', winner],
  ] as const) {
    if (!value.trim() || /[\r\n]/.test(value) || value.includes('{{')) {
      return { ok: false, message: `${name} paragraph is not a single filled paragraph.` };
    }
  }
  return { ok: true, chart, ip, nip, winner };
}

export function composeDraft(input: {
  template: TemplateFile;
  checklist: QaChecklist;
  intake: IntakeRecord;
  figures: readonly Figure[];
  factors: readonly FactorEvidence[];
  prevailingParty: Party;
  reason: string;
  nipBranch: NipBranch | null;
  chartParagraph: string;
  ipParagraph: string;
  nipParagraph: string;
  winnerParagraph: string;
}): ComposeOk | ComposeStop {
  const { template, checklist, intake, prevailingParty, reason, nipBranch } = input;
  if (!templateMatchesCase(template, prevailingParty, intake.nip_brief, intake.shape, nipBranch)) {
    return {
      ok: false,
      code: 'wrong_template',
      message: `Template ${template.id} does not match this dispute. Wrong template is a blocking error.`,
    };
  }
  const values = [input.chartParagraph, input.ipParagraph, input.nipParagraph, input.winnerParagraph];
  const marker = checklist.slots.live_text_marker;
  const rendered: string[] = [];
  for (let index = 0; index < SLOT_KEYS.length; index += 1) {
    const expected = `${marker}\n{{${SLOT_KEYS[index]}}}`;
    if (template.paragraphs[index] !== expected) {
      return { ok: false, code: 'draft_structure', message: 'Template shell is not the live-text placeholder.' };
    }
    const value = values[index];
    if (!value || /[\r\n]/.test(value) || value.includes('{{')) {
      return { ok: false, code: 'draft_structure', message: 'A determination paragraph still has an unresolved template marker.' };
    }
    rendered.push(value);
  }
  const paragraphs = rendered as [string, string, string, string];
  return {
    ok: true,
    packet: {
      text: paragraphs.join('\n\n'),
      paragraphs,
      paragraph_roles: ['chart', 'ip', 'nip', 'winner'],
      nip_branch: nipBranch,
      prevailing_party: prevailingParty,
      reason,
      stamps: {
        template_id: template.id,
        template_version: template.version,
        template_path: template.path,
        checklist_version: checklist.version,
        checklist_path: checklist.path,
      },
    },
  };
}

function chartParagraph(checklist: QaChecklist, intake: IntakeRecord, figures: readonly Figure[]): string {
  const primaryId = intake.line_items[0]?.line_id ?? '';
  const link = checklist.slots.batch_line_link;
  return intake.line_items
    .map((item, index) => {
      const ip = figureText(figures, item.line_id, 'ip_offer');
      const nip = figureText(figures, item.line_id, 'nip_offer');
      const qpa = figureText(figures, item.line_id, 'qpa');
      const same = index === 0 ? '' : ` ${link} ${primaryId}`;
      const brief = index === 0 ? ` nip_brief:${intake.nip_brief}` : '';
      return `line:${item.line_id}${same} ip_offer:${ip} nip_offer:${nip} qpa:${qpa}${brief}`;
    })
    .join(' ');
}

function figureText(figures: readonly Figure[], lineId: string, kind: Figure['kind']): string {
  const figure = figures.find((item) => item.line_id === lineId && item.kind === kind);
  if (!figure || figure.status !== 'present' || figure.amount_cents === null) return 'MISSING';
  return formatCents(figure.amount_cents);
}
