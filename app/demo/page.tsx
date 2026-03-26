'use client';

import DemoWalkthrough from '@/components/demo/DemoWalkthrough';

export default function DemoPage() {
  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      <header className="bg-[#0c2340] text-white py-4 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-[#c9a227] to-[#d4b54a] rounded-lg flex items-center justify-center font-bold text-[#0c2340] text-sm shadow-lg shadow-[#c9a227]/20">V</div>
            <span className="text-xl tracking-tight" style={{ fontFamily: 'var(--font-dm-serif), "DM Serif Display", Georgia, serif' }}>
              Vanta<span className="text-[#c9a227]">UM</span>
            </span>
          </div>
          <span className="text-xs text-white/40 font-medium uppercase tracking-wider">Interactive Demo</span>
        </div>
      </header>
      <div className="bg-[#0c2340] text-white pb-8 pt-2 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-2xl sm:text-3xl mb-2" style={{ fontFamily: 'var(--font-dm-serif), "DM Serif Display", Georgia, serif' }}>
            Clinical Intelligence. <span className="text-[#c9a227]">Delivered in Minutes.</span>
          </h1>
          <p className="text-white/60 text-sm sm:text-base max-w-xl mx-auto">
            Watch a real utilization review case flow through VantaUM — from intake to AI-generated clinical brief to physician determination.
          </p>
        </div>
      </div>
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <DemoWalkthrough />
      </main>
      <footer className="text-center py-6 text-xs text-[#0c2340]/30">
        <p>VantaUM — A <a href="https://wellsonyx.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#c9a227]">Wells Onyx</a> Service</p>
        <p className="mt-1">AI advises. Physicians decide. Every case, every time.</p>
      </footer>
    </div>
  );
}
