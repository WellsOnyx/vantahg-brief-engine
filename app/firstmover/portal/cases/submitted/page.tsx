import Link from 'next/link';

export default async function SubmittedPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;

  return (
    <div className="max-w-xl mx-auto pt-12 text-center space-y-4">
      <div className="inline-flex w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 items-center justify-center text-2xl">
        ✓
      </div>
      <h1 className="font-serif text-2xl">Submitted</h1>
      <p className="text-slate-600">
        Your reference number is{' '}
        <span className="font-mono bg-slate-100 px-2 py-0.5 rounded">{ref || '—'}</span>.
        {' '}You&apos;ll receive a determination via email and through the portal once review is complete.
      </p>
      <div className="pt-4 flex items-center justify-center gap-3">
        <Link href="/firstmover/portal/submit" className="text-sm border border-slate-300 rounded px-4 py-2 hover:bg-slate-50">
          Submit another
        </Link>
        <Link href="/firstmover/portal" className="text-sm bg-[#0c2340] text-white rounded px-4 py-2 hover:bg-[#173869]">
          Back to portal
        </Link>
      </div>
    </div>
  );
}
