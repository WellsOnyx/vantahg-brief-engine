import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Welcome | FLR by VantaHG',
  description:
    'AI-powered first-level utilization review. Clinical briefs prepared by AI, determinations made by board-certified physicians in 24-48 hours.',
};

export default function WelcomePage() {
  return (
    <div className="min-h-[calc(100vh-4rem)]">
      {/* Hero */}
      <section className="bg-navy text-white py-16 sm:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-12 h-12 bg-gold-gradient rounded-xl flex items-center justify-center font-bold text-navy text-xl shadow-lg shadow-gold/30">
              V
            </div>
            <span className="font-[family-name:var(--font-dm-serif)] text-3xl tracking-tight">
              Vanta<span className="text-gold">HG</span>
            </span>
          </div>

          <h1 className="font-[family-name:var(--font-dm-serif)] text-3xl sm:text-5xl leading-tight mb-6">
            First-Level Physician Review.
            <br />
            <span className="text-gold">AI-Powered. Physician-Signed.</span>
          </h1>

          <p className="text-lg sm:text-xl text-white/70 max-w-2xl mx-auto mb-10">
            Prior authorization, medical necessity, concurrent review, and peer-to-peer — with
            AI-assisted clinical briefs and board-certified physician sign-off in 24–48 hours.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-8 py-3 bg-gold text-navy font-semibold rounded-xl text-base hover:bg-gold-light transition-colors shadow-lg shadow-gold/20"
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="px-8 py-3 border border-white/20 text-white font-medium rounded-xl text-base hover:bg-white/10 transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* SLA Metrics */}
      <section className="border-b border-border bg-surface">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
            <MetricCard value="24–48h" label="Standard Review" />
            <MetricCard value="<24h" label="Urgent / Expedited" />
            <MetricCard value="Same Day" label="Peer-to-Peer Calls" />
            <MetricCard value="100%" label="Board-Certified" />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl sm:text-3xl text-center text-foreground mb-12">
            How It Works
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <StepCard
              step={1}
              title="Case Intake"
              description="Submit cases via our portal, chat interface, batch upload, or API integration."
            />
            <StepCard
              step={2}
              title="AI Clinical Brief"
              description="Our AI extracts clinical data, matches criteria, and generates a comprehensive brief."
            />
            <StepCard
              step={3}
              title="Physician Review"
              description="Auto-routed to a specialty-matched, board-certified physician for determination."
            />
            <StepCard
              step={4}
              title="Delivery & Audit"
              description="Determination delivered to your team with full audit trail and compliance reporting."
            />
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="py-16 bg-surface border-y border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl sm:text-3xl text-center text-foreground mb-12">
            Built for TPAs, Health Plans & Self-Funded Employers
          </h2>

          <div className="grid sm:grid-cols-3 gap-8">
            <ValueCard
              title="Medical"
              description="First-level reviews across EM, radiology, ortho, internal medicine, cardiology, and oncology — the specialties that drive the highest authorization volume."
            />
            <ValueCard
              title="Dental"
              description="Licensed dentist reviewers for implants, orthodontics, scaling, extractions, and sedation — the procedures that generate the most friction."
            />
            <ValueCard
              title="Vision"
              description="Optometrist and ophthalmologist reviewers for the coverage questions that create the most plan-provider disputes."
            />
          </div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-3 gap-6 text-center text-sm text-muted">
            <div className="flex flex-col items-center gap-2">
              <svg className="w-6 h-6 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              <span>HIPAA-Compliant Infrastructure</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <svg className="w-6 h-6 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Processing Federal IDR Under the No Surprises Act</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <svg className="w-6 h-6 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
              </svg>
              <span>A Wells Onyx Service — 25+ Years Operational Excellence</span>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-navy text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="font-[family-name:var(--font-dm-serif)] text-2xl sm:text-3xl mb-4">
            Ready to streamline your review process?
          </h2>
          <p className="text-white/60 mb-8">
            Create an account to submit your first case, or contact us to learn more.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/signup"
              className="px-8 py-3 bg-gold text-navy font-semibold rounded-xl text-base hover:bg-gold-light transition-colors shadow-lg shadow-gold/20"
            >
              Create Account
            </Link>
            <a
              href="mailto:review@wellsonyx.com"
              className="px-8 py-3 border border-white/20 text-white font-medium rounded-xl text-base hover:bg-white/10 transition-colors"
            >
              Contact Us
            </a>
          </div>
          <p className="mt-8 text-xs text-white/40">
            <a href="https://www.wellsonyx.com/firstlevelreview" className="hover:text-white/60 transition-colors">
              ← Back to wellsonyx.com
            </a>
          </p>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl sm:text-3xl font-bold text-gold-dark">{value}</p>
      <p className="text-xs text-muted mt-1">{label}</p>
    </div>
  );
}

function StepCard({ step, title, description }: { step: number; title: string; description: string }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 text-center">
      <div className="w-8 h-8 bg-gold/10 text-gold-dark rounded-full flex items-center justify-center text-sm font-bold mx-auto mb-3">
        {step}
      </div>
      <h3 className="font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}

function ValueCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="text-center">
      <h3 className="font-[family-name:var(--font-dm-serif)] text-xl text-foreground mb-2">{title}</h3>
      <p className="text-sm text-muted">{description}</p>
    </div>
  );
}
