/**
 * Contract generator — shared types.
 *
 * Each ContractTemplate is a (slug, version) pair. The body is markdown
 * with {{variable}} placeholders. Variables map to source signup-request
 * fields, computed values, or admin overrides. The resolver substitutes
 * values to produce the final markdown; the renderer turns that into a
 * PDF.
 */

export type VariableSource =
  | 'signup'      // pull from signup_requests row
  | 'override'    // admin entered at generate time
  | 'computed';   // derived (e.g. effective_date = today)

export type VariableFormat =
  | 'text'
  | 'integer'
  | 'money_cents'   // stored as integer cents, rendered as $X.XX/PMPM
  | 'date'          // ISO date or 'today'
  | 'address';

export interface VariableDef {
  /** Token used in the markdown body, e.g. 'tpa_legal_name' → {{tpa_legal_name}} */
  key: string;
  /** Human-readable label shown in the admin generator form */
  label: string;
  source: VariableSource;
  /**
   * When source = 'signup', the name of the signup_requests column to
   * pull from. When source = 'computed' or 'override', this is the
   * computation key (handled by the resolver).
   */
  signupField?: string;
  format: VariableFormat;
  required: boolean;
  /** Default if the resolved value is null/undefined and required is false */
  defaultValue?: string;
  /** Helper text shown next to the input in the admin UI */
  hint?: string;
}

export interface SignerRole {
  /** e.g. 'tpa_signer', 'vantaum_signer' */
  key: string;
  /** Display label */
  label: string;
  /** Order of signing (1 = signs first) */
  order: number;
}

export interface ContractTemplate {
  /** Stable identifier for the template family (e.g. 'msa-with-baa') */
  slug: string;
  /** Version within the family (e.g. 'v1'). Together with slug, unique. */
  version: string;
  title: string;
  /** Full markdown body with {{var}} placeholders */
  bodyMd: string;
  variables: VariableDef[];
  signerRoles: SignerRole[];
}

/**
 * Resolution result. resolvedMd is what gets piped to the renderer.
 * unresolvedKeys captures any required variable that ended up missing —
 * the API route refuses to render in that case.
 */
export interface ResolvedTemplate {
  resolvedMd: string;
  values: Record<string, string>;
  unresolvedKeys: string[];
}

/**
 * The shape of data the resolver pulls from when source = 'signup'.
 * Intentionally a plain object so the resolver stays testable without
 * a database.
 */
export type SignupSnapshot = Record<string, unknown>;
