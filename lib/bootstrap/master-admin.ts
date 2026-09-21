/**
 * bootstrap-master-admin is a Supabase Auth hybrid leftover.
 * The pg shim throws on .auth. This script must not invent a password
 * and must not flip ENABLE_AWS_AUTH.
 */

export function masterAdminBlockReason(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.ENABLE_AWS_DB === 'true') {
    return [
      'bootstrap-master-admin creates a Supabase Auth user via auth.admin.',
      'ENABLE_AWS_DB=true routes data through the pg shim, which has no .auth.',
      'This script will not invent a password and will not turn on ENABLE_AWS_AUTH.',
      '',
      'On RDS:',
      '  - First client + LPN/RN/MD roster: npm run bootstrap-real-client',
      '  - Operator login stays on the hybrid path until you deliberately set ENABLE_AWS_AUTH=true and provision the user in Cognito.',
      '  - Role rows live on user_profiles. This script does not write them on the RDS path.',
    ].join('\n');
  }

  const url = env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    return [
      'bootstrap-master-admin is the Supabase Auth hybrid leftover.',
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or leave this script unused on RDS.',
      'The client + reviewer roster does not need it: npm run bootstrap-real-client with ENABLE_AWS_DB=true.',
    ].join('\n');
  }

  return null;
}
