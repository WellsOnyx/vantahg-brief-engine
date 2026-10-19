import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import IroPublicDemoPage from '@/app/portal/page';
import { IroPublicDemo } from '@/components/iro/IroPublicDemo';
import { buildIroPublicDemo, IRO_PUBLIC_DEMO_LABEL } from '@/lib/iro/public-demo';
import { isIroPublicDemoPath, IRO_PUBLIC_DEMO_PATH } from '@/lib/routing/iro-public-demo';
import { runSyntheticOhioWalkthrough } from '@/lib/iro/synthetic-ohio';

const ROOT = process.cwd();

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

describe('public IRO demo view', () => {
  const demo = buildIroPublicDemo();
  const run = runSyntheticOhioWalkthrough();

  it('walks the synthetic Ohio case through six labelled stages', () => {
    expect(demo.label).toBe(IRO_PUBLIC_DEMO_LABEL);
    expect(demo.case_id).toBe(run.case.id);
    expect(demo.synthetic).toBe(true);
    expect(demo.company).toBe('VANTA_HG');
    expect(demo.line).toBe('IRO');
    expect(demo.state_name).toBe('Ohio');
    expect(demo.pathway).toBe('standard');
    expect(demo.closed).toBe(true);
    expect(demo.version).toBe(2);
    expect(demo.stages.map((stage) => stage.title)).toEqual([
      'Intake',
      'Eligibility and conflict check',
      'Reviewer assignment',
      'Clinical review',
      'Determination draft and human sign-off',
      'Notice and close',
    ]);
    expect(demo.outcome).toMatch(/Overturned on version 2/);
  });

  it('shows the pinned Ohio deadline and the STOP gates from the walkthrough', () => {
    expect(demo.deadline.due_at).toBe(run.dueAfterPathway);
    expect(demo.deadline.due_at).toBe('2026-10-31T14:00:00.000Z');
    expect(demo.deadline.clock_at).toBe('2026-10-01T14:00:00.000Z');
    expect(demo.deadline.ohio_standard).toBe('30 calendar days');
    expect(demo.deadline.ohio_expedited).toBe('72 hours');
    expect(demo.deadline.urac_standard).toBe('45 calendar days');
    expect(demo.deadline.winner).toBe('Ohio state row');
    expect(demo.deadline.confirmed).toBe(false);
    expect(demo.deadline.missing_records).toMatch(/do not move the due date/);

    const codes = demo.stages.flatMap((stage) => stage.stops.map((stop) => stop.code));
    expect(codes).toEqual(
      expect.arrayContaining([
        'wrong_step',
        'deadline_pause_forbidden',
        'conflict_unresolved',
        'conflict_clearance_denied',
        'records_need_team_lead',
        'only_vanta_selects_reviewer',
        'credential_expires_before_due',
        'panel_not_activated',
        'attestation_required',
        'attestation_yes',
        'process_check_required',
        'backdate_forbidden',
      ]),
    );
    expect(new Set(codes)).toEqual(new Set(run.stops));
    expect(demo.stages.find((stage) => stage.id === 'signoff')?.stops.map((stop) => stop.code)).toEqual([
      'process_check_required',
    ]);
  });

  it('routes IDR and Medical Review out of the IRO queue', () => {
    const byRequest = new Map(demo.firewall.map((row) => [row.request, row]));
    expect(byRequest.get('IRO')).toMatchObject({ on_iro_queue: true, target: 'IRO queue' });
    expect(byRequest.get('IDR')).toMatchObject({ on_iro_queue: false, target: 'IDR' });
    expect(byRequest.get('IDRE')).toMatchObject({ on_iro_queue: false, target: 'IDR' });
    expect(byRequest.get('Medical Review')).toMatchObject({ on_iro_queue: false, target: 'Medical Review' });
    expect(byRequest.get('UM')?.on_iro_queue).toBe(false);
    expect(byRequest.get('Internal review')?.on_iro_queue).toBe(false);
  });

  it('keeps prices, names, and emails off the public payload', () => {
    const blob = JSON.stringify(demo);
    expect(blob).not.toMatch(/\$|@|santana|johana|jonathan|jonah|\bSam\b|license_number|patient_name|1,700|170000/i);
    expect(demo.billing_posted).toBe(true);
    expect(demo.billing_closes_case).toBe(false);
    expect(demo.billing_note).toMatch(/does not close the case/);
    expect(demo.billing_note).toMatch(/Prices are not shown/);
    expect(read('lib/iro/public-demo.ts')).not.toMatch(/fee-schedule|um-price-card|credentialing/);
    expect(read('app/portal/page.tsx')).not.toMatch(/fee-schedule|um-price-card|credentialing/);
    expect(read('components/iro/IroPublicDemo.tsx')).not.toMatch(/fee-schedule|um-price-card|credentialing/);
  });

  it('renders the banner, stages, and firewall without admin chrome copy', () => {
    const view = render(<IroPublicDemo demo={demo} />);
    const text = view.container.textContent ?? '';
    expect(text).toContain('Demo, synthetic data');
    expect(text).toContain('Not a live IRO feed');
    expect(text).toContain('Hard STOP gates');
    expect(text).toContain('Line firewall');
    expect(text).toContain('Routed out');
    expect(text).toContain('process_check_required');
    expect(text).not.toMatch(/Mission Control|Operations/);
    expect(view.container.innerHTML).not.toMatch(/\$|@/);

    const page = render(<IroPublicDemoPage />);
    expect(page.container.textContent).toContain(demo.case_id);
  });
});

describe('public IRO demo route', () => {
  it('opens exact /portal and leaves status, TPA, and provider routes protected', () => {
    expect(IRO_PUBLIC_DEMO_PATH).toBe('/portal');
    expect(isIroPublicDemoPath('/portal')).toBe(true);
    expect(isIroPublicDemoPath('/portal/')).toBe(true);
    expect(isIroPublicDemoPath('/portal/status')).toBe(false);
    expect(isIroPublicDemoPath('/portal/iro')).toBe(false);
    expect(isIroPublicDemoPath('/portal/tpa')).toBe(false);
    expect(isIroPublicDemoPath('/portal/tpa/submit')).toBe(false);
    expect(isIroPublicDemoPath('/portal/provider')).toBe(false);
    expect(isIroPublicDemoPath('/portal/stoploss')).toBe(false);
    expect(isIroPublicDemoPath('/portal/iron')).toBe(false);

    const middleware = read('middleware.ts');
    expect(middleware).toContain('isIroPublicDemoPath');
    const prefixes = middleware.match(/PUBLIC_PAGE_PREFIXES = (\[[^\]]+\])/);
    expect(prefixes?.[1]).toContain("'/stoploss'");
    expect(prefixes?.[1]).not.toContain("'/portal'");
    expect(read('lib/routing/public-redirects.ts')).not.toMatch(/source: '\/portal'/);

    expect(read('components/AppShell.tsx')).toContain('isIroPublicDemoPath(pathname)');
    const status = read('app/portal/status/page.tsx');
    expect(status).toContain('Authorization Status Portal');
    expect(status).toContain('href="/portal"');
    expect(status).toContain('Synthetic Ohio IRO demo');
    expect(read('lib/notifications.ts')).toContain('${baseUrl}/portal/status');
    expect(read('lib/notifications.ts')).not.toContain('${baseUrl}/portal\n');
  });
});
