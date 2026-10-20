import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertNeverSubmitSource } from '@/lib/idr-assist';
import {
  advanceToReadyForReview,
  buildFactorEvidence,
  composeDraft,
  detectIntake,
  evaluateGates,
  extractFigures,
  gateFailed,
  loadIdrCatalog,
  prepareDetermination,
  renderFactorBlock,
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
  const composed = composeDraft({
    template,
    checklist: catalog.checklist,
    intake: detected.intake,
    figures,
    factorBlock: renderFactorBlock(factors),
    prevailingParty: 'IP',
    reason: request.reason ?? '',
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
    expect(base.packet.paragraphs).toHaveLength(4);
    expect(base.packet.stamps.template_version).toBe(base.template.version);
    expect(base.packet.stamps.checklist_version).toBe(base.catalog.checklist.version);
  });

  it('blocks a template that does not match the dispute', () => {
    const base = readyDraft();
    const packet: DraftPacket = {
      ...base.packet,
      stamps: { ...base.packet.stamps, template_id: 'nip-brief-single' },
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
      factor_block: narrative,
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
        ? { ...factor, ip: { ...factor.ip, excerpt: 'Not in the file.', excerpt_in_file: false } }
        : factor,
    );
    const packet: DraftPacket = {
      ...base.packet,
      text: base.packet.text.replace(base.factors.find((factor) => factor.factor_id === 'training_experience')?.ip.excerpt ?? '', 'Not in the file.'),
    };
    const gates = evaluateGates({ ...context(base), factors, packet });
    expect(gateFailed(gates, 'cv_from_file')).toBe(true);
  });

  it('blocks the wrong QPA wording variant', () => {
    const base = readyDraft();
    const single = base.catalog.checklist.variant_phrases.qpa_single;
    const batch = base.catalog.checklist.variant_phrases.qpa_batch;
    const packet: DraftPacket = {
      ...base.packet,
      text: base.packet.text.replace(single, batch),
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
      text: base.packet.text.replace('The reason is ', 'The reason is clearly '),
      reason: `clearly ${base.packet.reason}`,
    };
    expect(gateFailed(gatesFor(packet, base), 'neutral_tone')).toBe(true);
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
