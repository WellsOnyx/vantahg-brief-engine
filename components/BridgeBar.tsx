'use client';

export function BridgeBar() {
  return (
    <div className="bg-[#081829] text-white/80 text-xs no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-9 flex items-center justify-between">
        {/* Left: branding */}
        <span className="hidden sm:inline">
          <span className="font-semibold text-white/90">FLR</span> by VantaHG
          <span className="text-white/40 mx-1.5">—</span>
          A Wells Onyx Service
        </span>
        <span className="sm:hidden text-white/90 font-medium">FLR by VantaHG</span>

        {/* Right: links */}
        <div className="flex items-center gap-4">
          <a
            href="https://www.wellsonyx.com/firstlevelreview"
            className="flex items-center gap-1 hover:text-white transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
            <span className="hidden sm:inline">Back to wellsonyx.com</span>
            <span className="sm:hidden">wellsonyx.com</span>
          </a>
          <a
            href="https://www.wellsonyx.com/contact"
            className="hidden sm:inline hover:text-white transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  );
}
