/**
 * The demo-preview password.
 *
 * Gates only the demo surfaces (synthetic data, no PHI) behind a shared
 * word so preview links aren't wide open. This is a velvet rope, not a
 * lock — it protects nothing sensitive by design.
 *
 * DEMO_PASSWORD in the environment overrides the built-in default, so a
 * deployment can rotate the word without a code change. The default
 * matches the value already configured in Vercel ("invited") so the same
 * word works on every deployment regardless of env-var scoping.
 */
export function getDemoPassword(): string {
  return process.env.DEMO_PASSWORD || 'invited';
}
