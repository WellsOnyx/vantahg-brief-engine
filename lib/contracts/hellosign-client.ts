import { SignatureRequestApi } from '@dropbox/sign';
import { getHelloSignConfig, isRealHelloSignEnabled } from '@/lib/env';

/**
 * Thin typed wrapper around the Dropbox Sign (formerly HelloSign) SDK.
 *
 * Two design goals:
 * 1. **Demo-mode safe.** When HelloSign is not enabled (demo mode, missing
 *    keys, or ENABLE_REAL_HELLOSIGN=false) `sendForSignature` returns a
 *    deterministic stub envelope ID instead of calling the API. This lets
 *    the full signup → contract → "send for signature" flow run locally
 *    without a network call.
 * 2. **No hidden env reads.** All env access goes through `getHelloSignConfig`
 *    via the central `lib/env.ts`. The functions in this file are pure
 *    given their inputs, which makes them trivially testable.
 *
 * The HelloSign API is being phased out in favor of Dropbox Sign branding
 * but the SDK package, env-var names, and signature_request_id semantics
 * are unchanged. We keep the `hellosign` prefix consistently in code +
 * env to match the SDK and the Vercel variable name.
 */

export interface ContractSigner {
  /** Internal role key, e.g. 'tpa_signer' | 'vantaum_signer'. Used as signer index. */
  role: string;
  /** Display name shown in the signature request email. */
  name: string;
  /** Email the signature request is sent to. */
  email: string;
  /** Render order: 1 = signs first, 2 = signs second, etc. Order is enforced. */
  order: number;
}

export interface SendForSignatureParams {
  /** Human-readable subject line for the email. */
  title: string;
  /** Body text of the request email. */
  message: string;
  /** Signers in render order. We enforce ordering = true so vendor counter-signs last. */
  signers: ContractSigner[];
  /** Rendered, unsigned PDF as a Buffer. We upload by file (not template). */
  pdfBuffer: Buffer;
  /** Stable file name for the PDF inside Dropbox Sign. */
  fileName: string;
  /** Internal contract id — round-trips back on webhook callbacks as metadata. */
  contractId: string;
}

export interface SendForSignatureResult {
  /** The Dropbox Sign `signature_request_id`. Stored on contracts.hellosign_signature_request_id. */
  signatureRequestId: string;
  /** True if this came from the demo stub, false if from real API. */
  demo: boolean;
}

/**
 * Build a Dropbox Sign API client from real credentials.
 *
 * Separated from `sendForSignature` so tests can inject a mock client.
 */
export function buildHelloSignClient(apiKey: string): SignatureRequestApi {
  const api = new SignatureRequestApi();
  // SDK uses HTTP Basic with username=apiKey, password empty.
  api.username = apiKey;
  return api;
}

/**
 * Send a contract PDF for signature.
 *
 * Returns a `signatureRequestId` that should be stored on the contracts row
 * so webhook callbacks can be matched back. In demo mode, returns a
 * stub id with a deterministic shape (`demo-sig-${contractId}`) so tests
 * and local dev can exercise the rest of the flow without network access.
 */
export async function sendForSignature(
  params: SendForSignatureParams,
  injectedClient?: SignatureRequestApi,
): Promise<SendForSignatureResult> {
  if (!isRealHelloSignEnabled()) {
    return {
      signatureRequestId: `demo-sig-${params.contractId}`,
      demo: true,
    };
  }

  const config = getHelloSignConfig();
  const client = injectedClient ?? buildHelloSignClient(config.apiKey);

  // Order signers by `order` field — Dropbox Sign signs in array index order
  // when signing_options.order = true.
  const orderedSigners = [...params.signers].sort((a, b) => a.order - b.order);

  const response = await client.signatureRequestSend({
    title: params.title,
    subject: params.title,
    message: params.message,
    signers: orderedSigners.map((s, idx) => ({
      name: s.name,
      emailAddress: s.email,
      order: idx,
    })),
    files: [
      // RequestDetailedFile shape from the SDK — Buffer + filename + contentType.
      {
        value: params.pdfBuffer,
        options: { filename: params.fileName, contentType: 'application/pdf' },
      },
    ],
    metadata: {
      contract_id: params.contractId,
    },
    testMode: config.testMode,
    signingOptions: {
      draw: true,
      type: true,
      upload: true,
      phone: false,
      defaultType: 'type' as never, // SDK enum; 'type' is the typed-name flow
    },
  });

  const sigId = response.body.signatureRequest?.signatureRequestId;
  if (!sigId) {
    throw new Error('HelloSign returned a response without signature_request_id');
  }

  return { signatureRequestId: sigId, demo: false };
}
