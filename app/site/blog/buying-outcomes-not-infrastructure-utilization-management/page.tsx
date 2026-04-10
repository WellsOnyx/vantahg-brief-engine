'use client';

const EA_EMAIL = 'mailto:hello@wellsonyx.com?subject=VantaUM%20Founding%20Partner%20Inquiry';

export default function BlogPost() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap"
        rel="stylesheet"
      />

      <style>{`
        .vum-site *, .vum-site *::before, .vum-site *::after { box-sizing: border-box; margin: 0; padding: 0; }
        .vum-site {
          --black: #000000; --near-black: #080808; --surface: #0f0f0f; --surface-2: #141414;
          --border: rgba(255,255,255,0.07); --border-strong: rgba(255,255,255,0.14);
          --white: #f8f7f4; --white-muted: rgba(248,247,244,0.52); --white-dim: rgba(248,247,244,0.28);
          --teal: #5b8af5; --teal-dim: rgba(91,138,245,0.12); --teal-mid: rgba(91,138,245,0.38);
          --gold: #c9a96e; --gold-dim: rgba(201,169,110,0.12);
          --serif: 'Cormorant Garamond', Georgia, serif;
          --sans: 'DM Sans', system-ui, sans-serif;
          background: var(--black); color: var(--white); font-family: var(--sans); font-size: 16px; line-height: 1.6;
          -webkit-font-smoothing: antialiased;
        }
        .vum-site a { color: inherit; }

        /* ── Nav ── */
        .vum-nav { position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:18px 56px;border-bottom:1px solid var(--border);background:rgba(7,8,10,0.9);backdrop-filter:blur(16px); }
        .nav-left { display:flex;align-items:baseline;gap:0; }
        .nav-wordmark { font-family:var(--sans);font-size:15px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--white);text-decoration:none; }
        .nav-wordmark span { color:var(--teal); }
        .nav-sub { font-size:11px;font-weight:300;letter-spacing:0.08em;text-transform:uppercase;color:var(--white-dim);margin-left:12px; }
        .nav-links { display:flex;gap:36px;list-style:none; }
        .nav-links a { font-size:13px;font-weight:300;color:var(--white-muted);text-decoration:none;transition:color 0.2s; }
        .nav-links a:hover { color:var(--white); }
        .nav-cta { border:1px solid var(--border-strong);color:var(--white);background:transparent;padding:9px 22px;border-radius:4px;font-size:13px;font-weight:400;text-decoration:none;transition:border-color 0.2s,color 0.2s; }
        .nav-cta:hover { border-color:var(--teal);color:var(--teal); }

        /* ── Article ── */
        .blog-article { max-width:720px;margin:0 auto;padding:140px 24px 100px; }
        .blog-back { display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--white-muted);text-decoration:none;margin-bottom:48px;transition:color 0.2s; }
        .blog-back:hover { color:var(--white); }
        .blog-kicker { font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--teal);margin-bottom:20px;display:block; }
        .blog-title { font-family:var(--serif);font-size:clamp(36px,4.5vw,56px);font-weight:300;line-height:1.1;letter-spacing:-0.3px;color:var(--white);margin-bottom:24px; }
        .blog-title em { font-style:italic;color:var(--teal); }
        .blog-meta { font-size:13px;font-weight:300;color:var(--white-dim);margin-bottom:48px;display:flex;align-items:center;gap:16px; }
        .blog-meta-dot { width:3px;height:3px;border-radius:50%;background:var(--white-dim); }
        .blog-divider { border:none;border-top:1px solid var(--border);margin:0 0 48px; }

        .blog-body h2 { font-family:var(--serif);font-size:28px;font-weight:300;line-height:1.2;color:var(--white);margin:56px 0 20px;letter-spacing:-0.2px; }
        .blog-body h2 em { font-style:italic;color:var(--teal); }
        .blog-body p { font-size:17px;font-weight:300;line-height:1.8;color:var(--white-muted);margin-bottom:24px; }
        .blog-body p strong { color:var(--white);font-weight:400; }
        .blog-body p em { font-style:italic;color:var(--white); }

        .blog-body .pull-quote { margin:48px 0;padding:32px 0 32px 32px;border-left:2px solid var(--teal);font-family:var(--serif);font-size:24px;font-weight:300;line-height:1.4;color:var(--white);letter-spacing:-0.2px; }
        .blog-body .pull-quote em { font-style:italic;color:var(--teal); }

        .blog-body .pillar-grid { display:grid;grid-template-columns:1fr;gap:2px;margin:40px 0; }
        .blog-body .pillar-card { padding:28px 32px;background:var(--surface);border:1px solid var(--border);border-radius:6px;transition:border-color 0.2s; }
        .blog-body .pillar-card:hover { border-color:var(--border-strong); }
        .blog-body .pillar-card-label { font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal);opacity:0.8;margin-bottom:8px; }
        .blog-body .pillar-card-title { font-family:var(--serif);font-size:20px;font-weight:300;color:var(--white);margin-bottom:8px; }
        .blog-body .pillar-card-body { font-size:14px;font-weight:300;line-height:1.7;color:var(--white-muted); }

        /* ── CTA Box ── */
        .blog-cta { margin:64px 0 0;padding:40px;background:var(--surface);border:1px solid var(--border);border-radius:8px;text-align:center; }
        .blog-cta-kicker { font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold);margin-bottom:16px;display:block; }
        .blog-cta h3 { font-family:var(--serif);font-size:28px;font-weight:300;color:var(--white);margin-bottom:12px; }
        .blog-cta p { font-size:15px;font-weight:300;color:var(--white-muted);margin-bottom:28px;max-width:480px;margin-left:auto;margin-right:auto; }
        .btn-primary { background:var(--teal);color:#fff;padding:13px 30px;border-radius:4px;font-family:var(--sans);font-size:14px;font-weight:500;text-decoration:none;transition:opacity 0.2s,transform 0.15s;display:inline-block; }
        .btn-primary:hover { opacity:0.88;transform:translateY(-1px); }

        /* ── Footer ── */
        .vum-footer { background:var(--black);border-top:1px solid var(--border);padding:40px 56px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
        .footer-logo { font-family:var(--sans);font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--white); }
        .footer-logo span { color:var(--teal); }
        .vum-footer p { font-size:12px;color:var(--white-dim); }

        /* ── Animations ── */
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
        .blog-article .blog-kicker { animation:fadeUp 0.6s ease both; }
        .blog-article .blog-title { animation:fadeUp 0.7s 0.1s ease both; }
        .blog-article .blog-meta { animation:fadeUp 0.7s 0.2s ease both; }
        .blog-article .blog-body { animation:fadeUp 0.7s 0.3s ease both; }

        /* ── Responsive ── */
        @media (max-width:960px) {
          .vum-nav { padding:18px 24px; }
          .nav-links { display:none; }
          .blog-article { padding:100px 20px 72px; }
          .vum-footer { padding:32px 24px;flex-direction:column;text-align:center; }
        }
      `}</style>

      <div className="vum-site">
        {/* Nav */}
        <nav className="vum-nav">
          <div className="nav-left">
            <a className="nav-wordmark" href="/site"><span>Vanta</span>UM</a>
            <span className="nav-sub">A Wells Onyx Company</span>
          </div>
          <ul className="nav-links">
            <li><a href="/site#philosophy">Philosophy</a></li>
            <li><a href="/site#model">Our Model</a></li>
            <li><a href="/site#compare">Why VantaUM</a></li>
            <li><a href="/site#demo">Live Demo</a></li>
            <li><a href="/site#urac">Accreditation</a></li>
          </ul>
          <a className="nav-cta" href={EA_EMAIL}>Request Early Access</a>
        </nav>

        {/* Article */}
        <article className="blog-article">
          <a className="blog-back" href="/site">&#8592; Back to VantaUM</a>

          <span className="blog-kicker">Perspective</span>
          <h1 className="blog-title">The TPA UM Model Is Broken.<br /><em>Here&rsquo;s the Fix.</em></h1>
          <div className="blog-meta">
            <span>Jonah Manning</span>
            <span className="blog-meta-dot" />
            <span>Wells Onyx | VantaUM</span>
          </div>
          <hr className="blog-divider" />

          <div className="blog-body">
            <p>The utilization management model that most TPAs are running today was designed for a different era.</p>

            <p>Fax-based intake. Manual nurse review queues. Clinician panels that take months to credentialize. Prior auth turnaround times measured in days. Member experience that generates complaints regardless of the outcome.</p>

            <p>All of it maintained as internal infrastructure. All of it a cost center that grows with your membership and never shrinks.</p>

            <p>The TPAs that built this infrastructure didn&rsquo;t build it carelessly. They built it because there was no other way to get UM capability. The infrastructure was the only path to the outcome.</p>

            <p>That&rsquo;s no longer true.</p>

            {/* ── Section: What TPAs actually need ── */}
            <h2>What TPAs actually <em>need</em> from UM.</h2>

            <p>Strip away the infrastructure and ask: what is the outcome a TPA actually needs from utilization management?</p>

            <div className="pull-quote">
              An accurate prior authorization decision. Fast. Compliant. Delivered to the right clinician. With a member experience that builds trust instead of destroying it.
            </div>

            <p>That&rsquo;s the outcome. One sentence. Clean and specific.</p>

            <p>The infrastructure built to deliver it &mdash; the platform, the staff, the workflows, the compliance overhead &mdash; is not the outcome. It&rsquo;s the means. And the means no longer needs to be owned by the TPA.</p>

            {/* ── Section: The outcome model ── */}
            <h2>The <em>outcome</em> model.</h2>

            <p>VantaUM was built from the ground up to deliver UM as an outcome, not infrastructure.</p>

            <div className="pillar-grid">
              <div className="pillar-card">
                <div className="pillar-card-label">Human-Led</div>
                <div className="pillar-card-title">Concierge delivery</div>
                <div className="pillar-card-body">Every member interaction is human-led, high-touch, clinician-coordinated. No automated phone trees. No lost faxes. No callback windows.</div>
              </div>
              <div className="pillar-card">
                <div className="pillar-card-label">Pre-Built</div>
                <div className="pillar-card-title">World-class clinician panel</div>
                <div className="pillar-card-body">Pre-built, credentialed, state-licensed. You don&rsquo;t build it. You don&rsquo;t maintain it. You inherit it.</div>
              </div>
              <div className="pillar-card">
                <div className="pillar-card-label">AI-Powered</div>
                <div className="pillar-card-title">End-to-end automation</div>
                <div className="pillar-card-body">From intake to clinician review, the administrative bottleneck is gone. AI handles the workflow. Clinicians handle the judgment. Nothing falls through the cracks.</div>
              </div>
              <div className="pillar-card">
                <div className="pillar-card-label">Predictable</div>
                <div className="pillar-card-title">PEPM pricing</div>
                <div className="pillar-card-body">Predictable, scalable, fits most stop-loss criteria. Your UM cost scales with your membership. No surprise invoices. No fixed overhead when membership fluctuates.</div>
              </div>
            </div>

            <p><strong>You buy the outcome. We own the infrastructure.</strong></p>

            {/* ── Section: Founding partners ── */}
            <h2>For founding TPA partners.</h2>

            <p>VantaUM is currently onboarding founding partners to our initial capacity of 300,000&ndash;340,000 member lives. Founding partners lock in PEPM rates before pricing scales at full buildout.</p>

            <p>If your TPA is ready to stop building UM infrastructure and start buying UM outcomes, we should talk.</p>
          </div>

          {/* CTA Box */}
          <div className="blog-cta">
            <span className="blog-cta-kicker">Founding Partners</span>
            <h3>Ready to buy outcomes, not infrastructure?</h3>
            <p>VantaUM is accepting founding TPA partners. Limited capacity at launch pricing.</p>
            <a className="btn-primary" href={EA_EMAIL}>Request Early Access →</a>
          </div>
        </article>

        {/* Footer */}
        <footer className="vum-footer">
          <div className="footer-logo"><span>Vanta</span>UM</div>
          <p>&copy; {new Date().getFullYear()} Wells Onyx. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
