import { describe, expect, it } from 'vitest';
import { assertDraftStamped, assertExternalSurfaceClean, IDR_DRAFT_STAMP, isDraftStamped } from '@/lib/idr-assist';
import { searchLine, type LineActor } from '@/lib/lines';
import {
  composeDraft,
  loadIdrCatalog,
  loadIdrCatalogFromFiles,
  prepareDetermination,
  readDetermination,
  readIdrContentFiles,
  type IdrGatewayPort,
  type November1BatchingRules,
} from '@/lib/idr/determination';
import { approvedDeps, batchRequest, deps, idrActor, singleRequest } from './fixture';

describe('federal IDR determination workflow', () => {
  it('reaches ready for review with board fields and a clean four-paragraph draft', () => {
    const used = approvedDeps();
    const result = prepareDetermination(idrActor(), singleRequest(), used);
    expect(result.ok).toBe(true);
    expect(result.production_allowed).toBe(true);
    expect(result.status).toBe('ready_for_review');
    expect(result.board).toEqual({
      prevailing_party: 'IP',
      reason: 'The selected offer is the offer recorded for the prevailing party on this dispute.',
      date_completed: '2026-10-20',
      note: 'ready for review',
      status: 'ready_for_review',
    });
    expect(result.signed).toBe(false);
    expect(result.submitted).toBe(false);
    const parts = result.clean_text?.split(/\n\s*\n/) ?? [];
    expect(parts).toHaveLength(4);
    const [chart, ip, nip, winner] = parts;
    expect(chart).toContain('line:LI-SYN-A');
    expect(chart).toContain('ip_offer:$1,500.00');
    expect(chart).toContain('qpa:$900.00');
    expect(chart).toContain('nip_brief:present');
    expect(chart).not.toContain('same as');
    expect(ip).toContain('board_certification:board certification');
    expect(ip).toContain('specialty:demonstration specialty');
    expect(ip).toContain('acuity_attachments:records,op_report');
    expect(ip).not.toContain('training:absent');
    expect(nip).toContain('training:absent non-initiating party');
    expect(nip).not.toContain('board_certification:');
    expect(winner).toContain('prevailing_party:IP');
    expect(winner).toContain('The selected offer is the offer recorded for the prevailing party on this dispute.');
    expect(result.clean_text).not.toContain('TODO-LIVE-TEXT');
    expect(result.clean_text).not.toContain('CPT');
    expect(result.clean_text).not.toContain('99285');
    expect(result.clean_text).not.toContain('MISSING');
    expect(result.clean_text).not.toContain('{{');
    expect(result.clean_text).not.toContain(IDR_DRAFT_STAMP);
    expect(result.clean_text).not.toContain('clearly');
    expect(result.clean_text).not.toContain('supports the initiating party');
    expect(() => assertExternalSurfaceClean(result.clean_text ?? '')).not.toThrow();
    expect(result.reviewer_copy && isDraftStamped(result.reviewer_copy)).toBe(true);
    expect(result.reviewer_copy?.startsWith(IDR_DRAFT_STAMP)).toBe(true);
    expect(() => assertDraftStamped(result.reviewer_copy ?? '')).not.toThrow();
    expect(result.stamps).toMatchObject({
      template_id: 'ip-brief-single',
      template_version: '2026-10-22.1',
      checklist_version: '2026-10-22.1',
      template_path: 'config/idr/templates/ip-brief-single.md',
      checklist_path: 'config/idr/qa-checklist.yaml',
    });
    expect(result.record).toMatchObject({ company: 'VANTA_HG', line_of_business: 'IDR', kind: 'workflow' });
    expect(result.batching).toMatchObject({ implemented: false, eligible: null, code: 'NOV_1_BATCHING_UNIMPLEMENTED' });
    expect(result.gateway).toMatchObject({ vendor: null, live_call: false, implemented: false, ok: false });
    expect(result.figures?.every((figure) => figure.status === 'present' && figure.source)).toBe(true);
  });

  it('links batch lines to the primary line and keeps November 1 eligibility unset', () => {
    const result = prepareDetermination(idrActor(), batchRequest(), approvedDeps());
    expect(result.ok).toBe(true);
    expect(result.intake?.shape).toBe('batched');
    expect(result.intake?.nip_brief).toBe('absent');
    expect(result.stamps?.template_id).toBe('nip-batch-qpa-discrepancy');
    const chart = result.clean_text?.split(/\n\s*\n/)[0] ?? '';
    expect(chart).toContain('same as LI-SYN-A');
    expect(chart.split('LI-SYN-B')[0]).not.toContain('same as');
    expect(chart).toContain('nip_brief:absent');
    expect(result.clean_text).toContain('prevailing_party:NIP');
    expect(result.clean_text).toContain('$2,000.00');
    expect(result.clean_text).toContain('$1,100.00');
    expect(result.clean_text).not.toContain('TODO-LIVE-TEXT');
    expect(result.batching?.eligible).toBeNull();
    expect(result.board?.prevailing_party).toBe('NIP');
  });

  it('withholds clean text when a figure is MISSING and does not fill it', () => {
    const request = singleRequest();
    request.line_items = [
      { ...request.line_items[0], qpa: { amount: null, doc_id: 'DOC-SYN-QPA', page: 1 } },
    ];
    const result = prepareDetermination(idrActor(), request, deps());
    expect(result.ok).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.code).toBe('qa_failed');
    expect(result.clean_text).toBeNull();
    expect(result.board).toBeNull();
    const qpa = result.figures?.find((figure) => figure.kind === 'qpa');
    expect(qpa).toMatchObject({ status: 'MISSING', amount_cents: null, source: null });
    expect(result.figures?.find((figure) => figure.kind === 'ip_offer')?.amount_cents).toBe(150000);
    expect(qpa?.amount_cents).not.toBe(150000);
  });

  it('blocks the wrong template before review', () => {
    const catalog = loadIdrCatalog();
    const wrong = catalog.byId.get('nip-zero-offer');
    const request = singleRequest();
    const detected = prepareDetermination(idrActor(), request, deps());
    expect(detected.intake?.shape).toBe('single');
    if (!wrong || !detected.intake || !detected.figures || !detected.factors) throw new Error('setup');
    const composed = composeDraft({
      template: wrong,
      checklist: catalog.checklist,
      intake: detected.intake,
      figures: detected.figures,
      factors: detected.factors,
      prevailingParty: 'IP',
      reason: request.reason ?? '',
      nipBranch: null,
      chartParagraph: 'line',
      ipParagraph: 'ip',
      nipParagraph: 'nip',
      winnerParagraph: 'winner',
    });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.code).toBe('wrong_template');
  });

  it('does not invent a prevailing party', () => {
    const result = prepareDetermination(idrActor(), singleRequest({ prevailing_party: null, reason: null }), deps());
    expect(result.code).toBe('decision_not_supplied');
    expect(result.clean_text).toBeNull();
    expect(result.board).toBeNull();
    expect(result.signed).toBe(false);
  });

  it('records version stamps from the content files', () => {
    const files = readIdrContentFiles();
    files['config/idr/qa-checklist.yaml'] = files['config/idr/qa-checklist.yaml'].replace(
      'version: "2026-10-22.1"',
      'version: "2026-11-02.4"',
    );
    files['config/idr/templates/ip-brief-single.md'] = files['config/idr/templates/ip-brief-single.md'].replace(
      'version: "2026-10-22.1"',
      'version: "2026-11-02.9"',
    );
    const result = prepareDetermination(idrActor(), singleRequest(), approvedDeps({ catalog: loadIdrCatalogFromFiles(files) }));
    expect(result.ok).toBe(true);
    expect(result.stamps?.checklist_version).toBe('2026-11-02.4');
    expect(result.stamps?.template_version).toBe('2026-11-02.9');
  });

  it('uses an acuity sentence edited in the checklist file', () => {
    const files = readIdrContentFiles();
    files['config/idr/qa-checklist.yaml'] = files['config/idr/qa-checklist.yaml'].replace(
      'acuity_attachments:records,op_report',
      'acuity_attachments:records+op_report',
    );
    const result = prepareDetermination(
      idrActor(),
      singleRequest(),
      approvedDeps({ catalog: loadIdrCatalogFromFiles(files) }),
    );
    expect(result.ok).toBe(true);
    expect(result.clean_text).toContain('acuity_attachments:records+op_report');
    expect(result.clean_text).not.toContain('acuity_attachments:records,op_report');
  });

  it('keeps IDR determinations off the IRO and Medical Review lines', () => {
    const used = deps();
    const iro: LineActor = { ...idrActor(), id: 'actor-iro', lines: ['IRO'] };
    const med: LineActor = { ...idrActor(), id: 'actor-mr', lines: ['MEDICAL_REVIEW'] };
    expect(prepareDetermination(iro, singleRequest(), used).code).toBe('cross_line');
    expect(prepareDetermination(med, singleRequest(), used).code).toBe('cross_line');
    expect(used.audit?.map((event) => event.record_line)).toEqual(['IDR', 'IDR']);
    const allowed = prepareDetermination(idrActor(), singleRequest(), used);
    expect(allowed.record).not.toBeNull();
    if (!allowed.record) return;
    expect(searchLine(iro, [allowed.record], { line: 'IDR' }, { audit: used.audit, now: used.now }).ok).toBe(false);
    expect(searchLine(idrActor(), [allowed.record], { line: 'IDR' }).rows).toHaveLength(1);
    expect(readDetermination(med, allowed.record, used).allowed).toBe(false);
    const restricted = prepareDetermination(
      idrActor({ case_restricted: true, line_wide: false, assigned_case_ids: ['CASE-OTHER'] }),
      singleRequest(),
      used,
    );
    expect(restricted.code).toBe('case_not_assigned');
  });

  it('refuses a live IDR Gateway and a live November 1 rules object', () => {
    const gateway = {
      system: 'idr_gateway',
      vendor: 'portal',
      live_call: true,
      implemented: true,
      pullDispute: () => {
        throw new Error('gateway should not be called');
      },
    } as unknown as IdrGatewayPort;
    const liveGateway = prepareDetermination(idrActor(), singleRequest(), deps({ gateway }));
    expect(liveGateway.code).toBe('gateway_refused');
    expect(liveGateway.figures).toBeNull();

    const batching = {
      effective_on: '2026-11-01',
      implemented: true,
      evaluate: () => {
        throw new Error('live batching should not be called');
      },
    } as unknown as November1BatchingRules;
    expect(prepareDetermination(idrActor(), singleRequest(), deps({ batching })).code).toBe('batching_rules_refused');
  });
});
