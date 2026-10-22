import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNeverSubmitSource } from '@/lib/idr-assist';
import {
  advanceToReadyForReview,
  buildDraftParagraphs,
  buildFactorEvidence,
  composeDraft,
  detectIntake,
  evaluateGates,
  extractFigures,
  gateFailed,
  loadIdrCatalog,
  prepareDetermination,
  signDetermination,
  submitDetermination,
  templateKey,
  type DraftPacket,
  type GateResult,
} from '@/lib/idr/determination';
import { deps, idrActor, singleRequest } from './fixture';

function readyDraft() {
  const catalog = loadIdrCatalog();
  const request = singleRequest();
  const detected = detectIntake(request);
  if (!detected.ok) throw new Error(detected.message);
  const figures = extractFigures(request);
  const factors = buildFactorEvidence(request, catalog.checklist);
  const template = catalog.byId.get(templateKey('IP', 'present', 'single'));
  if (!template) throw new Error('missing template');
  const built = buildDraftParagraphs({
    checklist: catalog.checklist,
    intake: detected.intake,
    figures,
    factors,
    prevailingParty: 'IP',
    reason: request.reason ?? '',
  });
  if (!built.ok) throw new Error(built.message);
  const composed = composeDraft({
    template,
    checklist: catalog.checklist,
    intake: detected.intake,
    figures,
    factors,
    prevailingParty: 'IP',
    reason: request.reason ?? '',
    nipBranch: null,
    chartParagraph: built.chart,
    ipParagraph: built.ip,
    nipParagraph: built.nip,
    winnerParagraph: built.winner,
  });
  if (!composed.ok) throw new Error(composed.message);
  return { catalog, request, detected: detected.intake, figures, factors, template, packet: composed.packet };
}

function gatesFor(packet: DraftPacket, base = readyDraft()): GateResult[] {
  return evaluateGates({
    checklist: base.catalog.checklist,
    template: base.template,
    intake: base.detected,
    figures: base.figures,
    factors: base.factors,
    documents: base.request.documents,
    packet,
  });
}

