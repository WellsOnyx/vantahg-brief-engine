/**
 * Skeleton — shape placeholders for loading states.
 *
 * Doctrine: brand-consistent, never just a gray box. Skeletons inherit
 * the layout primitive's shape so the page doesn't reflow when content
 * arrives. Use `<SkeletonHero>` + `<SkeletonStats>` + `<SkeletonRows>`
 * inside route-level `loading.tsx` files.
 *
 * Animation is a slow shimmer, not the default Tailwind pulse — pulse
 * feels like "broken," shimmer reads as "working."
 */

export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`relative overflow-hidden bg-navy/5 rounded ${className}`}
    >
      <div className="absolute inset-0 animate-[skeleton-shimmer_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
    </div>
  );
}

/* ─── Composed skeletons for the canonical templates ────────────── */

export function SkeletonHero() {
  return (
    <div className="bg-hero-subtle text-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-12 md:py-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 w-full max-w-2xl">
            <Skeleton className="h-3 w-24 bg-white/10" />
            <Skeleton className="h-10 md:h-12 w-2/3 mt-3 bg-white/10" />
            <Skeleton className="h-[3px] w-16 mt-3 bg-gold/30" />
            <Skeleton className="h-4 w-5/6 mt-4 bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-${count} gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-28 mt-3" />
          <Skeleton className="h-3 w-32 mt-2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="card overflow-hidden">
      <div className="divide-y divide-border">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="px-5 py-4 flex items-center gap-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-4 w-24 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-5 max-w-xl">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full mt-2" />
        </div>
      ))}
      <Skeleton className="h-11 w-32 mt-6" />
    </div>
  );
}

export function SkeletonPage({
  variant = 'dashboard',
}: {
  variant?: 'dashboard' | 'list' | 'focused' | 'submit';
}) {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background">
      <SkeletonHero />
      <div className="max-w-6xl mx-auto px-6 lg:px-8 -mt-10 pb-16 space-y-12">
        {variant === 'dashboard' && (
          <>
            <SkeletonStats />
            <SkeletonRows count={5} />
          </>
        )}
        {variant === 'list' && <SkeletonRows count={8} />}
        {variant === 'focused' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-5">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-10/12" />
              <Skeleton className="h-4 w-9/12" />
            </div>
            <div className="space-y-3">
              <div className="card p-5 space-y-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          </div>
        )}
        {variant === 'submit' && <SkeletonForm fields={6} />}
      </div>
    </div>
  );
}
