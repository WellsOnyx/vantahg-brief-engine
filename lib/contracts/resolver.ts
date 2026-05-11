/**
 * Contract template resolver.
 *
 * Pure function: given a template + a signup snapshot + admin overrides,
 * produces the final markdown body with variables substituted.
 *
 * Supported placeholder syntax:
 *   {{var_name}}              — straight variable substitution
 *   {{#var_name}}...{{/var_name}}  — render the inner block only when
 *                                   var_name has a truthy resolved value
 *                                   (used for optional fields like dba)
 *
 * Anything more complex (nested conditionals, loops, computed
 * expressions inside the markdown) is deliberately NOT supported in
 * Phase 2.0 — templates are short enough that adding a real parser
 * isn't worth the dependency. If we need it later, drop in Handlebars.
 */

import type {
  ContractTemplate,
  ResolvedTemplate,
  SignupSnapshot,
  VariableDef,
  VariableFormat,
} from './types';

/**
 * Format a raw value according to the variable's declared format.
 * Returns null when the value is genuinely missing (so the caller can
 * decide whether that's a required-variable error or a defaultable
 * optional).
 */
function formatValue(
  raw: unknown,
  format: VariableFormat,
  snapshot: SignupSnapshot,
): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  switch (format) {
    case 'text':
      return String(raw).trim() || null;

    case 'integer': {
      const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      return Number.isFinite(n) ? n.toString() : null;
    }

    case 'money_cents': {
      const cents = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
      if (!Number.isFinite(cents)) return null;
      return `$${(cents / 100).toFixed(2)}`;
    }

    case 'date': {
      if (raw === 'today') {
        return new Date().toISOString().slice(0, 10);
      }
      const d = new Date(String(raw));
      if (isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    }

    case 'address': {
      // For 'computed' source the resolver passes through; for free-form
      // 'override' source it's just text. Real address composition for
      // tpa_address pulls from street_address/city/state/zip on the
      // snapshot, handled in resolveOne below.
      const s = String(raw).trim();
      return s || null;
    }

    default:
      return String(raw).trim() || null;
  }
}

function composeAddress(snapshot: SignupSnapshot, prefix: string = ''): string | null {
  const street = snapshot[`${prefix}street_address`] ?? snapshot.street_address;
  const city = snapshot[`${prefix}city`] ?? snapshot.city;
  const state = snapshot[`${prefix}state`] ?? snapshot.state;
  const zip = snapshot[`${prefix}zip`] ?? snapshot.zip;
  const parts = [street, city, state, zip].filter((p) => p && String(p).trim().length > 0);
  if (parts.length === 0) return null;
  return parts.join(', ');
}

function resolveOne(
  v: VariableDef,
  snapshot: SignupSnapshot,
  overrides: Record<string, string>,
  now: Date,
): string | null {
  // Overrides always win when explicitly provided, regardless of source.
  // This lets admins correct a wrong DBA / address at generate time
  // without editing the underlying signup row.
  if (overrides[v.key] !== undefined && overrides[v.key] !== null && overrides[v.key] !== '') {
    return formatValue(overrides[v.key], v.format, snapshot);
  }

  switch (v.source) {
    case 'signup': {
      if (!v.signupField) return null;
      const raw = snapshot[v.signupField];
      return formatValue(raw, v.format, snapshot);
    }

    case 'computed': {
      if (v.key === 'effective_date') {
        return formatValue(now.toISOString().slice(0, 10), 'date', snapshot);
      }
      if (v.key === 'tpa_address' || v.key === 'notice_address_tpa') {
        return composeAddress(snapshot);
      }
      // Unknown computed keys fall through to default.
      return null;
    }

    case 'override': {
      // Override-source with no value provided → fall through to default.
      return null;
    }
  }
}

/**
 * Substitute the placeholders. Block syntax ({{#key}}…{{/key}}) is
 * processed first so we can drop optional sections cleanly, then
 * straight {{key}} substitution runs over the remaining text.
 */
function substitute(body: string, values: Record<string, string>): string {
  // Block syntax: {{#key}}inner{{/key}}.
  // Renders `inner` only when values[key] is a non-empty string.
  let out = body.replace(
    /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g,
    (_match, key: string, inner: string) => {
      const v = values[key];
      return v && v.length > 0 ? inner : '';
    },
  );

  // Straight substitution: {{key}}.
  out = out.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return values[key] ?? '';
  });

  return out;
}

export interface ResolveOptions {
  /** Admin-entered overrides keyed by variable.key */
  overrides?: Record<string, string>;
  /** Inject "now" for deterministic tests */
  now?: Date;
}

export function resolveTemplate(
  template: ContractTemplate,
  snapshot: SignupSnapshot,
  options: ResolveOptions = {},
): ResolvedTemplate {
  const now = options.now ?? new Date();
  const overrides = options.overrides ?? {};

  const values: Record<string, string> = {};
  const unresolvedKeys: string[] = [];

  for (const v of template.variables) {
    const resolved = resolveOne(v, snapshot, overrides, now);
    if (resolved !== null) {
      values[v.key] = resolved;
    } else if (v.defaultValue !== undefined) {
      values[v.key] = v.defaultValue;
    } else if (v.required) {
      unresolvedKeys.push(v.key);
      // Leave the placeholder visible in the resolved body so missing
      // values show up loudly in the rendered PDF if rendering proceeds.
      values[v.key] = `[MISSING: ${v.key}]`;
    } else {
      values[v.key] = '';
    }
  }

  const resolvedMd = substitute(template.bodyMd, values);

  return { resolvedMd, values, unresolvedKeys };
}
