import { describe, expect, it } from 'vitest';
import { detectIntake, extractFigures, parseExactCents } from '@/lib/idr/determination';
import { batchRequest, singleRequest } from './fixture';

describe('IDR intake', () => {
  it('detects a single dispute with a non-initiating party brief and records line items', () => {
    const detected = detectIntake(singleRequest());
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    expect(detected.intake.shape).toBe('single');
    expect(detected.intake.nip_brief).toBe('present');
    expect(detected.intake.line_items).toEqual([{ line_id: 'LI-SYN-A', label: 'Synthetic service A' }]);
    expect(detected.intake.document_ids).toContain('DOC-SYN-BRIEF');
  });

  it('detects a batched dispute with no non-initiating party brief', () => {
    const detected = detectIntake(batchRequest());
    expect(detected.ok).toBe(true);
    if (!detected.ok) return;
    expect(detected.intake.shape).toBe('batched');
    expect(detected.intake.nip_brief).toBe('absent');
    expect(detected.intake.line_items.map((item) => item.line_id)).toEqual(['LI-SYN-A', 'LI-SYN-B']);
  });

  it('blocks when an asserted shape or brief contradicts the file', () => {
    const shape = detectIntake(singleRequest({ asserted_shape: 'batched' }));
    expect(shape.ok).toBe(false);
    if (shape.ok) return;
    expect(shape.code).toBe('shape_mismatch');

    const brief = detectIntake(singleRequest({ asserted_nip_brief: 'absent' }));
    expect(brief.ok).toBe(false);
    if (brief.ok) return;
    expect(brief.code).toBe('brief_mismatch');
  });

  it('blocks an empty line-item list and a repeated line id', () => {
    const empty = detectIntake(singleRequest({ line_items: [] }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.code).toBe('no_line_items');

    const request = singleRequest();
    const duplicated = detectIntake({
      ...request,
      line_items: [request.line_items[0], { ...request.line_items[0] }],
    });
    expect(duplicated.ok).toBe(false);
    if (!duplicated.ok) expect(duplicated.code).toBe('duplicate_line_item');
  });
});

describe('offer and QPA extraction', () => {
  it('keeps a source pointer and does not estimate a missing figure from another amount', () => {
    const request = singleRequest();
    request.line_items = [
      {
        ...request.line_items[0],
        nip_offer: { amount: null, doc_id: null, page: null },
      },
    ];
    const figures = extractFigures(request);
    const ip = figures.find((figure) => figure.kind === 'ip_offer');
    const nip = figures.find((figure) => figure.kind === 'nip_offer');
    const qpa = figures.find((figure) => figure.kind === 'qpa');
    expect(ip).toMatchObject({
      status: 'present',
      amount_cents: 150000,
      source: { doc_id: 'DOC-SYN-IP-OFFER', page: 2 },
    });
    expect(qpa?.status).toBe('present');
    expect(nip).toEqual({
      line_id: 'LI-SYN-A',
      kind: 'nip_offer',
      status: 'MISSING',
      amount_cents: null,
      source: null,
    });
    expect(nip?.amount_cents).not.toBe(ip?.amount_cents);
    expect(nip?.amount_cents).not.toBe(qpa?.amount_cents);
  });

  it('flags unparseable amounts, extra precision, missing pages, and unknown documents as MISSING', () => {
    expect(parseExactCents('1500.555')).toBeNull();
    expect(parseExactCents('about 1500')).toBeNull();
    expect(parseExactCents('')).toBeNull();
    const request = singleRequest();
    request.line_items = [
      {
        ...request.line_items[0],
        ip_offer: { amount: '1500.555', doc_id: 'DOC-SYN-IP-OFFER', page: 2 },
        nip_offer: { amount: '1000.00', doc_id: 'DOC-SYN-NIP-OFFER', page: null },
        qpa: { amount: '900.00', doc_id: 'DOC-NOT-IN-FILE', page: 1 },
      },
    ];
    const figures = extractFigures(request);
    expect(figures.every((figure) => figure.status === 'MISSING' && figure.amount_cents === null)).toBe(true);
  });
});
