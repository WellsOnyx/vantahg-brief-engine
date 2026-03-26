'use client';

import DemoWalkthrough from '@/components/demo/DemoWalkthrough';

/* ─── CSS-in-JS style object for the marketing page ─── */
/* Uses the Wells Onyx dark palette with Cormorant Garamond + DM Sans */

const EA_EMAIL = 'mailto:hello@wellsonyx.com?subject=VantaUM%20Early%20Access%20Demo';

export default function SitePage() {
  return (
    <>
      {/* Google Fonts for the marketing page */}
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

        /* ── Early Access Bar ── */
        .ea-bar { position:fixed;top:0;left:0;right:0;z-index:101;background:var(--teal);color:#fff;padding:10px 56px;display:flex;align-items:center;justify-content:center;gap:16px;font-size:13px;font-weight:400;letter-spacing:0.02em; }
        .ea-bar-pill { background:rgba(255,255,255,0.18);color:#fff;font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;padding:3px 10px;border-radius:20px;white-space:nowrap; }
        .ea-bar-text { color:rgba(255,255,255,0.82); }
        .ea-bar-link { color:#fff;font-weight:500;text-decoration:underline;text-underline-offset:2px;white-space:nowrap; }

        /* ── Nav ── */
        .vum-nav { position:fixed;top:40px;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:18px 56px;border-bottom:1px solid var(--border);background:rgba(7,8,10,0.9);backdrop-filter:blur(16px); }
        .nav-left { display:flex;align-items:baseline;gap:0; }
        .nav-wordmark { font-family:var(--sans);font-size:15px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--white);text-decoration:none; }
        .nav-wordmark span { color:var(--teal); }
        .nav-sub { font-size:11px;font-weight:300;letter-spacing:0.08em;text-transform:uppercase;color:var(--white-dim);margin-left:12px; }
        .nav-links { display:flex;gap:36px;list-style:none; }
        .nav-links a { font-size:13px;font-weight:300;color:var(--white-muted);text-decoration:none;transition:color 0.2s; }
        .nav-links a:hover { color:var(--white); }
        .nav-cta { border:1px solid var(--border-strong);color:var(--white);background:transparent;padding:9px 22px;border-radius:4px;font-size:13px;font-weight:400;text-decoration:none;transition:border-color 0.2s,color 0.2s; }
        .nav-cta:hover { border-color:var(--teal);color:var(--teal); }

        /* ── Hero ── */
        .vum-hero { min-height:100vh;display:grid;grid-template-columns:1fr 1fr;align-items:center;padding:170px 56px 80px;gap:80px;position:relative;overflow:hidden; }
        .vum-hero::before { content:'';position:absolute;top:0;right:0;width:55%;height:100%;background:radial-gradient(ellipse 80% 70% at 70% 40%,rgba(91,138,245,0.04) 0%,transparent 70%);pointer-events:none; }
        .hero-vline { position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--border); }
        .eyebrow { display:flex;align-items:center;gap:12px;font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--teal);margin-bottom:32px; }
        .eyebrow::before { content:'';display:block;width:32px;height:1px;background:var(--teal);flex-shrink:0; }
        .vum-hero h1 { font-family:var(--serif);font-size:clamp(48px,5.5vw,80px);font-weight:300;line-height:1.08;letter-spacing:-0.5px;color:var(--white);margin-bottom:32px; }
        .vum-hero h1 em { font-style:italic;color:var(--teal); }
        .hero-body { font-size:17px;font-weight:300;line-height:1.7;color:var(--white-muted);max-width:480px;margin-bottom:48px; }
        .hero-actions { display:flex;gap:20px;align-items:center; }
        .btn-primary { background:var(--teal);color:#fff;padding:13px 30px;border-radius:4px;font-family:var(--sans);font-size:14px;font-weight:500;text-decoration:none;transition:opacity 0.2s,transform 0.15s;display:inline-block; }
        .btn-primary:hover { opacity:0.88;transform:translateY(-1px); }
        .btn-ghost { font-size:14px;font-weight:300;color:var(--white-muted);text-decoration:none;display:flex;align-items:center;gap:8px;transition:color 0.2s; }
        .btn-ghost:hover { color:var(--white); }
        .hero-right { position:relative;z-index:1;display:flex;flex-direction:column;gap:2px; }
        .hero-stat { border:1px solid var(--border);border-radius:6px;padding:28px 32px;background:var(--surface);transition:border-color 0.2s; }
        .hero-stat:hover { border-color:var(--border-strong); }
        .stat-val { font-family:var(--serif);font-size:38px;font-weight:300;line-height:1;margin-bottom:8px; }
        .stat-label { font-size:13px;font-weight:300;color:var(--white-muted);line-height:1.4; }

        /* ── Shared section styles ── */
        hr.divider { border:none;border-top:1px solid var(--border);margin:0; }
        .vum-section { padding:100px 56px; }
        .kicker { font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--teal);margin-bottom:20px;display:block; }
        h2.sh { font-family:var(--serif);font-weight:300;font-size:clamp(34px,4vw,56px);line-height:1.1;letter-spacing:-0.3px;color:var(--white);margin-bottom:20px; }
        h2.sh em { font-style:italic;color:var(--teal); }
        p.sb { font-size:16px;font-weight:300;line-height:1.75;color:var(--white-muted); }

        /* ── Demo Section ── */
        .demo-frame-label { display:inline-flex;align-items:center;gap:10px;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--teal);padding:10px 20px;background:var(--surface);border:1px solid rgba(91,138,245,0.25);border-bottom:none;border-radius:8px 8px 0 0;width:fit-content; }
        .demo-live-dot { width:7px;height:7px;border-radius:50%;background:var(--teal);animation:pulse 2s ease-in-out infinite; }
        .demo-cta-row { margin-top:32px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;padding:28px 32px;background:var(--surface);border:1px solid var(--border);border-radius:8px; }
        .demo-cta-text { font-size:15px;font-weight:300;color:var(--white-muted);max-width:480px; }

        /* ── Early Access Section ── */
        .ea-section { background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:72px 56px; }
        .ea-inner { max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:80px;align-items:center; }
        .ea-perks { display:flex;flex-direction:column;gap:3px; }
        .ea-perk { display:flex;align-items:flex-start;gap:16px;padding:20px 24px;background:var(--surface-2);border:1px solid var(--border);border-radius:6px;transition:border-color 0.2s; }
        .ea-perk:hover { border-color:var(--border-strong); }
        .ea-perk-num { font-family:var(--serif);font-size:22px;font-weight:300;color:var(--gold);flex-shrink:0;line-height:1;margin-top:2px; }
        .ea-perk-title { font-size:14px;font-weight:500;color:var(--white);margin-bottom:4px; }
        .ea-perk-body { font-size:13px;font-weight:300;color:var(--white-muted);line-height:1.55; }
        .ea-spots { margin-top:28px;padding:20px 24px;background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);border-radius:6px;display:flex;align-items:center;gap:14px; }
        .ea-spots-dot { width:10px;height:10px;border-radius:50%;background:var(--gold);flex-shrink:0;animation:pulse 2s ease-in-out infinite; }
        .ea-spots-text { font-size:13px;font-weight:300;color:var(--gold);line-height:1.4; }
        .ea-spots-text strong { font-weight:500; }
        @keyframes pulse { 0%,100%{opacity:1;transform:scale(1);} 50%{opacity:0.6;transform:scale(0.85);} }

        /* ── Philosophy ── */
        .philosophy { background:var(--near-black); }
        .phil-inner { max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1.1fr;gap:100px;align-items:center; }
        .flow { display:flex;flex-direction:column;gap:3px; }
        .flow-row { display:flex;gap:3px; }
        .flow-cell { border-radius:6px;padding:22px 24px;display:flex;flex-direction:column;gap:6px; }
        .flow-cell.human { background:var(--surface-2);border:1px solid var(--border);flex:0 0 40%; }
        .flow-cell.machine { background:rgba(91,138,245,0.07);border:1px solid rgba(91,138,245,0.18);flex:1; }
        .flow-cell.clinical { background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);flex:0 0 40%; }
        .fl { font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;opacity:0.55; }
        .flow-cell.machine .fl { color:var(--teal);opacity:0.8; }
        .flow-cell.human .fl { color:var(--white-muted); }
        .flow-cell.clinical .fl { color:var(--gold); }
        .ft { font-size:13px;font-weight:400;line-height:1.4; }
        .flow-cell.machine .ft { color:#a8c0fa; }
        .flow-cell.human .ft { color:var(--white); }
        .flow-cell.clinical .ft { color:var(--gold); }
        .flow-bridge { text-align:center;padding:10px 0;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--white-dim);display:flex;align-items:center; }
        .flow-bridge::before,.flow-bridge::after { content:'';flex:1;height:1px;background:var(--border);margin:0 14px; }

        /* ── Pillars ── */
        .pillars-grid { display:grid;grid-template-columns:repeat(3,1fr);gap:2px; }
        .pillar { padding:48px 40px;background:var(--surface);border:1px solid var(--border);transition:border-color 0.25s; }
        .pillars-grid>.pillar:first-child { border-radius:8px 0 0 8px; }
        .pillars-grid>.pillar:last-child { border-radius:0 8px 8px 0; }
        .pillar:hover { border-color:var(--border-strong); }
        .pnum { font-family:var(--serif);font-size:52px;font-weight:300;line-height:1;margin-bottom:24px;display:block; }
        .pname { font-family:var(--serif);font-size:24px;font-weight:300;color:var(--white);margin-bottom:14px;line-height:1.2; }
        .pbody { font-size:14px;font-weight:300;line-height:1.7;color:var(--white-muted); }
        .ptag { display:inline-block;margin-top:24px;font-size:11px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;padding:4px 12px;border-radius:3px; }

        /* ── Manifesto ── */
        .manifesto { background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border);padding:80px 56px;display:flex;align-items:center;justify-content:center;text-align:center; }
        .qmark { font-family:var(--serif);font-size:72px;font-weight:300;line-height:0.6;color:var(--teal);opacity:0.4;display:block;margin-bottom:36px; }
        .qtext { font-family:var(--serif);font-size:clamp(26px,3.5vw,44px);font-weight:300;line-height:1.25;letter-spacing:-0.3px;color:var(--white); }
        .qtext em { font-style:italic;color:var(--teal); }
        .qattr { margin-top:32px;font-size:12px;font-weight:300;letter-spacing:0.1em;text-transform:uppercase;color:var(--white-dim); }

        /* ── Compare Table ── */
        table.ctable { width:100%;border-collapse:collapse; }
        table.ctable thead tr { border-bottom:1px solid var(--border); }
        table.ctable th { padding:14px 24px;text-align:left;font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase; }
        table.ctable th:nth-child(1) { color:var(--white-dim);width:22%; }
        table.ctable th:nth-child(2) { color:var(--white-dim);width:39%; }
        table.ctable th:nth-child(3) { color:var(--teal);width:39%; }
        table.ctable td { padding:22px 24px;vertical-align:top;font-size:14px;line-height:1.6;font-weight:300;border-bottom:1px solid var(--border); }
        table.ctable td:nth-child(1) { color:var(--white-muted);font-style:italic; }
        table.ctable td:nth-child(2) { color:var(--white-dim); }
        table.ctable td:nth-child(3) { color:var(--white); }
        .tgood { display:inline-block;padding:1px 8px;border-radius:3px;background:var(--teal-dim);color:var(--teal);font-size:11px;font-weight:500;letter-spacing:0.06em;margin-left:8px; }

        /* ── URAC ── */
        .urac-inner { max-width:1200px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:100px;align-items:center; }
        .urac-list { display:flex;flex-direction:column;gap:3px; }
        .urac-item { display:flex;align-items:flex-start;gap:20px;padding:28px;background:var(--surface);border:1px solid var(--border);border-radius:6px;transition:border-color 0.2s; }
        .urac-item:hover { border-color:var(--border-strong); }
        .udot { width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:6px; }
        .utitle { font-size:15px;font-weight:400;color:var(--white);margin-bottom:6px; }
        .ubody { font-size:13px;font-weight:300;color:var(--white-muted);line-height:1.55; }

        /* ── Family Banner ── */
        .fam-banner { padding:28px 56px;background:var(--surface);border-top:1px solid var(--border);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:24px; }
        .fam-label { font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--white-dim);white-space:nowrap; }
        .fam-pipe { width:1px;height:24px;background:var(--border); }
        .fam-text { font-size:13px;font-weight:300;color:var(--white-muted); }
        .fam-text a { color:var(--teal);text-decoration:none; }
        .fam-text a:hover { text-decoration:underline; }

        /* ── CTA ── */
        .cta-section { background:var(--near-black);text-align:center;padding:120px 56px; }
        .cta-actions { display:flex;gap:20px;justify-content:center;flex-wrap:wrap; }

        /* ── Footer ── */
        .vum-footer { background:var(--black);border-top:1px solid var(--border);padding:40px 56px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
        .footer-logo { font-family:var(--sans);font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--white); }
        .footer-logo span { color:var(--teal); }
        .vum-footer p { font-size:12px;color:var(--white-dim); }

        /* ── Animations ── */
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
        .hero-left .eyebrow { animation:fadeUp 0.6s ease both; }
        .hero-left h1 { animation:fadeUp 0.7s 0.1s ease both; }
        .hero-left .hero-body { animation:fadeUp 0.7s 0.2s ease both; }
        .hero-left .hero-actions { animation:fadeUp 0.7s 0.3s ease both; }
        .hero-right { animation:fadeUp 0.8s 0.25s ease both; }

        /* ── Responsive ── */
        @media (max-width:960px) {
          .vum-nav { padding:18px 24px; }
          .nav-links { display:none; }
          .vum-hero { grid-template-columns:1fr;padding:100px 24px 60px;gap:48px; }
          .hero-vline { display:none; }
          .hero-right { display:none; }
          .vum-section { padding:72px 24px; }
          .phil-inner,.urac-inner { grid-template-columns:1fr;gap:48px; }
          .pillars-grid { grid-template-columns:1fr; }
          .pillar,.pillars-grid>.pillar:first-child,.pillars-grid>.pillar:last-child { border-radius:6px; }
          .ea-bar { padding:10px 16px;flex-wrap:wrap;gap:8px; }
          .ea-inner { grid-template-columns:1fr;gap:48px; }
          .fam-banner { padding:20px 24px;flex-wrap:wrap; }
          .manifesto { padding:60px 24px; }
          .vum-footer { padding:32px 24px;flex-direction:column;text-align:center; }
          .demo-cta-row { flex-direction:column;align-items:flex-start; }
          .cta-section { padding:72px 24px; }
        }
      `}</style>

      <div className="vum-site">
        {/* Early Access Bar */}
        <div className="ea-bar">
          <span className="ea-bar-pill">Early Access</span>
          <span className="ea-bar-text">VantaUM is now accepting founding TPA partners — limited spots available.</span>
          <a href={EA_EMAIL} className="ea-bar-link">Apply now →</a>
        </div>

        {/* Nav */}
        <nav className="vum-nav">
          <div className="nav-left">
            <a className="nav-wordmark" href="#"><span>Vanta</span>UM</a>
            <span className="nav-sub">A Wells Onyx Company</span>
          </div>
          <ul className="nav-links">
            <li><a href="#philosophy">Philosophy</a></li>
            <li><a href="#model">Our Model</a></li>
            <li><a href="#compare">Why VantaUM</a></li>
            <li><a href="#demo">Live Demo</a></li>
            <li><a href="#urac">Accreditation</a></li>
          </ul>
          <a className="nav-cta" href="#contact">Request Early Access</a>
        </nav>

        {/* Hero */}
        <section className="vum-hero">
          <div className="hero-vline" />
          <div className="hero-left" style={{ position: 'relative', zIndex: 1 }}>
            <div className="eyebrow">Now Accepting Founding TPA Partners</div>
            <h1>AI that makes UM<br /><em>more</em> human,<br />not less.</h1>
            <p className="hero-body">VantaUM pairs a world-class concierge team and elite same-specialty physicians with AI engineered to eliminate friction in the middle — so every human in the process can stay focused on what only humans can do.</p>
            <div className="hero-actions">
              <a href="#contact" className="btn-primary">Request Early Access</a>
              <a href="#compare" className="btn-ghost">Compare to legacy UM →</a>
            </div>
          </div>
          <div className="hero-right">
            <div className="hero-stat"><div className="stat-val" style={{ color: 'var(--gold)' }}>Founding</div><div className="stat-label">Limited founding partner slots open now. Early access means preferred pricing, roadmap input, and white-glove onboarding.</div></div>
            <div className="hero-stat"><div className="stat-val">~$12 PEPM</div><div className="stat-label">Market-validated pricing locked in for founding partners. No volume thresholds.</div></div>
            <div className="hero-stat"><div className="stat-val">URAC</div><div className="stat-label">Accreditation in progress. Founding partners go live with a fully accredited UM operation.</div></div>
          </div>
        </section>

        <hr className="divider" />

        {/* Early Access */}
        <section className="ea-section" id="early-access">
          <div className="ea-inner">
            <div className="ea-left">
              <span className="kicker" style={{ color: 'var(--gold)' }}>Founding Partner Program</span>
              <h2 className="sh">We are new.<br />That is the <em style={{ color: 'var(--gold)' }}>point.</em></h2>
              <p className="sb">The legacy players built their platforms in a different era — before AI could compress physician review time, before concierge coordination was operationally viable at scale. We built VantaUM from a blank page with those tools available from day one.</p>
              <p className="sb" style={{ marginTop: 16 }}>The TPAs that partner with us now don&apos;t inherit someone else&apos;s technical debt. They help shape a platform designed around how UM should actually work.</p>
              <div className="ea-spots">
                <div className="ea-spots-dot" />
                <div className="ea-spots-text"><strong>Founding partner slots are limited.</strong> Early access includes preferred pricing, direct access to the founding team, and input on product roadmap.</div>
              </div>
            </div>
            <div className="ea-perks">
              {[
                { num: '01', title: 'Preferred Founding Pricing', body: 'Early partners lock in rates that reflect the relationship, not a vendor transaction. Pricing is validated at ~$12 PEPM — and founding partners negotiate directly with leadership.' },
                { num: '02', title: 'Roadmap Input', body: 'Your operational reality shapes what we build next. Founding partners have a direct line to the product team — not a support ticket and a quarterly roadmap review.' },
                { num: '03', title: 'Reference Account Status', body: 'Be among the first TPAs in the market to operate a concierge UM model. Reference status positions your organization as a clinical quality leader to your plan sponsors.' },
                { num: '04', title: 'White-Glove Onboarding', body: 'Founding partners get hands-on implementation directly with the Wells Onyx operating team — not a third-party integrator who read the manual last week.' },
              ].map((p) => (
                <div key={p.num} className="ea-perk">
                  <div className="ea-perk-num">{p.num}</div>
                  <div><div className="ea-perk-title">{p.title}</div><div className="ea-perk-body">{p.body}</div></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Philosophy */}
        <section className="vum-section philosophy" id="philosophy">
          <div className="phil-inner">
            <div>
              <span className="kicker">Our Philosophy</span>
              <h2 className="sh">The middle should be<br /><em>invisible.</em></h2>
              <p className="sb" style={{ maxWidth: 440 }}>Every other UM platform automated the easy parts and declared victory. They left physicians staring at intake queues, coordinators managing software tickets, and members waiting for a human who never comes.</p>
              <p className="sb" style={{ maxWidth: 440, marginTop: 18 }}>We built differently. AI handles intake, evidence matching, routing, and documentation — invisibly, instantly. So the clinician opens a pre-briefed case ready for judgment. The coordinator is free to actually take care of people.</p>
            </div>
            <div>
              <div className="flow">
                <div className="flow-row">
                  <div className="flow-cell human" style={{ flex: '0 0 42%' }}><div className="fl">Concierge Layer</div><div className="ft">Named coordinator owns every case from intake to decision</div></div>
                  <div className="flow-cell machine"><div className="fl">AI Intake</div><div className="ft">Document ingestion, completeness check &amp; triage in seconds</div></div>
                </div>
                <div className="flow-bridge">workflow</div>
                <div className="flow-row">
                  <div className="flow-cell machine"><div className="fl">AI Routing</div><div className="ft">Evidence matching, policy alignment, auto-approval for clear-cut cases</div></div>
                  <div className="flow-cell clinical" style={{ flex: '0 0 42%' }}><div className="fl">Clinical Review</div><div className="ft">Complex cases → same-specialty physician, pre-briefed. No queue.</div></div>
                </div>
                <div className="flow-bridge">workflow</div>
                <div className="flow-row">
                  <div className="flow-cell human" style={{ flex: 1 }}><div className="fl">Decision &amp; Communication</div><div className="ft">Clear rationale delivered to provider and member. Human available immediately.</div></div>
                  <div className="flow-cell machine" style={{ flex: '0 0 38%' }}><div className="fl">AI Documentation</div><div className="ft">Full URAC-compliant audit trail generated automatically</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="vum-section" id="model" style={{ background: 'var(--black)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ maxWidth: 580, marginBottom: 64 }}>
              <span className="kicker">The VantaUM Model</span>
              <h2 className="sh">Three layers.<br />Each doing what it does <em>best.</em></h2>
            </div>
            <div className="pillars-grid">
              <div className="pillar"><span className="pnum" style={{ color: 'var(--white-dim)' }}>01</span><div className="pname">Concierge Team</div><p className="pbody">A dedicated, named coordinator assigned to each plan. They know the plan&apos;s policies, the provider relationships, and the member population. Available. Accountable. Never a call center rotation.</p><span className="ptag" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--white-muted)' }}>Human-first</span></div>
              <div className="pillar"><span className="pnum" style={{ color: 'rgba(91,138,245,0.45)' }}>02</span><div className="pname">AI Intelligence Layer</div><p className="pbody">Our ingestion engine extracts and classifies clinical documentation, cross-references evidence-based guidelines, and prepares the full case brief before a physician ever opens the file. Review time compressed dramatically — judgment preserved entirely.</p><span className="ptag" style={{ background: 'rgba(91,138,245,0.1)', color: 'var(--teal)' }}>AI-powered</span></div>
              <div className="pillar"><span className="pnum" style={{ color: 'rgba(201,169,110,0.4)' }}>03</span><div className="pname">Elite Physician Panel</div><p className="pbody">Board-certified specialists in active practice. Not generalists in a queue — same-specialty physicians who understand the clinical picture. When a cardiology case arrives, a cardiologist reviews it.</p><span className="ptag" style={{ background: 'var(--gold-dim)', color: 'var(--gold)' }}>Clinical excellence</span></div>
            </div>
          </div>
        </section>

        {/* Manifesto */}
        <div className="manifesto">
          <div style={{ maxWidth: 860 }}>
            <span className="qmark">&ldquo;</span>
            <p className="qtext">Every platform that replaced a clinician with an algorithm made the care <em>cheaper.</em> Very few made it better. We built VantaUM to do both — and we refused to sacrifice one for the other.</p>
            <p className="qattr">VantaUM &middot; A Wells Onyx Company</p>
          </div>
        </div>

        {/* Compare */}
        <section className="vum-section" id="compare" style={{ background: 'var(--near-black)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ maxWidth: 560, marginBottom: 56 }}>
              <span className="kicker">Why VantaUM</span>
              <h2 className="sh">What legacy UM<br />won&apos;t tell you.</h2>
              <p className="sb">Legacy platforms were built to process volume. VantaUM was built to serve members, protect providers, and give plans a UM partner they can actually stand behind.</p>
            </div>
            <table className="ctable">
              <thead><tr><th>The Question</th><th>Legacy UM</th><th>VantaUM</th></tr></thead>
              <tbody>
                <tr><td>Who reviews complex cases?</td><td>Nurses working a volume queue. Physician involvement is the exception.</td><td>Same-specialty, board-certified physicians in active practice.<span className="tgood">Always</span></td></tr>
                <tr><td>How do I reach someone?</td><td>Call center. Ticket submitted. Wait for a callback.</td><td>Named concierge coordinator. Direct line. Same day response.</td></tr>
                <tr><td>What role does AI play?</td><td>AI auto-approves and auto-denies. The human is an exception handler.</td><td>AI handles intake, routing, and documentation. Every consequential clinical call is human.</td></tr>
                <tr><td>What if I disagree?</td><td>Submit an appeal. Wait. Navigate a process designed to discourage escalation.</td><td>Peer-to-peer with a same-specialty physician available immediately. Clear, fast escalation.</td></tr>
                <tr><td>How is compliance managed?</td><td>Separate compliance team. Documentation created after the fact.</td><td>AI generates URAC-compliant documentation in real time. Audit-ready from day one.</td></tr>
                <tr><td>What channels does this unlock?</td><td>Commercial configurations only in most cases.</td><td>URAC accreditation unlocks Medicaid, VA, and self-insured employer channels.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Live Demo — inlined, no iframe */}
        <section className="vum-section" id="demo" style={{ background: 'var(--black)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ maxWidth: 600, marginBottom: 48 }}>
              <span className="kicker">See It Live</span>
              <h2 className="sh">Watch the AI work.<br /><em>Then meet the humans behind it.</em></h2>
              <p className="sb">This is a live demo of the VantaUM intake and clinical routing engine. Submit a case and see how AI compresses the middle — so the clinician receives a fully pre-briefed file, not a raw document stack.</p>
            </div>
            <div>
              <div className="demo-frame-label"><span className="demo-live-dot" /> Live Demo Environment</div>
              <div style={{ borderRadius: '0 12px 12px 12px', overflow: 'hidden', border: '1px solid var(--border-strong)' }}>
                <DemoWalkthrough />
              </div>
              <div className="demo-cta-row">
                <p className="demo-cta-text">Ready to see how this runs on your actual member population?</p>
                <a href={EA_EMAIL} className="btn-primary">Apply for Early Access</a>
              </div>
            </div>
          </div>
        </section>

        {/* URAC */}
        <section className="vum-section" id="urac" style={{ background: 'var(--black)' }}>
          <div className="urac-inner">
            <div>
              <span className="kicker">Accreditation</span>
              <h2 className="sh">URAC is the key<br />that opens the<br /><em>right rooms.</em></h2>
              <p className="sb" style={{ maxWidth: 420 }}>Most UM vendors serve the commercial market and stop there. URAC accreditation positions VantaUM as a credentialed partner for the most regulated, highest-value programs in American healthcare.</p>
            </div>
            <div className="urac-list">
              <div className="urac-item"><div className="udot" style={{ background: 'var(--teal)' }} /><div><div className="utitle">Medicaid Programs</div><div className="ubody">State Medicaid contracts require URAC or equivalent UM accreditation. Accreditation is the entry ticket — it&apos;s the floor, not the ceiling.</div></div></div>
              <div className="urac-item"><div className="udot" style={{ background: 'var(--gold)' }} /><div><div className="utitle">VA &amp; Federal Health Programs</div><div className="ubody">Department of Veterans Affairs programs require certified UM oversight from accredited organizations. A critical channel for a company with federal relationships in development.</div></div></div>
              <div className="urac-item"><div className="udot" style={{ background: 'rgba(255,255,255,0.35)' }} /><div><div className="utitle">Self-Insured Employers</div><div className="ubody">Large self-funded employers increasingly require URAC-accredited UM partners. Accreditation signals clinical rigor before a single conversation begins.</div></div></div>
            </div>
          </div>
        </section>

        {/* Family Banner */}
        <div className="fam-banner">
          <span className="fam-label">Wells Onyx Portfolio</span>
          <div className="fam-pipe" />
          <p className="fam-text">VantaUM is part of the <a href="https://www.wellsonyx.com" target="_blank" rel="noopener noreferrer">Wells Onyx</a> constellation — alongside VantaHG, Onyx Semiconductor, Grain &amp; Vault, WellsAI, and Codebeacons. Trust + Outcomes.</p>
        </div>

        {/* CTA */}
        <section className="cta-section" id="contact">
          <span className="kicker" style={{ display: 'block' }}>Founding Partner Program</span>
          <h2 className="sh" style={{ maxWidth: 700, margin: '0 auto 20px' }}>A few spots remain.<br /><em>Will you be one<br />of the first?</em></h2>
          <p className="sb" style={{ maxWidth: 500, margin: '0 auto 16px' }}>We are selectively onboarding founding TPA partners who want to shape what great UM looks like — and be positioned as a clinical quality leader before anyone else gets there.</p>
          <p className="sb" style={{ maxWidth: 500, margin: '0 auto 48px' }}>Email us directly. No form. No sales queue. You&apos;ll hear back from someone who can actually make a decision.</p>
          <div className="cta-actions">
            <a href={EA_EMAIL} className="btn-primary">Apply for Early Access</a>
            <a href="#model" className="btn-ghost">Explore the model →</a>
          </div>
        </section>

        {/* Footer */}
        <footer className="vum-footer">
          <div className="footer-logo"><span>Vanta</span>UM</div>
          <p>A Wells Onyx Company &middot; Houston &middot; Miami &middot; Tallahassee</p>
          <p>&copy; 2026 VantaUM. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
