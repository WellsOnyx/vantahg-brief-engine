/**
 * IDR Ops assist — merge-safe guardrails (HG lane).
 *
 * Ported as the smallest safe slice of the older IDR engine (PR #44),
 * without the bookmarklet, portal fill automation, or serve HTTP server.
 *
 * Doctrine:
 *   - The assist prepares a DRAFT. A credentialed human signs / submits.
 *   - No portal automation that submits, saves, advances, or attests.
 *   - DLI number and attestation stay human-typed.
 *   - Any future internal serve bind is private-network only.
 *   - No live credentials, no Optum outreach, no CMS portal bots.
 *
 * Every public decision type pins `submitted: false`.
 */

export const IDR_DRAFT_STAMP =
  'DRAFT FOR ARBITER REVIEW — INTERNAL WORK PRODUCT, NOT FOR DISTRIBUTION';

/** Shorter stamp still accepted as a valid draft mark. */
export const IDR_DRAFT_STAMP_SHORT = 'DRAFT FOR ARBITER REVIEW';

/**
 * Controls we must NEVER actuate — halt before submit/save/next/attest.
 * Matches the PR #44 portal-fill guard (attribute + label + row context).
 */
export const SUBMIT_MARKERS =
  /\b(submit|save|finali[sz]e|complete|sign|attest|next|continue|confirm)\b/i;

/** Fields a human must type from the portal screen. Assist never fills these. */
export const HUMAN_ONLY_FIELD_MARKERS =
  /\b(dli|dispute line item|attestation)\b/i;

/** iMPROve / portal-facing text must never carry these fingerprints. */
export const TOOLING_LANGUAGE =
  /\b(bookmarklet|portal[_-]?fill|idr[_-]?engine|answer[_-]?sheet\.json|claude|anthropic|openai|llm)\b/i;

/** Engine flag tokens that must not leak onto shared billing / portal notes. */
export const ENGINE_FLAG_CODES = [
  'HEURISTIC_MODE',
  'IDENTICAL_OFFERS',
  'MISSING_DOC',
  'ELIGIBILITY_OBJECTION',
  'NIP_OFFER_EQUALS_QPA',
  'MISSING_CITED_EXHIBIT',
  'SPLIT_DECISION',
  'TEMPLATE_DEVIATION',
  'COI_NAME_MATCH',
  'LOW_CONFIDENCE',
  'EXTRACTION_GAP',
] as const;

const ENGINE_FLAG_TOKEN = new RegExp(`\\b(?:${ENGINE_FLAG_CODES.join('|')})\\b`);

const RFC1918 = [/^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./];

export interface AssistControl {
  id?: string;
  name?: string;
  type?: string;
  value?: string;
  label?: string;
  rowText?: string;
  tagName?: string;
}

export type IntendedAssistAction =
  | { op: 'set_value'; control: AssistControl; value: string }
  | { op: 'check'; control: AssistControl; checked: boolean }
  | { op: 'click'; control: AssistControl }
  | { op: 'submit'; control?: AssistControl };

export interface NeverSubmitDecision {
  mayTouch: boolean;
  submitted: false;
  reason: string;
}

export interface AssistPlanResult {
  applied: IntendedAssistAction[];
  blocked: Array<{ action: IntendedAssistAction; reason: string }>;
  submitted: false;
}

/** Throw unless `host` is loopback or an RFC1918 private IPv4 (or ::1). */
export function assertPrivateBind(host: string): void {
  const h = host.trim().toLowerCase();
  if (h === '0.0.0.0' || h === '::' || h === '*' || h === '') {
    throw new Error(
      `REFUSING TO BIND: "${host}" exposes the server on all interfaces (public). ` +
        `Bind to a private address only — 127.0.0.1 for a single machine, or the server's ` +
        `RFC1918 VPC address (10.x / 172.16–31.x / 192.168.x) for other WorkSpaces to reach it.`,
    );
  }
  if (h === 'localhost' || h === '::1') return;
  if (RFC1918.some((re) => re.test(h))) return;
  throw new Error(
    `REFUSING TO BIND: "${host}" is not a private (loopback/RFC1918) address. ` +
      `Internal serve mode never binds to a public interface. Use 127.0.0.1 or the private VPC IP.`,
  );
}

