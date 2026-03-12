import Link from 'next/link';

const steps = [
  {
    number: '01',
    title: 'You Submit. We Handle the Rest.',
    description: 'Upload clinical documentation through our secure portal, chat, batch upload, or API. Our team takes it from there — no back-and-forth, no chasing paperwork.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Intelligence That Gives Physicians More Time',
    description: 'Our clinical intelligence surfaces the right criteria, flags gaps, and prepares a comprehensive brief — so the reviewing physician spends their time on judgment, not paperwork.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'A Real Physician on Every Case',
    description: 'A board-certified, specialty-matched physician reviews the full picture and makes the determination. Every single time. No exceptions.',
    icon: (
      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
];

const stats = [
  {
    value: '< 24hr',
    label: 'Concierge Turnaround',
    sublabel: 'Most cases reviewed same day',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    value: '100%',
    label: 'Physician-Reviewed',
    sublabel: 'Every case, every time',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 01-1.043 3.296 3.745 3.745 0 01-3.296 1.043A3.745 3.745 0 0112 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 01-3.296-1.043 3.745 3.745 0 01-1.043-3.296A3.745 3.745 0 013 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 011.043-3.296 3.746 3.746 0 013.296-1.043A3.746 3.746 0 0112 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 013.296 1.043 3.746 3.746 0 011.043 3.296A3.745 3.745 0 0121 12z" />
      </svg>
    ),
  },
  {
    value: 'Board-Certified',
    label: 'Specialty-Matched Physicians',
    sublabel: 'The right doctor on every case',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
      </svg>
    ),
  },
  {
    value: 'HIPAA',
    label: 'Compliant Infrastructure',
    sublabel: 'Built for trust from day one',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
      </svg>
    ),
  },
];

