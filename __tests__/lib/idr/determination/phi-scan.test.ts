import { describe, expect, it } from 'vitest';
import { findViolations, scanRepo } from '../../../../scripts/check-idr-phi.mjs';

describe('IDR dispute-number and PHI scan', () => {
  it('blocks a realistic dispute number and allows an obvious fake', () => {
    const bad = ['DISP', '880001'].join('-');
    const hits = findViolations(`Case ${bad} mirror`, 'lib/idr/note.ts', true);
    expect(hits).toEqual([expect.objectContaining({ kind: 'dispute_number', path: 'lib/idr/note.ts' })]);
    expect(findViolations('Case DISP-SYN-001 mirror', 'lib/idr/note.ts', false)).toEqual([]);
  });

  it('blocks common PHI patterns and skips them only on an allowlisted path', () => {
    const ssn = ['123', '45', '6789'].join('-');
    const mrn = ['MRN', 'ABC12345'].join(': ');
    const member = ['SWA', '2026', '88421'].join('-');
    const name = ['James', 'Thornton'].join(' ');
    const dob = ['07', '30', '1972'].join('/');
    const text = [`ssn ${ssn}`, mrn, `patient_member_id: '${member}'`, `${name} DOB: ${dob}`].join('\n');
    const kinds = findViolations(text, 'lib/idr/note.ts', false).map((hit) => hit.kind);
    expect(kinds).toEqual(expect.arrayContaining(['ssn', 'mrn', 'member_id', 'dob_with_name']));
    expect(findViolations('patient_member_id: string', 'lib/idr/note.ts', false)).toEqual([]);
    expect(findViolations(text, 'scripts/seed-demo.ts', true).map((hit) => hit.kind)).toEqual([]);
    expect(findViolations(`Case ${badDispute()}`, 'scripts/seed-demo.ts', true).map((hit) => hit.kind)).toEqual([
      'dispute_number',
    ]);
  });

  it('passes on this repository', () => {
    expect(scanRepo()).toEqual([]);
  });
});

function badDispute(): string {
  return ['DISP', '880001'].join('-');
}