/** Shared access code required before any future internal serve process starts. */
export function assertServeAccessCode(code: string): void {
  if (!code || code.trim().length < 6) {
    throw new Error('REFUSING TO START: shared access code required (6+ characters).');
  }
}

export function isSubmitLabeled(text: string): boolean {
  return SUBMIT_MARKERS.test(text);
}

export function isSubmitControl(control: AssistControl): boolean {
  if ((control.type ?? '').toLowerCase() === 'submit') return true;
  const own = [control.value, control.name, control.id, control.type, control.tagName]
    .filter(Boolean)
    .join(' ');
  return (
    isSubmitLabeled(own) ||
    isSubmitLabeled(control.label ?? '') ||
    isSubmitLabeled(control.rowText ?? '')
  );
}

export function isHumanOnlyControl(control: AssistControl): boolean {
  const ctx = [control.id, control.name, control.label, control.rowText]
    .filter(Boolean)
    .join(' ');
  return HUMAN_ONLY_FIELD_MARKERS.test(ctx);
}

export function decideAssistTouch(control: AssistControl): NeverSubmitDecision {
  if (isSubmitControl(control)) {
    return {
      mayTouch: false,
      submitted: false,
      reason: 'never-submit: submit/save/next/attest controls are human-only',
    };
  }
  if (isHumanOnlyControl(control)) {
    return {
      mayTouch: false,
      submitted: false,
      reason: 'human-only field (DLI / attestation) — reviewer types this',
    };
  }
  return {
    mayTouch: true,
    submitted: false,
    reason: 'field is eligible for draft assist fill',
  };
}

/**
 * Filter an intended assist plan. Submit / human-only / submit-labeled
 * controls are blocked. The return type pins `submitted: false`.
 */
export function filterAssistActions(actions: IntendedAssistAction[]): AssistPlanResult {
  const applied: IntendedAssistAction[] = [];
  const blocked: AssistPlanResult['blocked'] = [];

  for (const action of actions) {
    if (action.op === 'submit') {
      blocked.push({ action, reason: 'never-submit: submit is forbidden' });
      continue;
    }
    const decision = decideAssistTouch(action.control);
    if (!decision.mayTouch) {
      blocked.push({ action, reason: decision.reason });
    } else {
      applied.push(action);
    }
  }

  return { applied, blocked, submitted: false };
}

/** Prefix an artifact with the canonical DRAFT stamp if it is missing. */
export function applyDraftStamp(text: string): string {
  if (isDraftStamped(text)) return text;
  return `${IDR_DRAFT_STAMP}\n\n${text}`;
}

export function isDraftStamped(text: string): boolean {
  return text.includes(IDR_DRAFT_STAMP) || text.includes(IDR_DRAFT_STAMP_SHORT);
}

export function assertDraftStamped(text: string, label = 'artifact'): void {
  if (!isDraftStamped(text)) {
    throw new Error(
      `REFUSING TO EMIT: ${label} is missing the DRAFT stamp. IDR assist output is never final.`,
    );
  }
}

export function assertExternalSurfaceClean(text: string, label = 'external surface'): void {
  if (TOOLING_LANGUAGE.test(text)) {
    throw new Error(
      `REFUSING TO EMIT: ${label} leaks tooling language onto an iMPROve-facing surface.`,
    );
  }
  if (ENGINE_FLAG_TOKEN.test(text)) {
    throw new Error(
      `REFUSING TO EMIT: ${label} leaks engine flag tokens onto an iMPROve-facing surface.`,
    );
  }
}

/**
 * Static check used before any assist JS is emitted. Refuses source that
 * actuates submit (form.submit, SubmitEvent, click-on-submit). Mentioning
 * the word "submit" in a comment or a refuse-path is allowed.
 */
export function assertNeverSubmitSource(source: string): void {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const forbidden = [
    /\.submit\s*\(/,
    /\bform\.submit\b/i,
    /new\s+SubmitEvent\b/,
    /dispatchEvent\s*\(\s*new\s+Event\s*\(\s*['"]submit['"]/,
  ];

  for (const re of forbidden) {
    if (re.test(withoutComments)) {
      throw new Error(
        'REFUSING TO EMIT: assist source contains a submit actuation path. ' +
          'IDR assist never submits; a human clicks Save.',
      );
    }
  }
}
