export function DemoDisabled() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <p className="text-[11px] uppercase tracking-[0.18em] text-gold font-semibold">VantaUM</p>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-navy mt-2">VHG Score demo is off</h1>
        <p className="text-sm text-muted mt-3">
          Set ENABLE_VHG_SCORE_DEMO=true to open the synthetic stop-loss demo. No live records are loaded either way.
        </p>
      </div>
    </div>
  );
}