const verticals = [
  {
    name: 'Medical',
    description: 'Prior authorization, medical necessity, concurrent and retrospective reviews — with a physician who has the time to actually understand each case',
    hero: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
      </svg>
    ),
  },
  {
    name: 'Dental',
    description: 'Dental necessity reviews, predeterminations, and coverage assessments — licensed dentist reviewers who know the codes',
    hero: false,
    comingSoon: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
      </svg>
    ),
  },
  {
    name: 'Vision',
    description: 'Vision care reviews, surgical necessity, and optical coverage determinations — optometrists and ophthalmologists on your team',
    hero: false,
    comingSoon: true,
    icon: (
      <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Home() {
  return (
    <div className="scroll-smooth">
      {/* ================================================================ */}
      {/* HERO SECTION                                                     */}
      {/* ================================================================ */}
      <section className="relative bg-navy overflow-hidden">
        {/* Subtle geometric pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="heroGrid" width="60" height="60" patternUnits="userSpaceOnUse">
                <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#heroGrid)" />
          </svg>
        </div>

        {/* Gold accent line at top */}
        <div className="h-1 bg-gradient-to-r from-gold/0 via-gold to-gold/0" />

        {/* Client Login link - top right */}
        <Link
          href="/login"
          className="absolute top-6 right-6 sm:right-8 z-10 text-sm text-white/50 hover:text-white/90 transition-colors font-medium"
        >
          Client Login
        </Link>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28 lg:py-32">
          <div className="max-w-4xl">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/10 rounded-full px-4 py-1.5 mb-8">
              <span className="w-2 h-2 bg-gold rounded-full animate-pulse" />
              <span className="text-sm text-white/80 font-medium tracking-wide">Concierge Member Advocacy</span>
            </div>

            <h1 className="font-[family-name:var(--font-dm-serif)] text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white leading-[1.1] tracking-tight">
              More Human,{' '}
              <span className="text-gold">Not Less.</span>
            </h1>

            <p className="mt-6 md:mt-8 text-lg md:text-xl text-white/70 max-w-2xl leading-relaxed">
              We built clinical intelligence into our DNA so physicians have more time
              with every case — and members get the thoughtful, human review they deserve.
              Not an AI product. A concierge service, powered by it.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-start gap-4">
              <Link
                href="/login"
                className="group inline-flex items-center gap-3 bg-gold text-navy px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gold-light transition-all duration-200 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30"
              >
                Submit a Case
                <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </Link>
              <a
                href="https://www.wellsonyx.com/firstlevelreview"
                className="inline-flex items-center gap-2 text-white/70 hover:text-white px-6 py-4 rounded-lg font-medium transition-colors border border-white/10 hover:border-white/25 hover:bg-white/5"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
                </svg>
                Request a Demo
              </a>
            </div>
          </div>

          {/* Decorative element - floating card preview */}
          <div className="hidden lg:block absolute right-8 xl:right-16 top-1/2 -translate-y-1/2 w-80 xl:w-96">
            <div className="bg-white/[0.06] backdrop-blur-md border border-white/10 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-gold/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
                  </svg>
                </div>
                <div>
                  <div className="text-white/90 font-semibold text-sm">Clinical Brief Ready</div>
                  <div className="text-white/40 text-xs">Case #VUM-2026-0847</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">Clinical Criteria</span>
                  <span className="text-xs font-medium text-green-400 bg-green-400/10 px-2 py-0.5 rounded-full">4/4 Met</span>
                </div>
                <div className="w-full bg-white/10 rounded-full h-1.5">
                  <div className="bg-gradient-to-r from-gold to-green-400 h-1.5 rounded-full w-full" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">Documentation</span>
                  <span className="text-xs font-medium text-gold bg-gold/10 px-2 py-0.5 rounded-full">Complete</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/50 text-xs">Confidence</span>
                  <span className="text-xs font-medium text-white/80">High</span>
                </div>
                <div className="pt-3 border-t border-white/10">
                  <div className="text-xs text-white/40 mb-1">Physician Recommendation</div>
                  <div className="text-sm text-white/90 font-medium">Approve -- Meets clinical necessity criteria per InterQual guidelines</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom curve transition */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full" preserveAspectRatio="none">
            <path d="M0 56h1440V28C1440 28 1140 0 720 0S0 28 0 28v28z" fill="#f8f9fb" />
          </svg>
        </div>
      </section>

      {/* ================================================================ */}
      {/* HOW IT WORKS                                                     */}
      {/* ================================================================ */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16 md:mb-20">
            <div className="inline-flex items-center gap-2 text-gold-dark font-semibold text-sm tracking-widest uppercase mb-4">
              <span className="w-8 h-px bg-gold" />
              How It Works
              <span className="w-8 h-px bg-gold" />
            </div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
              Concierge Review in Three Steps
            </h2>
            <p className="mt-4 text-muted text-lg">
              We handle the complexity so your physicians can focus on what matters —
              giving every member&apos;s case the attention it deserves.
            </p>
          </div>

          {/* Steps */}
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12 relative">
            {/* Connector line (desktop) */}
            <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px bg-gradient-to-r from-border via-gold/30 to-border" />

            {steps.map((step, index) => (
              <div key={step.number} className="relative group">
                <div className="bg-surface rounded-2xl border border-border p-8 md:p-10 shadow-sm hover:shadow-md hover:border-gold/30 transition-all duration-300 h-full">
                  {/* Step number circle */}
                  <div className="relative z-10 w-14 h-14 bg-navy rounded-2xl flex items-center justify-center mb-6 group-hover:bg-navy-light transition-colors shadow-lg shadow-navy/20">
                    <span className="text-gold">{step.icon}</span>
                  </div>

                  {/* Step number label */}
                  <div className="text-xs font-bold text-gold tracking-widest uppercase mb-2">Step {step.number}</div>

                  <h3 className="font-[family-name:var(--font-dm-serif)] text-xl md:text-2xl text-navy mb-3">
                    {step.title}
                  </h3>

                  <p className="text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Arrow connector (mobile) */}
                {index < steps.length - 1 && (
                  <div className="md:hidden flex justify-center py-4">
                    <svg className="w-6 h-6 text-gold/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* STATS / TRUST SECTION                                            */}
      {/* ================================================================ */}
      <section className="py-20 md:py-28 bg-navy relative overflow-hidden">
        {/* Background subtle pattern */}
        <div className="absolute inset-0 opacity-[0.03]">
          <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="statsGrid" width="40" height="40" patternUnits="userSpaceOnUse">
                <circle cx="20" cy="20" r="1" fill="white" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#statsGrid)" />
          </svg>
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section header */}
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 text-gold font-semibold text-sm tracking-widest uppercase mb-4">
              <span className="w-8 h-px bg-gold/50" />
              Our Commitment
              <span className="w-8 h-px bg-gold/50" />
            </div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-white">
              Every Member Deserves a Real Review
            </h2>
            <p className="mt-4 text-white/50 text-lg">
              We give physicians the time and tools to do what they do best — so members and plans get clinical decisions they can trust.
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="relative bg-white/[0.06] backdrop-blur-sm border border-white/10 rounded-2xl p-6 md:p-8 text-center hover:bg-white/[0.1] transition-all duration-300 group"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gold/10 rounded-xl mb-5 group-hover:bg-gold/20 transition-colors">
                  <span className="text-gold">{stat.icon}</span>
                </div>
                <div className="font-[family-name:var(--font-dm-serif)] text-2xl md:text-3xl text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-white/80 font-semibold text-sm">{stat.label}</div>
                <div className="text-white/40 text-xs mt-1">{stat.sublabel}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* VERTICALS SECTION                                                */}
      {/* ================================================================ */}
      <section className="py-20 md:py-28 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="inline-flex items-center gap-2 text-gold-dark font-semibold text-sm tracking-widest uppercase mb-4">
              <span className="w-8 h-px bg-gold" />
              Coverage Areas
              <span className="w-8 h-px bg-gold" />
            </div>
            <h2 className="font-[family-name:var(--font-dm-serif)] text-3xl md:text-4xl text-navy">
              The Right Specialist on Every Case
            </h2>
            <p className="mt-4 text-muted text-lg">
              Imaging, surgery, specialty procedures, DME, behavioral health, and more — each case is matched to a physician who understands the clinical context firsthand.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {verticals.map((vertical) => (
              <div
                key={vertical.name}
                className={`bg-surface rounded-2xl border p-8 transition-all duration-300 group ${
                  vertical.hero
                    ? 'border-gold/30 shadow-md hover:shadow-lg ring-2 ring-gold/10'
                    : 'border-border hover:shadow-lg hover:border-gold/20 opacity-75'
                }`}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className={`w-14 h-14 rounded-2xl flex items-center justify-center group-hover:bg-navy/10 transition-colors ${
                    vertical.hero ? 'bg-gold/10' : 'bg-navy/5'
                  }`}>
                    <span className={vertical.hero ? 'text-gold-dark' : 'text-navy'}>{vertical.icon}</span>
                  </div>
                  {vertical.hero && (
                    <span className="px-2.5 py-0.5 bg-gold/10 text-gold-dark text-xs font-semibold rounded-full border border-gold/20">
                      Primary
                    </span>
                  )}
                  {'comingSoon' in vertical && vertical.comingSoon && (
                    <span className="px-2.5 py-0.5 bg-gray-100 text-muted text-xs font-semibold rounded-full border border-border">
                      Coming Soon
                    </span>
                  )}
                </div>
                <h3 className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy mb-3">
                  {vertical.name}
                </h3>
                <p className="text-muted leading-relaxed">{vertical.description}</p>
                <div className="mt-6 pt-6 border-t border-border">
                  {'comingSoon' in vertical && vertical.comingSoon ? (
                    <span className="inline-flex items-center gap-2 text-sm font-semibold text-muted">
                      Coming Soon
                    </span>
                  ) : (
                    <Link
                      href="/login"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-gold-dark hover:text-gold transition-colors group/link"
                    >
                      Submit Medical Case
                      <svg className="w-4 h-4 transition-transform group-hover/link:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* CTA BANNER                                                       */}
      {/* ================================================================ */}
      <section className="bg-gradient-to-r from-navy via-navy-light to-navy relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-gold/5 via-transparent to-gold/5" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
          <div className="flex flex-col md:flex-row items-center justify-between gap-8">
            <div>
              <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl md:text-3xl text-white">
                Give your members the review process they deserve.
              </h2>
              <p className="mt-2 text-white/60 text-lg">Submit your first case in minutes. See the difference a concierge approach makes.</p>
            </div>
            <Link
              href="/login"
              className="group inline-flex items-center gap-3 bg-gold text-navy px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gold-light transition-all duration-200 shadow-lg shadow-gold/20 hover:shadow-xl hover:shadow-gold/30 whitespace-nowrap"
            >
              Get Started
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ================================================================ */}
      {/* COMPLIANCE FOOTER                                                */}
      {/* ================================================================ */}
      <section className="bg-surface border-t border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="flex flex-col md:flex-row items-start gap-10 md:gap-16">
            {/* Brand column */}
            <div className="md:w-1/3">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gold rounded-lg flex items-center justify-center font-bold text-navy text-sm">V</div>
                <span className="font-[family-name:var(--font-dm-serif)] text-xl text-navy tracking-tight">VantaUM</span>
              </div>
              <p className="text-muted text-sm leading-relaxed">
                Concierge utilization management. Clinical intelligence that gives physicians more time — so members get the care they deserve.
              </p>
            </div>

            {/* Links column */}
            <div className="md:w-1/3">
              <h4 className="font-semibold text-navy text-sm uppercase tracking-wider mb-4">Platform</h4>
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" className="text-sm text-muted hover:text-navy transition-colors">Submit Case</Link>
                <Link href="/reviewers" className="text-sm text-muted hover:text-navy transition-colors">Reviewers</Link>
                <Link href="/clients" className="text-sm text-muted hover:text-navy transition-colors">Clients</Link>
                <Link href="/login" className="text-sm text-muted hover:text-navy transition-colors">Dashboard</Link>
              </div>
            </div>

            {/* Compliance column */}
            <div className="md:w-1/3">
              <h4 className="font-semibold text-navy text-sm uppercase tracking-wider mb-4">Compliance</h4>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted bg-gray-100 px-3 py-1.5 rounded-full">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  HIPAA Compliant
                </div>
                <div className="flex items-center gap-1.5 text-xs font-medium text-muted bg-gray-100 px-3 py-1.5 rounded-full">
                  <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  SOC 2
                </div>
              </div>
            </div>
          </div>

          {/* Compliance disclosure */}
          <div className="mt-10 pt-8 border-t border-border">
            <p className="text-xs text-muted leading-relaxed max-w-4xl">
              All clinical determinations are made by licensed, board-certified physicians. Our clinical
              intelligence assists with documentation analysis and brief preparation — it never makes coverage
              decisions. VantaUM complies with all applicable state and federal regulations governing utilization
              review, including URAC and NCQA standards where applicable.
            </p>
            <p className="text-xs text-muted/60 mt-4">
              &copy; {new Date().getFullYear()} VantaUM. All rights reserved.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
