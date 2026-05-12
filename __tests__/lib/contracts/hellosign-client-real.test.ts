import { describe, it, expect, vi } from 'vitest';

/**
 * Real-path tests. The env module is mocked so isRealHelloSignEnabled()
 * returns true without needing Supabase config or real keys. The SDK
 * client is injected via the second arg to `sendForSignature`, so no
 * network call is made.
 */
vi.mock('@/lib/env', async () => {
  const actual = await vi.importActual<typeof import('@/lib/env')>('@/lib/env');
  return {
    ...actual,
    isRealHelloSignEnabled: () => true,
    getHelloSignConfig: () => ({
      apiKey: 'test-api-key',
      clientId: 'test-client-id',
      testMode: true,
    }),
  };
});

describe('sendForSignature — real path (mocked SDK)', () => {
  it('calls the SDK with ordered signers and contract_id metadata', async () => {
    const { sendForSignature } = await import('@/lib/contracts/hellosign-client');

    const mockSend = vi.fn().mockResolvedValue({
      body: { signatureRequest: { signatureRequestId: 'sig_real_xyz' } },
    });
    const mockClient = { signatureRequestSend: mockSend } as never;

    const result = await sendForSignature(
      {
        title: 'MSA — Acme',
        message: 'Sign please.',
        signers: [
          { role: 'vantaum_signer', name: 'Jonathan', email: 'j@v.test', order: 2 },
          { role: 'tpa_signer', name: 'Pat', email: 'p@a.test', order: 1 },
        ],
        pdfBuffer: Buffer.from('%PDF-1.4 fake'),
        fileName: 'msa.pdf',
        contractId: 'k-99',
      },
      mockClient,
    );

    expect(result.demo).toBe(false);
    expect(result.signatureRequestId).toBe('sig_real_xyz');

    const callArg = mockSend.mock.calls[0][0];
    expect(callArg.signers[0].emailAddress).toBe('p@a.test');
    expect(callArg.signers[1].emailAddress).toBe('j@v.test');
    expect(callArg.metadata).toEqual({ contract_id: 'k-99' });
    expect(callArg.testMode).toBe(true);
  });

  it('throws when the API returns a response without a signature_request_id', async () => {
    const { sendForSignature } = await import('@/lib/contracts/hellosign-client');
    const mockClient = {
      signatureRequestSend: vi.fn().mockResolvedValue({ body: { signatureRequest: {} } }),
    } as never;

    await expect(
      sendForSignature(
        {
          title: 't', message: 'm',
          signers: [{ role: 'tpa_signer', name: 'a', email: 'a@x.test', order: 1 }],
          pdfBuffer: Buffer.from('x'), fileName: 'a.pdf', contractId: 'c',
        },
        mockClient,
      ),
    ).rejects.toThrow(/signature_request_id/);
  });
});
