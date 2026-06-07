'use client';

import DemoWalkthrough from '@/components/demo/DemoWalkthrough';

/* ─── CSS-in-JS style object for the marketing page ─── */
/* Uses the Wells Onyx dark palette with Cormorant Garamond + DM Sans */

const EA_EMAIL = 'mailto:hello@wellsonyx.com?subject=VantaUM%20Out-of-Network%20UM%20Clinical%20Layer';

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
        .nav-cta-group { display:flex;align-items:center;gap:10px; }
        .nav-cta { border:1px solid var(--border-strong);color:var(--white);background:transparent;padding:9px 22px;border-radius:4px;font-size:13px;font-weight:400;text-decoration:none;transition:border-color 0.2s,color 0.2s,background 0.2s; }
        .nav-cta:hover { border-color:var(--teal);color:var(--teal); }
        .nav-cta-primary { background:var(--teal);border-color:var(--teal);color:var(--black); }
        .nav-cta-primary:hover { background:transparent;color:var(--teal); }

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

        /* ── Role Selector ── */
        .role-hero { min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:170px 56px 80px;position:relative;overflow:hidden; }
        .role-hero::before { content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 40%,rgba(91,138,245,0.04) 0%,transparent 70%);pointer-events:none; }
        .role-headline { font-family:var(--serif);font-size:clamp(38px,5vw,68px);font-weight:300;line-height:1.08;letter-spacing:-0.5px;color:var(--white);text-align:center;margin-bottom:16px; }
        .role-sub { font-size:16px;font-weight:300;color:var(--white-muted);text-align:center;margin-bottom:64px;max-width:520px; }
        .role-cards { display:grid;grid-template-columns:repeat(3,1fr);gap:2px;width:100%;max-width:1100px; }
        .role-card { background:var(--surface);border:1px solid var(--border);padding:48px 40px;border-radius:0;position:relative;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;gap:0;transition:border-color 0.25s,background 0.25s;cursor:pointer; }
        .role-cards>.role-card:first-child { border-radius:8px 0 0 8px; }
        .role-cards>.role-card:last-child { border-radius:0 8px 8px 0; }
        .role-card::before { content:'';position:absolute;inset:0;opacity:0;transition:opacity 0.3s; }
        .role-card.tpa::before { background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(91,138,245,0.07) 0%,transparent 70%); }
        .role-card.broker::before { background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(201,169,110,0.07) 0%,transparent 70%); }
        .role-card.chro::before { background:radial-gradient(ellipse 80% 60% at 50% 0%,rgba(91,138,245,0.05) 0%,transparent 70%); }
        .role-card:hover { border-color:var(--border-strong); }
        .role-card:hover::before { opacity:1; }
        .role-card-eyebrow { font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:28px;display:flex;align-items:center;gap:10px; }
        .role-card.tpa .role-card-eyebrow { color:var(--teal); }
        .role-card.broker .role-card-eyebrow { color:var(--gold); }
        .role-card.chro .role-card-eyebrow { color:var(--teal); }
        .role-card-eyebrow::before { content:'';display:block;width:24px;height:1px;flex-shrink:0; }
        .role-card.tpa .role-card-eyebrow::before { background:var(--teal); }
        .role-card.broker .role-card-eyebrow::before { background:var(--gold); }
        .role-card.chro .role-card-eyebrow::before { background:var(--teal); }
        .role-card-title { font-family:var(--serif);font-size:clamp(26px,2.5vw,36px);font-weight:300;line-height:1.1;color:var(--white);margin-bottom:20px; }
        .role-card-body { font-size:14px;font-weight:300;line-height:1.7;color:var(--white-muted);flex:1;margin-bottom:36px; }
        .role-card-cta { font-size:13px;font-weight:400;display:flex;align-items:center;gap:8px;transition:gap 0.2s; }
        .role-card.tpa .role-card-cta { color:var(--teal); }
        .role-card.broker .role-card-cta { color:var(--gold); }
        .role-card.chro .role-card-cta { color:var(--teal); }
        .role-card:hover .role-card-cta { gap:14px; }

        /* ── Animations ── */
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
        .role-hero .role-headline { animation:fadeUp 0.6s ease both; }
        .role-hero .role-sub { animation:fadeUp 0.7s 0.1s ease both; }
        .role-hero .role-cards { animation:fadeUp 0.8s 0.2s ease both; }
        .hero-left .eyebrow { animation:fadeUp 0.6s ease both; }
        .hero-left h1 { animation:fadeUp 0.7s 0.1s ease both; }
        .hero-left .hero-body { animation:fadeUp 0.7s 0.2s ease both; }
        .hero-left .hero-actions { animation:fadeUp 0.7s 0.3s ease both; }
        .hero-right { animation:fadeUp 0.8s 0.25s ease both; }

        /* ── Responsive ── */
        @media (max-width:960px) {
          .vum-nav { padding:18px 24px; }
          .nav-links { display:none; }
          .nav-cta-group { gap:6px; }
          .nav-cta { padding:8px 14px;font-size:12px; }
          .role-hero { padding:100px 24px 60px; }
          .role-cards { grid-template-columns:1fr; }
          .role-cards>.role-card:first-child { border-radius:6px; }
          .role-cards>.role-card:last-child { border-radius:6px; }
          .role-card { border-radius:6px; }
          .role-card.broker { border-left:1px solid var(--border) !important; border-right:1px solid var(--border) !important; }
          #tpa > div, #broker > div, #chro > div { grid-template-columns:1fr !important; }
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
          <span className="ea-bar-pill">Now Onboarding</span>
          <span className="ea-bar-text">A next-generation clinical layer for utilization management — run externally or embedded inside your team.</span>
          <a href={EA_EMAIL} className="ea-bar-link">Talk to us →</a>
          <span className="ea-bar-text" aria-hidden="true">·</span>
          <a href="/login" className="ea-bar-link">Sign in</a>
        </div>

        {/* Nav */}
        <nav className="vum-nav">
          <div className="nav-left">
            <a className="nav-wordmark" href="#"><span>Vanta</span>UM</a>
            <span className="nav-sub">A Wells Onyx Company</span>
          </div>
          <ul className="nav-links">
            <li><a href="#workflow">The Workflow</a></li>
            <li><a href="#oon-iro">Specialized</a></li>
            <li><a href="#ratecard">Rate Card</a></li>
            <li><a href="#demo">Live Demo</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <div className="nav-cta-group">
            <a className="nav-cta" href="/login">Sign In</a>
            <a className="nav-cta nav-cta-primary" href="#contact">Talk to Us</a>
          </div>
        </nav>

        {/* Hero — workflow-led */}
        <section className="vum-hero">
          <span className="hero-vline" aria-hidden="true" />
          <div className="hero-left">
            <div className="eyebrow">Clinical Layer for Utilization Management</div>
            <h1>Modern UM.<br />One clinician.<br /><em>Through appeal.</em></h1>
            <p className="hero-body">VantaUM is a next-generation clinical layer for utilization management — concierge intake, the AI Brief Engine, authorization, and first-level appeal, owned end to end by the same clinician. Run it across your whole self-funded book, or aim it at the cases that need it most. Built for independent TPAs, self-insured employers, and the clinical operations inside larger benefit organizations.</p>
            <div className="hero-actions">
              <a href={EA_EMAIL} className="btn-primary">Talk to Us</a>
              <a href="#workflow" className="btn-ghost">See the workflow →</a>
            </div>
          </div>
          <div className="hero-right">
            {[
              { step: '01', label: 'Concierge Intake', sub: 'A named coordinator opens the case and assembles the record — no portal queue, no handoffs. Part of the bundle.' },
              { step: '02', label: 'AI Brief Engine', sub: 'The case is pre-briefed against clinical criteria before a clinician ever opens it. Speed and quality, built in. Part of the bundle.' },
              { step: '03', label: 'Authorization + First-Level Appeal', sub: 'One reviewer owns the determination and the first-level appeal — continuity, not a relay race. This is the bundle.' },
              { step: '04', label: 'IRO-Ready Documentation', sub: 'Every case is documented to independent-review standard. Full IRO is a separate service, billed only if a case escalates.' },
            ].map((s) => (
              <div key={s.step} className="hero-stat">
                <div className="stat-val" style={{ fontSize: '22px', color: 'var(--teal)', display: 'flex', alignItems: 'baseline', gap: '12px' }}>
                  <span style={{ fontSize: '15px', color: 'var(--white-dim)', fontFamily: 'var(--sans)', letterSpacing: '0.1em' }}>{s.step}</span>
                  {s.label}
                </div>
                <div className="stat-label">{s.sub}</div>
              </div>
            ))}
          </div>
        </section>

        <hr className="divider" />

        {/* Engagement Model */}
        <section className="ea-section" id="engagement">
          <div className="ea-inner">
            <div className="ea-left">
              <span className="kicker" style={{ color: 'var(--gold)' }}>How We Engage</span>
              <h2 className="sh">External service,<br />or an <em style={{ color: 'var(--gold)' }}>extension</em><br />of your team.</h2>
              <p className="sb">VantaUM is built to drop into the way you already work. Run it across your whole self-funded book to take utilization management off your plate end to end — or stand us up inside your operation as a specialized arm of your own clinical team. Use it broadly, or aim it at the cases that carry the most clinical time and exposure.</p>
              <p className="sb" style={{ marginTop: 16 }}>Either way, the bundle is the same: a single clinician carrying each case from concierge intake through authorization and first-level appeal, with documentation prepared to be IRO-ready. If a case escalates to full independent review, that&apos;s a separate service — billed only when it happens.</p>
              <div className="ea-spots">
                <div className="ea-spots-dot" />
                <div className="ea-spots-text"><strong>Built for the teams that run the plan.</strong> Independent TPAs, self-insured employers, and the clinical operations inside larger benefit organizations — without inheriting anyone&apos;s technical debt.</div>
              </div>
            </div>
            <div className="ea-perks">
              {[
                { num: '01', title: 'Bundled, per case', body: 'One per-case rate for authorization plus first-level appeal. No per-member commitments, no volume floors — use it across the book or on the cases that warrant it. Full IRO is separate, only if a case escalates.' },
                { num: '02', title: 'Embedded in your operation', body: 'Prefer to keep it in house? We run as a specialized extension of your existing clinical team, using your criteria and your voice, under your brand.' },
                { num: '03', title: 'Continuity by design', body: 'The same clinician owns the authorization and the first-level appeal. No relay between reviewers, no context lost between stages.' },
                { num: '04', title: 'White-glove onboarding', body: 'You stand us up once, directly with the Wells Onyx operating team — not a third-party integrator who read the manual last week.' },
              ].map((p) => (
                <div key={p.num} className="ea-perk">
                  <div className="ea-perk-num">{p.num}</div>
                  <div><div className="ea-perk-title">{p.title}</div><div className="ea-perk-body">{p.body}</div></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Workflow Section ── */}
        <section className="vum-section" id="workflow" style={{ background: 'var(--near-black)', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
            <div>
              <span className="kicker" style={{ color: 'var(--teal)' }}>The Workflow</span>
              <h2 className="sh">One case.<br /><em>One owner.</em><br />No handoffs.</h2>
              <p className="sb" style={{ marginBottom: '24px' }}>Utilization management is where authorization decisions get made, appeals get filed, and documentation has to hold up when it&apos;s tested. Most operations split that journey across a queue of reviewers and lose the thread between every stage.</p>
              <p className="sb" style={{ marginBottom: '40px' }}>VantaUM runs the bundle as one continuous workflow: a concierge opens the case, the Brief Engine pre-briefs it, and a single clinician carries it through the authorization and the first-level appeal — leaving a file that&apos;s already IRO-ready. Full IRO itself is a separate service, only if the case escalates.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '40px' }}>
                {[
                  'Concierge intake. A named coordinator owns the record — no portal queue, no triage relay.',
                  'AI Brief Engine. Every case pre-briefed against clinical criteria before a clinician opens it.',
                  'Same clinician through first-level appeal. Continuity, not a relay race between reviewers.',
                  'IRO-ready documentation. Clean, criteria-cited files. Full IRO is a separate service, only on escalation.',
                ].map((item, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                    <span style={{ color: 'var(--teal)', flexShrink: 0, marginTop: '2px' }}>—</span>
                    <span style={{ fontSize: '14px', fontWeight: 300, color: 'var(--white-muted)', lineHeight: 1.6 }}>{item}</span>
                  </div>
                ))}
              </div>
              <a href={EA_EMAIL} className="btn-primary">Talk to Us</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {[
                { label: 'Concierge Intake', val: 'Step 01', sub: 'A named coordinator opens the case and assembles the record.' },
                { label: 'AI Brief Engine', val: 'Step 02', sub: 'Pre-briefed against clinical criteria before review — the secret sauce behind speed and quality.' },
                { label: 'Authorization → Appeal', val: 'Step 03', sub: 'The same clinician owns the determination and the first-level appeal. This is the bundle.' },
                { label: 'IRO-Ready File', val: 'Step 04', sub: 'Bundled work leaves a clean file. Full IRO is a separate service, only on escalation.' },
              ].map((s, i) => (
                <div key={i} className="hero-stat">
                  <div className="stat-val" style={{ fontSize: '20px', color: i === 1 ? 'var(--gold)' : 'var(--teal)', fontFamily: 'var(--sans)', letterSpacing: '0.08em' }}>{s.val}</div>
                  <div className="stat-label"><strong style={{ color: 'var(--white)' }}>{s.label}</strong> — {s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ── Rate Card Section ── */}
        <section className="vum-section" id="ratecard" style={{ background: 'var(--black)', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ maxWidth: 600, marginBottom: 56 }}>
              <span className="kicker" style={{ color: 'var(--gold)' }}>Rate Card</span>
              <h2 className="sh">Priced by the case.<br /><em>Bundled by design.</em></h2>
              <p className="sb">You pay for clinical work on the cases that warrant it — not a per-member fee on a population. Authorization and the first-level appeal come bundled as one per-case engagement, because they&apos;re one case — for everyday UM and for your highest-exposure out-of-network work alike. <strong style={{ color: 'var(--white)', fontWeight: 500 }}>Full IRO is not included in that rate</strong> — it&apos;s a separate escalation fee, billed only if and when a case actually goes to full independent review.</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
              {/* Bundled card */}
              <div style={{ padding: '40px', background: 'var(--surface)', border: '1px solid var(--border-strong)', borderRadius: '8px 0 0 8px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--teal)', marginBottom: '20px' }}>Bundled — Per Case</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300, lineHeight: 1.15, color: 'var(--white)', marginBottom: '8px' }}>Authorization<br />+ First-Level Appeal</div>
                <p style={{ fontSize: '14px', fontWeight: 300, lineHeight: 1.7, color: 'var(--white-muted)', marginTop: '16px', marginBottom: '28px', flex: 1 }}>One flat per-case rate covers exactly four things: concierge intake, the AI Brief Engine, the authorization, and the first-level appeal — all owned by the same clinician. Works for everyday UM and for out-of-network cases alike. Documentation is prepared to be IRO-ready. One case, one owner, one price. Full IRO is not part of this rate.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                  {[
                    { t: 'Concierge intake & record assembly', excl: false },
                    { t: 'AI Brief Engine pre-brief', excl: false },
                    { t: 'Authorization (in- or out-of-network)', excl: false },
                    { t: 'First-level appeal — same clinician', excl: false },
                    { t: 'IRO-ready documentation prepared', excl: false },
                    { t: 'Full IRO review — separate fee, not included', excl: true },
                  ].map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', fontWeight: 300, color: f.excl ? 'var(--white-dim)' : 'var(--white-muted)', lineHeight: 1.5 }}>
                      <span style={{ color: f.excl ? 'var(--white-dim)' : 'var(--teal)', flexShrink: 0 }}>{f.excl ? '✕' : '—'}</span>{f.t}
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--white)' }}>One bundled per-case rate <span style={{ color: 'var(--white-dim)', fontSize: '15px', fontStyle: 'italic' }}>— scoped on a brief call</span></div>
              </div>
              {/* IRO escalation card */}
              <div style={{ padding: '40px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: '0 8px 8px 0', display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '20px' }}>Separate — On Escalation</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '30px', fontWeight: 300, lineHeight: 1.15, color: 'var(--white)', marginBottom: '8px' }}>Full IRO<br />Review</div>
                <p style={{ fontSize: '14px', fontWeight: 300, lineHeight: 1.7, color: 'var(--white-muted)', marginTop: '16px', marginBottom: '28px', flex: 1 }}>When a case escalates beyond first-level appeal to full independent review, it&apos;s billed at a separate per-case rate. You only pay it when a case actually goes there — and the file arrives already clean and IRO-ready from the bundled work.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                  {['Independent, conflict-free review', 'Built on the IRO-ready file already assembled', 'Billed only on escalation', 'Same documentation standard throughout'].map((f, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '13px', fontWeight: 300, color: 'var(--white-muted)', lineHeight: 1.5 }}>
                      <span style={{ color: 'var(--gold)', flexShrink: 0 }}>—</span>{f}
                    </div>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: '22px', fontWeight: 300, color: 'var(--white)' }}>Separate per-case rate <span style={{ color: 'var(--white-dim)', fontSize: '15px', fontStyle: 'italic' }}>— only when it escalates</span></div>
              </div>
            </div>
            <p className="sb" style={{ marginTop: '32px', fontSize: '14px', color: 'var(--white-dim)' }}>Prefer to run it in house? The same workflow can be embedded inside your own clinical operation as a specialized extension of your team. We&apos;ll scope the engagement on a brief call.</p>
            <div style={{ marginTop: '36px' }}>
              <a href={EA_EMAIL} className="btn-primary" style={{ background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)' }}>Request the full rate card →</a>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* ── Specialized OON + IRO Capability Section ── */}
        <section className="vum-section" id="oon-iro" style={{ background: 'var(--near-black)', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <span className="kicker" style={{ color: 'var(--gold)' }}>Specialized Capability</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'start', marginTop: '0' }}>
              <div>
                <h2 className="sh">The same engine,<br />tuned for your<br /><em>hardest cases.</em></h2>
                <p className="sb" style={{ marginBottom: '24px' }}>The whole platform runs your everyday utilization management. But out-of-network is its own discipline — high-stakes, appeal-prone, and unforgiving on documentation — and it&apos;s where VantaUM is genuinely differentiated.</p>
                <p className="sb" style={{ marginBottom: '24px' }}>For out-of-network work, the same concierge intake, Brief Engine, and single-clinician continuity become a precision instrument: defensible authorizations, first-level appeals owned by the same reviewer, and files documented to independent-review standard. If a case escalates, <strong style={{ color: 'var(--white)', fontWeight: 500 }}>full IRO is available as a separate service</strong> — not bundled into the base rate, billed only when it happens.</p>
                <p className="sb" style={{ marginBottom: '40px' }}>It&apos;s the capability ASOs and larger benefit organizations come for — and it sits on top of the general UM layer everyone else uses every day.</p>
                <a href={EA_EMAIL} className="btn-primary" style={{ background: 'transparent', border: '1px solid var(--gold)', color: 'var(--gold)' }}>Talk to us about OON + IRO →</a>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ padding: '28px 32px', background: 'rgba(201,169,110,0.07)', border: '1px solid rgba(201,169,110,0.18)', borderRadius: '6px', marginBottom: '2px' }}>
                  <p style={{ fontFamily: 'var(--serif)', fontSize: '18px', fontWeight: 300, lineHeight: 1.4, color: 'var(--white)', marginBottom: '16px', fontStyle: 'italic' }}>&ldquo;The cases that decide your exposure&rdquo;</p>
                  <p style={{ fontSize: '13px', fontWeight: 300, color: 'var(--white-muted)', lineHeight: 1.6 }}>Out-of-network authorization, the appeal that almost always follows, and the documentation that has to survive independent review. This is the slice of UM where specialized clinical ownership pays for itself — and where a clean file is the difference between a defensible decision and an expensive one.</p>
                </div>
                {[
                  { title: 'General UM, end to end', body: 'Authorization through first-level appeal across your self-funded book — the everyday workflow, owned by one clinician per case.' },
                  { title: 'Out-of-network, specialized', body: 'The same engine aimed at your highest-exposure cases, with documentation built to independent-review standard.' },
                  { title: 'IRO when it escalates', body: 'Full independent review available as a separate escalation service — picking up a file that&apos;s already clean.' },
                ].map((item, i) => (
                  <div key={i} className="urac-item">
                    <div className="udot" style={{ background: 'var(--teal)' }} />
                    <div><div className="utitle">{item.title}</div><div className="ubody">{item.body}</div></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <hr className="divider" />

        {/* Philosophy */}
        <section className="vum-section philosophy" id="philosophy">
          <div className="phil-inner">
            <div>
              <span className="kicker">Our Philosophy</span>
              <h2 className="sh">The Brief Engine is<br />the <em>secret sauce.</em></h2>
              <p className="sb" style={{ maxWidth: 440 }}>Every case arrives as a stack of raw documents. The slow part isn&apos;t the clinical judgment — it&apos;s everything that has to happen before a clinician can exercise it.</p>
              <p className="sb" style={{ maxWidth: 440, marginTop: 18 }}>The Brief Engine collapses that. It ingests the record, matches it against criteria, and hands the clinician a fully pre-briefed case. That&apos;s what lets one reviewer move fast, stay consistent, and carry the same case from authorization through appeal — leaving documentation clean enough to hand straight to an independent reviewer.</p>
            </div>
            <div>
              <div className="flow">
                <div className="flow-row">
                  <div className="flow-cell human" style={{ flex: '0 0 42%' }}><div className="fl">Concierge Intake</div><div className="ft">Named coordinator opens the case and assembles the record</div></div>
                  <div className="flow-cell machine"><div className="fl">AI Brief Engine</div><div className="ft">Ingests the record, matches criteria, pre-briefs the case in minutes</div></div>
                </div>
                <div className="flow-bridge">same clinician</div>
                <div className="flow-row">
                  <div className="flow-cell clinical"><div className="fl">Authorization</div><div className="ft">Specialist reviewer makes the determination on a pre-briefed file</div></div>
                  <div className="flow-cell clinical" style={{ flex: '0 0 46%' }}><div className="fl">First-Level Appeal</div><div className="ft">The same clinician owns the appeal. No relay, no lost context.</div></div>
                </div>
                <div className="flow-bridge">if it escalates</div>
                <div className="flow-row">
                  <div className="flow-cell human" style={{ flex: 1 }}><div className="fl">IRO-Ready Documentation</div><div className="ft">Clean, criteria-cited file ready for independent review</div></div>
                  <div className="flow-cell machine" style={{ flex: '0 0 32%' }}><div className="fl">Full IRO</div><div className="ft">Separate engagement, only when needed</div></div>
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
              <h2 className="sh">Three layers.<br />One case <em>through appeal.</em></h2>
            </div>
            <div className="pillars-grid">
              <div className="pillar"><span className="pnum" style={{ color: 'var(--white-dim)' }}>01</span><div className="pname">Concierge Intake</div><p className="pbody">A dedicated, named coordinator opens each case and assembles the record. They know the criteria, the provider relationships, and the case history. Available. Accountable. Never a portal queue.</p><span className="ptag" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--white-muted)' }}>Human-first</span></div>
              <div className="pillar"><span className="pnum" style={{ color: 'rgba(91,138,245,0.45)' }}>02</span><div className="pname">AI Brief Engine</div><p className="pbody">The secret sauce. It extracts and classifies the clinical record, cross-references evidence-based criteria, and prepares the full brief before a clinician opens the file. That&apos;s what makes the workflow fast and consistent — and the documentation IRO-ready by default.</p><span className="ptag" style={{ background: 'rgba(91,138,245,0.1)', color: 'var(--teal)' }}>AI-powered</span></div>
              <div className="pillar"><span className="pnum" style={{ color: 'rgba(201,169,110,0.4)' }}>03</span><div className="pname">Same Clinician, Through Appeal</div><p className="pbody">Board-certified specialists in active practice — the same reviewer who owns the authorization owns the first-level appeal. Continuity, not a queue. When a cardiology case arrives, a cardiologist carries it the whole way.</p><span className="ptag" style={{ background: 'var(--gold-dim)', color: 'var(--gold)' }}>Clinical excellence</span></div>
            </div>
          </div>
        </section>

        {/* Manifesto */}
        <div className="manifesto">
          <div style={{ maxWidth: 860 }}>
            <span className="qmark">&ldquo;</span>
            <p className="qtext">Most operations split a single case across a queue of reviewers and call it <em>scale.</em> We built VantaUM so one clinician owns the case from authorization through appeal — because continuity is what makes the documentation hold up.</p>
            <p className="qattr">VantaUM &middot; A Wells Onyx Company</p>
          </div>
        </div>

        {/* Compare */}
        <section className="vum-section" id="compare" style={{ background: 'var(--near-black)' }}>
          <div style={{ maxWidth: 1200, margin: '0 auto' }}>
            <div style={{ maxWidth: 560, marginBottom: 56 }}>
              <span className="kicker">Why VantaUM</span>
              <h2 className="sh">What a generalist<br />UM queue <em>won&apos;t</em> tell you.</h2>
              <p className="sb">Most UM operations were built to process every case the same way. VantaUM was built around clinical ownership — one reviewer per case, from authorization through first-level appeal — with the documentation to back the decision when it&apos;s tested. It&apos;s why it holds up on everyday UM and shines on your hardest out-of-network cases.</p>
            </div>
            <table className="ctable">
              <thead><tr><th>The Question</th><th>Generalist UM Queue</th><th>VantaUM</th></tr></thead>
              <tbody>
                <tr><td>Who owns a case?</td><td>Whoever pulls it off the queue next. Ownership changes at every stage.</td><td>One named clinician, from authorization through first-level appeal.<span className="tgood">Continuity</span></td></tr>
                <tr><td>How is the case prepared?</td><td>A raw document stack lands on a reviewer&apos;s desk.</td><td>The AI Brief Engine pre-briefs every case against criteria before review.</td></tr>
                <tr><td>What happens on appeal?</td><td>A different reviewer picks it up cold and rebuilds the context.</td><td>The same clinician owns the first-level appeal. No lost context, no relay.</td></tr>
                <tr><td>How good is the documentation?</td><td>Assembled after the fact, when an auditor or IRO asks for it.</td><td>Criteria-cited and IRO-ready from the moment the case is reviewed.</td></tr>
                <tr><td>What if a case escalates to IRO?</td><td>Scramble to assemble a defensible file under deadline.</td><td>The file is already clean — independent review picks up a complete record.</td></tr>
                <tr><td>How do we engage it?</td><td>Rebuild the capability internally, or buy a one-size-fits-all platform.</td><td>Bundled per case, or embedded as a specialized extension of your team.</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Live Demo — inlined, no iframe */}
        <section className="vum-section" id="demo" style={{ background: 'var(--black)' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{ maxWidth: 600, marginBottom: 48 }}>
              <span className="kicker">See It Live</span>
              <h2 className="sh">Watch the Brief Engine work.<br /><em>Then meet the clinician behind it.</em></h2>
              <p className="sb">This is a live demo of the VantaUM intake and Brief Engine. Submit a case and watch it go from raw documents to a fully pre-briefed, criteria-cited file — the same file a clinician carries from authorization through appeal.</p>
            </div>
            <div>
              <div className="demo-frame-label"><span className="demo-live-dot" /> Live Demo Environment <span style={{ fontWeight: 300, opacity: 0.5, fontSize: '11px', marginLeft: '8px' }}>All patients, cases, and organizations shown are fictional and for illustrative purposes only.</span></div>
              <div style={{ borderRadius: '0 12px 12px 12px', overflow: 'hidden', border: '1px solid var(--border-strong)' }}>
                <DemoWalkthrough />
              </div>
              <div className="demo-cta-row">
                <p className="demo-cta-text">Ready to see how this runs on your actual caseload?</p>
                <a href={EA_EMAIL} className="btn-primary">Talk to Us</a>
              </div>
            </div>
          </div>
        </section>

        {/* URAC */}
        <section className="vum-section" id="urac" style={{ background: 'var(--black)' }}>
          <div className="urac-inner">
            <div>
              <span className="kicker">Accreditation</span>
              <h2 className="sh">Documentation<br />that holds up under<br /><em>independent review.</em></h2>
              <p className="sb" style={{ maxWidth: 420 }}>A determination is only as strong as the record behind it. VantaUM is built to the standard that matters when a case is tested — URAC-aligned, criteria-cited, and ready for an independent reviewer the moment it&apos;s written.</p>
            </div>
            <div className="urac-list">
              <div className="urac-item"><div className="udot" style={{ background: 'var(--teal)' }} /><div><div className="utitle">IRO-ready by default</div><div className="ubody">Every case is documented to independent-review standard during the bundled work — not reconstructed under deadline once a case escalates.</div></div></div>
              <div className="urac-item"><div className="udot" style={{ background: 'var(--gold)' }} /><div><div className="utitle">Criteria-cited determinations</div><div className="ubody">Each decision is tied to the evidence-based criteria behind it, so the rationale is clear to a provider, an auditor, or an independent reviewer.</div></div></div>
              <div className="urac-item"><div className="udot" style={{ background: 'rgba(255,255,255,0.35)' }} /><div><div className="utitle">Credentialed clinical rigor</div><div className="ubody">A credentialed operation that the most regulated programs and the most demanding self-funded plans can stand behind — signaled before a single conversation begins.</div></div></div>
            </div>
          </div>
        </section>

        {/* Family Banner */}
        <div className="fam-banner">
          <span className="fam-label">Wells Onyx Portfolio</span>
          <div className="fam-pipe" />
          <p className="fam-text">VantaUM is part of the <a href="https://www.wellsonyx.com" target="_blank" rel="noopener noreferrer">Wells Onyx</a> constellation — alongside VantaHG, Onyx Semiconductor, Grain &amp; Vault, and WellsAI. Trust + Outcomes.</p>
        </div>

        {/* CTA */}
        <section className="cta-section" id="contact">
          <span className="kicker" style={{ display: 'block' }}>Let&apos;s Talk</span>
          <h2 className="sh" style={{ maxWidth: 700, margin: '0 auto 20px' }}>Bring us the cases<br /><em>that matter most.</em></h2>
          <p className="sb" style={{ maxWidth: 520, margin: '0 auto 16px' }}>Whether you want a clinical layer for your everyday utilization management, a specialized engine for your out-of-network exposure, or both — embedded in your team or run externally — the conversation starts the same way: tell us about your caseload.</p>
          <p className="sb" style={{ maxWidth: 500, margin: '0 auto 48px' }}>Email us directly. No form. No sales queue. You&apos;ll hear back from someone who can actually make a decision.</p>
          <div className="cta-actions">
            <a href={EA_EMAIL} className="btn-primary">Talk to Us</a>
            <a href="#ratecard" className="btn-ghost">See the rate card →</a>
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
