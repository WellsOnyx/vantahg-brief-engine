import Link from 'next/link';
import { createServerClient } from '@/lib/supabase-server';
import { isDemoMode } from '@/lib/demo-mode';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ProviderPortalHome() {
  let user: { email?: string | null } | null = null;
  let providerOrgName = 'Demo Provider Office';

  if (!isDemoMode()) {
    const supabase = await createServerClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) redirect('/firstmover/portal/login?next=/firstmover/portal');
    user = data.user;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('provider_org_id, provider_orgs(name)')
      .eq('id', data.user.id)
      .maybeSingle();

    const orgs = profile?.provider_orgs as { name?: string } | { name?: string }[] | null | undefined;
    const org = Array.isArray(orgs) ? orgs[0] : orgs;
    if (org?.name) providerOrgName = org.name;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-2xl">{providerOrgName}</h1>
          <p className="text-sm text-slate-600 mt-1">
            {user?.email ? <>Signed in as {user.email}.</> : 'Demo session.'}
          </p>
        </div>
        <Link
          href="/firstmover/portal/submit"
          className="bg-[#c9a227] text-[#0c2340] font-medium px-4 py-2 rounded hover:brightness-110"
        >
          + Submit pre-auth
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Tile title="Submit a new pre-auth" body="Walk through the required fields for outpatient, inpatient, meds, home health, therapy, or DME." href="/firstmover/portal/submit" />
        <Tile title="My submitted cases" body="Track status, see determinations, download letters." href="/firstmover/portal/cases" disabled />
        <Tile title="Office settings" body="Update fax, email, contact info. Add staff with portal access." href="/firstmover/portal/settings" disabled />
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-900">
        <strong>Reminder:</strong> if you don&apos;t have all the required fields handy, please call
        back when you do. Submitting an incomplete request starts the SLA clock and can delay
        determination.
      </div>
    </div>
  );
}

function Tile({ title, body, href, disabled }: { title: string; body: string; href: string; disabled?: boolean }) {
  const Wrapper: React.ElementType = disabled ? 'div' : Link;
  return (
    <Wrapper
      {...(!disabled ? { href } : {})}
      className={`block bg-white border border-slate-200 rounded-lg p-4 ${
        disabled ? 'opacity-50' : 'hover:border-[#c9a227] hover:shadow-sm'
      }`}
    >
      <div className="font-serif text-lg">{title}</div>
      <p className="text-sm text-slate-600 mt-1">{body}</p>
      {disabled && <span className="text-xs text-slate-400 mt-2 block">Coming soon</span>}
    </Wrapper>
  );
}