describe('QA hard-stop gates', () => {
  it('passes a clean single-dispute draft', () => {
    const base = readyDraft();
    const gates = gatesFor(base.packet, base);
    expect(gates.every((gate) => gate.pass)).toBe(true);
    expect(base.packet.paragraph_roles).toEqual(['chart', 'ip', 'nip', 'winner']);
    expect(base.packet.paragraphs).toHaveLength(4);
    expect(base.packet.paragraphs[0]).not.toBe(base.packet.paragraphs[1]);
    expect(base.packet.paragraphs[1]).not.toBe(base.packet.paragraphs[2]);
    expect(base.packet.paragraphs[3]).toContain('prevailing_party:IP');
    expect(base.packet.stamps.template_version).toBe(base.template.version);
    expect(base.packet.stamps.checklist_version).toBe(base.catalog.checklist.version);
  });

  it('blocks a template that does not match the dispute', () => {
    const base = readyDraft();
    const packet: DraftPacket = {
      ...base.packet,
      stamps: { ...base.packet.stamps, template_id: 'nip-zero-offer' },
    };
    const gates = gatesFor(packet, base);
    expect(gateFailed(gates, 'template_match')).toBe(true);
  });

  it('blocks CPT codes and argument in the acuity note', () => {
    const base = readyDraft();
    const narrative = 'On acuity and complexity, CPT 99285 warrants a higher offer.';
    const factors = base.factors.map((factor) =>
      factor.factor_id === 'acuity_complexity' ? { ...factor, narrative } : factor,
    );
    const packet: DraftPacket = {
      ...base.packet,
      text: base.packet.text.replace(base.catalog.checklist.phrases.acuity_both, narrative),
    };
    const gates = evaluateGates({ ...context(base), factors, packet });
    expect(gateFailed(gates, 'no_cpt_in_acuity')).toBe(true);
    const advanced = advanceToReadyForReview(
      idrActor(),
      base.request,
      { ...base, factors, packet, intake: base.detected },
      deps({ catalog: base.catalog }),
    );
    expect(advanced.status).not.toBe('ready_for_review');
    expect(advanced.clean_text).toBeNull();
    expect(advanced.signed).toBe(false);
  });

  it('blocks training text that is not in the curriculum vitae file', () => {
    const base = readyDraft();
    const factors = base.factors.map((factor) =>
      factor.factor_id === 'training_experience'
        ? {
            ...factor,
            ip: { ...factor.ip, board_certification: 'Not in the file.', excerpt_in_file: false },
            ip_narrative: factor.ip_narrative.replace('board certification', 'Not in the file.'),
          }
        : factor,
    );
    const packet: DraftPacket = {
      ...base.packet,
      text: base.packet.text.replace('board certification', 'Not in the file.'),
      paragraphs: [
        base.packet.paragraphs[0],
        base.packet.paragraphs[1].replace('board certification', 'Not in the file.'),
        base.packet.paragraphs[2],
        base.packet.paragraphs[3],
      ],
    };
    const gates = evaluateGates({ ...context(base), factors, packet });
    expect(gateFailed(gates, 'cv_from_file')).toBe(true);
    expect(gates.find((gate) => gate.id === 'cv_from_file')?.detail).toMatch(/not in the curriculum vitae file/i);
  });

  it('hard-stops when board certification or specialty is empty', () => {
    const base = readyDraft();
    for (const field of ['board_certification', 'specialty'] as const) {
      const factors = base.factors.map((factor) =>
        factor.factor_id === 'training_experience'
          ? { ...factor, ip: { ...factor.ip, [field]: '' } }
          : factor,
      );
      const gates = evaluateGates({ ...context(base), factors });
      expect(gateFailed(gates, 'cv_from_file')).toBe(true);
      expect(gates.find((gate) => gate.id === 'cv_from_file')?.detail).toMatch(/empty/i);
    }
  });

  it('hard-stops when the no-acuity paragraph slot is empty', () => {
    const base = readyDraft();
    const documents = base.request.documents.filter((doc) => doc.role !== 'records' && doc.role !== 'op_report');
    const checklist = structuredClone(base.catalog.checklist);
    checklist.slots.no_acuity_paragraph = '   ';
    const factors = buildFactorEvidence({ ...base.request, documents }, checklist);
    const gates = evaluateGates({ ...context(base), checklist, documents, factors });
    expect(gateFailed(gates, 'no_cpt_in_acuity')).toBe(true);
    expect(gates.find((gate) => gate.id === 'no_cpt_in_acuity')?.detail).toMatch(/no-acuity paragraph is empty/i);
  });

  it('blocks a single dispute that uses a batch line link', () => {
    const base = readyDraft();
    const packet: DraftPacket = {
      ...base.packet,
      text: `${base.packet.text} same as LI-SYN-A`,
    };
    expect(gateFailed(gatesFor(packet, base), 'qpa_variant')).toBe(true);
  });

  it('blocks factor 7 when it is credited to the initiating party', () => {
    const base = readyDraft();
    const factors = base.factors.map((factor) =>
      factor.factor_id === 'additional_information' ? { ...factor, credited_to: 'IP' as const } : factor,
    );
    const packet: DraftPacket = {
      ...base.packet,
      text: `${base.packet.text} This supports the initiating party.`,
    };
    const gates = evaluateGates({ ...context(base), factors, packet });
    expect(gateFailed(gates, 'factor_7_rule')).toBe(true);
  });

  it('blocks non-neutral language from the checklist phrase list', () => {
    const base = readyDraft();
    const packet: DraftPacket = {
      ...base.packet,
      text: `${base.packet.text} clearly`,
    };
    expect(gateFailed(gatesFor(packet, base), 'neutral_tone')).toBe(true);
  });

  it('hard-stops identical offers in the numbers gate', () => {
    const base = readyDraft();
    const figures = base.figures.map((figure) =>
      figure.kind === 'nip_offer' ? { ...figure, amount_cents: 150000 } : figure,
    );
    const text = base.packet.text.replace('$1,000.00', '$1,500.00');
    const packet: DraftPacket = {
      ...base.packet,
      text,
      paragraphs: [
        base.packet.paragraphs[0].replace('$1,000.00', '$1,500.00'),
        base.packet.paragraphs[1],
        base.packet.paragraphs[2],
        base.packet.paragraphs[3],
      ],
    };
    const gates = evaluateGates({ ...context(base), figures, packet });
    expect(gateFailed(gates, 'numbers_match_source')).toBe(true);
    expect(gates.find((gate) => gate.id === 'numbers_match_source')?.detail).toMatch(/identical/i);
  });

  it('blocks figures that do not match the sourced amounts', () => {
    const base = readyDraft();
    const packet: DraftPacket = {
      ...base.packet,
      text: base.packet.text.replace('$1,500.00', '$9,999.00'),
    };
    const gates = gatesFor(packet, base);
    expect(gateFailed(gates, 'numbers_match_source')).toBe(true);
    const advanced = advanceToReadyForReview(
      idrActor(),
      base.request,
      { template: base.template, intake: base.detected, figures: base.figures, factors: base.factors, packet },
      deps({ catalog: base.catalog }),
    );
    expect(advanced.ok).toBe(false);
    expect(advanced.code).toBe('qa_failed');
    expect(advanced.board).toBeNull();
  });

  it('reads a neutral-tone phrase from the checklist rather than a hard-coded list', () => {
    const base = readyDraft();
    const checklist = structuredClone(base.catalog.checklist);
    const neutral = checklist.gates.find((gate) => gate.id === 'neutral_tone');
    if (!neutral || neutral.id !== 'neutral_tone') throw new Error('missing gate');
    neutral.forbid_phrases = [...neutral.forbid_phrases, 'synthetic-ban-word'];
    const packet: DraftPacket = {
      ...base.packet,
      text: `${base.packet.text} synthetic-ban-word`,
    };
    const gates = evaluateGates({ ...context(base), checklist, packet });
    expect(gateFailed(gates, 'neutral_tone')).toBe(true);
  });
});

describe('system does not sign or submit', () => {
  it('refuses sign and submit, and the module source has no submit actuation', () => {
    expect(signDetermination()).toMatchObject({ ok: false, signed: false, submitted: false, code: 'human_signs' });
    expect(submitDetermination()).toMatchObject({ ok: false, signed: false, submitted: false, code: 'never_submit' });
    const prepared = prepareDetermination(idrActor(), singleRequest(), deps());
    expect(prepared.signed).toBe(false);
    expect(prepared.submitted).toBe(false);
    expect(signDetermination().signed).toBe(false);

    const dir = path.join(process.cwd(), 'lib/idr/determination');
    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.ts')) continue;
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source).not.toMatch(/from '@\/lib\/iro/);
      expect(source).not.toMatch(/um-brief-engine/);
      expect(source).not.toMatch(/signed:\s*true/);
      expect(() => assertNeverSubmitSource(source)).not.toThrow();
    }
    const workflow = readFileSync(path.join(dir, 'workflow.ts'), 'utf8');
    expect(workflow).toContain('signed: false');
    expect(workflow).toContain('submitted: false');
    expect(workflow).not.toMatch(/submitted:\s*true/);
  });
});

function context(base: ReturnType<typeof readyDraft>) {
  return {
    checklist: base.catalog.checklist,
    template: base.template,
    intake: base.detected,
    figures: base.figures,
    factors: base.factors,
    documents: base.request.documents,
    packet: base.packet,
  };
}
