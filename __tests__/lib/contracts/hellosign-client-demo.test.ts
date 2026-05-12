import { describe, it, expect } from 'vitest';
import { sendForSignature } from '@/lib/contracts/hellosign-client';

/**
 * Demo-path tests. Run with the default test env where
 * `isRealHelloSignEnabled()` is false (no Supabase config → demo mode),
 * so the wrapper returns a deterministic stub envelope id.
 */

describe('sendForSignature — demo path', () => {
  it('returns a deterministic demo signature id without env vars', async () => {
    const result = await sendForSignature({
      title: 'VantaUM MSA + BAA — Acme Health',
      message: 'Please review and sign.',
      signers: [
        { role: 'tpa_signer', name: 'Pat TPA', email: 'pat@acme.test', order: 1 },
        { role: 'vantaum_signer', name: 'Jonathan Arias', email: 'jonathan@wellsonyx.com', order: 2 },
      ],
      pdfBuffer: Buffer.from('%PDF-1.4 fake'),
      fileName: 'msa.pdf',
      contractId: 'contract-abc',
    });

    expect(result.demo).toBe(true);
    expect(result.signatureRequestId).toBe('demo-sig-contract-abc');
  });

  it('demo id is unique per contract', async () => {
    const a = await sendForSignature({
      title: 't', message: 'm',
      signers: [{ role: 'tpa_signer', name: 'a', email: 'a@x.test', order: 1 }],
      pdfBuffer: Buffer.from('x'), fileName: 'a.pdf', contractId: 'one',
    });
    const b = await sendForSignature({
      title: 't', message: 'm',
      signers: [{ role: 'tpa_signer', name: 'a', email: 'a@x.test', order: 1 }],
      pdfBuffer: Buffer.from('x'), fileName: 'a.pdf', contractId: 'two',
    });
    expect(a.signatureRequestId).not.toBe(b.signatureRequestId);
  });
});
