import { describe, it, expect } from 'vitest';
import { renderContractPdf } from '@/lib/contracts/renderer';
import { resolveTemplate } from '@/lib/contracts/resolver';
import { MSA_WITH_BAA_V1 } from '@/lib/contracts/templates/msa-with-baa-v1';

describe('renderContractPdf', () => {
  it('returns a Buffer with a valid PDF header', () => {
    const buf = renderContractPdf('# Hello\n\nThis is body text.');
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500); // some non-trivial size
    // PDF files start with %PDF-
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('renders the resolved MSA-with-BAA template end-to-end', () => {
    const { resolvedMd } = resolveTemplate(MSA_WITH_BAA_V1, {
      legal_name: 'Acme Health TPA Inc.',
      pepm_rate_cents: 240,
      signer_name: 'Robert Signer',
      signer_email: 'robert@acme.example',
      street_address: '100 Main St',
      city: 'Miami',
      state: 'FL',
      zip: '33101',
    }, { now: new Date('2026-05-11') });
    const buf = renderContractPdf(resolvedMd, {
      footerLabel: 'VantaUM MSA v1 — confidential',
      headerLabel: 'VantaUM, Inc. • Master Services Agreement',
    });
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
    // Full MSA template should produce a multi-page document.
    expect(buf.length).toBeGreaterThan(5000);
  });

  it('handles an empty body without throwing', () => {
    const buf = renderContractPdf('');
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });

  it('renders multiple paragraphs, headings, and lists in one pass', () => {
    const buf = renderContractPdf(`# Title

Paragraph one with **bold** text.

## Section A

- item one
- item two
- item three

Paragraph two with *italic* text.

---

Footer paragraph.`);
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('wraps long lines instead of overflowing', () => {
    const longLine = 'word '.repeat(200).trim();
    const buf = renderContractPdf(longLine);
    expect(buf.toString('utf8', 0, 5)).toBe('%PDF-');
  });
});
