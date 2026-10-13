/**
 * VHG Score demo gate. Default off.
 * Server routes and pages read ENABLE_VHG_SCORE_DEMO.
 * NEXT_PUBLIC_ENABLE_VHG_SCORE_DEMO is accepted so a browser bundle can
 * hide entry points when the public flag is inlined at build time.
 */
export function isVhgScoreDemoEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ENABLE_VHG_SCORE_DEMO === 'true' || env.NEXT_PUBLIC_ENABLE_VHG_SCORE_DEMO === 'true';
}
