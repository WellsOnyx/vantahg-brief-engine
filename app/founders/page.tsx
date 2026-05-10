import Link from 'next/link';

const cards = [
  {
    href: '/founders/intake/call',
    title: 'Concierge call intake',
    body: 'Take a call from a provider office. Type the prior auth into a structured form gated by service-type rules. Engine generates the brief and packages it for clinical review.',
    audience: 'Nurse concierge agents',
  },
  {
    href: '/founders/portal',
    title: 'Provider portal',
    body: 'Sign in as a provider office and submit pre-auths directly. Upload supporting clinicals, track status, receive determination letters.',
    audience: 'Doctor office staff',
  },
  {
    href: '/founders/triage',
    title: 'Bulk triage',
    body: 'Process a batch of pending cases at once: route to LPN / RN / MD lanes by service type, SLA, and complexity. Preview, then apply.',
    audience: 'Ops + concierge leads',
  },
  {
    href: '/founders/queue',
    title: 'Clinician queue',
    body: 'Review packets prepared by intake. Render one of five determinations: approve, deny, partial, pend, peer-to-peer.',
    audience: 'LPN / RN / MD reviewers',
  },
];

export default function FoundersHome() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Founders Release</h1>
        <p className="text-slate-600 mt-2 max-w-2xl">
          Manual-first MVP. Four nurses take calls and key the case; the engine documents, the
          clinician decides. A controlled, ship-now version that runs alongside the main automated
          build until feature parity.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="block bg-white border border-slate-200 rounded-lg p-5 hover:border-[#c9a227] hover:shadow-sm transition"
          >
            <div className="text-xs uppercase tracking-wide text-slate-500">{c.audience}</div>
            <div className="font-serif text-xl mt-1">{c.title}</div>
            <p className="text-sm text-slate-600 mt-2">{c.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
