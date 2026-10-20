import { templateKey } from './load';
import { formatCents } from './money';
import type {
  DraftPacket,
  Figure,
  IntakeRecord,
  Party,
  QaChecklist,
  TemplateFile,
} from './types';

export interface ComposeOk {
  ok: true;
  packet: DraftPacket;
}

export interface ComposeStop {
  ok: false;
  code: 'wrong_template' | 'draft_structure';
  message: string;
}

export function templateMatchesCase(
  template: TemplateFile,
  party: Party,
  brief: IntakeRecord['nip_brief'],
  shape: IntakeRecord['shape'],
): boolean {
  const qpa = shape === 'single' ? 'single' : 'batch';
  return (
    template.id === templateKey(party, brief, shape) &&
    template.party_variant === party &&
    template.nip_brief === brief &&
    template.dispute_shape === shape &&
    template.qpa_wording === qpa
  );
}

export function composeDraft(input: {
  template: TemplateFile;
  checklist: QaChecklist;
  intake: IntakeRecord;
  figures: readonly Figure[];
  factorBlock: string;
  prevailingParty: Party;
  reason: string;
}): ComposeOk | ComposeStop {
  const { template, checklist, intake, figures, factorBlock, prevailingParty, reason } = input;
  if (!templateMatchesCase(template, prevailingParty, intake.nip_brief, intake.shape)) {
    return {
      ok: false,
      code: 'wrong_template',
      message: `Template ${template.id} does not match this dispute. Wrong template is a blocking error.`,
    };
  }
  if (factorBlock.includes('\n') || factorBlock.includes('{{')) {
    return { ok: false, code: 'draft_structure', message: 'Factor block is not a single paragraph.' };
  }
  const vars = placeholderValues(intake, figures, factorBlock, reason);
  const text = template.body.replace(/\{\{([a-z0-9_]+)\}\}/g, (full, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return full;
    return vars[key];
  });
  if (text.includes('{{') || text.includes('}}')) {
    return { ok: false, code: 'draft_structure', message: 'The draft still has unresolved template markers.' };
  }
  const parts = text.split(/\n\s*\n/).map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    return { ok: false, code: 'draft_structure', message: 'The draft is not four paragraphs.' };
  }
  return {
    ok: true,
    packet: {
      text,
      paragraphs: [parts[0], parts[1], parts[2], parts[3]],
      factor_block: factorBlock,
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

function placeholderValues(
  intake: IntakeRecord,
  figures: readonly Figure[],
  factorBlock: string,
  reason: string,
): Record<string, string> {
  const base: Record<string, string> = {
    dispute_ref: intake.dispute_ref,
    factor_block: factorBlock,
    reason,
    line_count: String(intake.line_items.length),
  };
  if (intake.shape === 'single') {
    const lineId = intake.line_items[0].line_id;
    return {
      ...base,
      ip_offer: figureText(figures, lineId, 'ip_offer'),
      nip_offer: figureText(figures, lineId, 'nip_offer'),
      qpa: figureText(figures, lineId, 'qpa'),
    };
  }
  return {
    ...base,
    offer_lines: intake.line_items
      .map((item) => {
        const ip = figureText(figures, item.line_id, 'ip_offer');
        const nip = figureText(figures, item.line_id, 'nip_offer');
        const qpa = figureText(figures, item.line_id, 'qpa');
        return `Line ${item.line_id}, initiating party offer ${ip}, non-initiating party offer ${nip}, qualifying payment amount ${qpa}.`;
      })
      .join(' '),
  };
}

function figureText(figures: readonly Figure[], lineId: string, kind: Figure['kind']): string {
  const figure = figures.find((item) => item.line_id === lineId && item.kind === kind);
  if (!figure || figure.status !== 'present' || figure.amount_cents === null) return 'MISSING';
  return formatCents(figure.amount_cents);
}
