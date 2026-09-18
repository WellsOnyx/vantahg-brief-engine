/**
 * Role → first-page mapping after a successful sign-in.
 * Shared by the login page (Supabase hybrid) and POST /api/auth/sign-in
 * (Cognito) so both backends land clinical + client users on the same
 * surfaces.
 */
export function landingPathForRole(role: string | null | undefined): string {
  switch (role) {
    case 'admin':
      return '/mission-control';
    case 'ceo':
    case 'slt':
      return '/office-ceo';
    case 'builder':
      return '/builders';
    case 'client':
      return '/client';
    case 'reviewer':
      return '/med-review';
    case 'practice-lead':
      return '/cases';
    case 'delivery-lead':
    case 'concierge':
      return '/cx';
    default:
      return '/cases';
  }
}
