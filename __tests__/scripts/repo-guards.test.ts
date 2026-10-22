import { describe, expect, it } from 'vitest';
import { findPhpViolations, scanRepo as scanPhp } from '../../scripts/check-no-php.mjs';
import { findViolations, pathViolations, scanRepo as scanPhi } from '../../scripts/check-idr-phi.mjs';

describe('PHP guard', () => {
  it('blocks a PHP file, a composer manifest, and an open tag', () => {
    const open = '<' + '?php';
    const hits = findPhpViolations(`${open} echo 1;`, 'src/index.php');
    expect(hits.map((hit) => hit.kind)).toEqual(expect.arrayContaining(['php_file', 'php_open_tag']));
    expect(findPhpViolations('{}', 'composer.json').map((hit) => hit.kind)).toEqual(['composer_manifest']);
    expect(findPhpViolations('export const n = 1;\n', 'lib/demo.ts')).toEqual([]);
  });

  it('blocks a PHP base image in Docker and workflow files', () => {
    const fromImage = ['FROM', 'php:8.3-fpm'].join(' ');
    expect(findPhpViolations(fromImage, 'Dockerfile').map((hit) => hit.kind)).toContain('php_image');
    expect(findPhpViolations(fromImage, 'lib/note.ts')).toEqual([]);
  });

  it('passes on this repository', () => {
    expect(scanPhp()).toEqual([]);
  });
});

describe('PHI guard', () => {
  it('blocks a realistic dispute number and allows an obvious fake', () => {
    const bad = ['DISP', '880001'].join('-');
    const hits = findViolations(`Case ${bad} mirror`, 'lib/idr/note.ts', true);
    expect(hits).toEqual([expect.objectContaining({ kind: 'dispute_number', path: 'lib/idr/note.ts' })]);
    expect(findViolations('Case DISP-SYN-001 mirror', 'lib/idr/note.ts', false)).toEqual([]);
  });

  it('blocks common PHI patterns and skips them only on an allowlisted path', () => {
    const ssn = ['123', '45', '6789'].join('-');
    const realSsn = ['219', '09', '4481'].join('-');
    const mrn = ['MRN', 'ABC12345'].join(': ');
    const member = ['SWA', '2026', '88421'].join('-');
    const name = ['James', 'Thornton'].join(' ');
    const dob = ['07', '30', '1972'].join('/');
    const phone = ['(786)', '490-2384'].join(' ');
    const text = [
      `ssn ${ssn}`,
      `ssn ${realSsn}`,
      mrn,
      `patient_member_id: '${member}'`,
      `${name} DOB: ${dob}`,
      phone,
    ].join('\n');
    const blocked = findViolations(text, 'lib/idr/note.ts', false).map((hit) => hit.kind);
    expect(blocked).toEqual(
      expect.arrayContaining(['ssn', 'mrn', 'member_id', 'dob_with_name', 'phone']),
    );
    expect(findViolations(`ssn ${ssn}`, 'lib/idr/note.ts', false).map((hit) => hit.kind)).toEqual([]);
    expect(findViolations('patient_member_id: string', 'lib/idr/note.ts', false)).toEqual([]);
    const waived = findViolations(text, 'scripts/seed-demo.ts', true).map((hit) => hit.kind);
    expect(waived).toEqual(expect.arrayContaining(['phone', 'ssn']));
    expect(waived).not.toContain('member_id');
    const bad = ['DISP', '880001'].join('-');
    expect(findViolations(`Case ${bad}`, 'scripts/seed-demo.ts', true).map((hit) => hit.kind)).toEqual([
      'dispute_number',
    ]);
  });

  it('blocks personal mailbox domains and case binaries outside the synthetic folder', () => {
    const email = ['patient', 'gmail.com'].join('@');
    expect(findViolations(`reach ${email}`, 'notes.md', true).map((hit) => hit.kind)).toEqual([
      'personal_email',
    ]);
    expect(pathViolations('cases/fax.pdf').map((hit) => hit.kind)).toEqual(['case_binary']);
    expect(pathViolations('synthetic-fixtures/fax.pdf')).toEqual([]);
    expect(pathViolations('notes/server.log').map((hit) => hit.kind)).toContain('log_file');
  });

  it('passes on this repository', () => {
    expect(scanPhi()).toEqual([]);
  });
});
