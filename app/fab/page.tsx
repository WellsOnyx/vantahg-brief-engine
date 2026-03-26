'use client';

const CONTACT_EMAIL = 'mailto:jonah@wellsonyx.com?subject=Onyx%20Semiconductor%20—%20Inquiry';

export default function FabPage() {
  return (
    <>
      <link
        href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500&display=swap"
        rel="stylesheet"
      />

      <style>{`
        .fab-site *, .fab-site *::before, .fab-site *::after { box-sizing:border-box;margin:0;padding:0; }
        .fab-site {
          --navy: #1a3a52; --gold: #dba63f; --white: #ffffff; --off-white: #f8f9fa;
          --text-dark: #2c3e50; --text-gray: #666;
          --serif: 'Cormorant Garamond', Georgia, serif;
          --sans: 'DM Sans', system-ui, sans-serif;
          font-family: var(--sans); line-height:1.8; color: var(--text-dark); background: var(--white);
          -webkit-font-smoothing: antialiased;
        }
        .fab-site a { color: inherit; }

        /* ── Nav ── */
        .fab-nav {
          position:fixed;top:0;left:0;right:0;z-index:100;
          display:flex;align-items:center;justify-content:space-between;
          padding:20px 56px;
          background:rgba(255,255,255,0.95);backdrop-filter:blur(12px);
          border-bottom:1px solid rgba(0,0,0,0.06);
        }
        .fab-nav-left { display:flex;align-items:baseline;gap:12px; }
        .fab-nav-mark { font-family:var(--sans);font-size:14px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--navy);text-decoration:none; }
        .fab-nav-sub { font-size:11px;font-weight:300;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-gray); }
        .fab-nav-links { display:flex;gap:32px;list-style:none; }
        .fab-nav-links a { font-size:13px;font-weight:400;color:var(--text-gray);text-decoration:none;transition:color 0.2s; }
        .fab-nav-links a:hover { color:var(--navy); }
        .fab-nav-cta { display:inline-block;padding:9px 24px;border:1.5px solid var(--navy);color:var(--navy);border-radius:50px;font-size:13px;font-weight:500;text-decoration:none;transition:all 0.2s; }
        .fab-nav-cta:hover { background:var(--navy);color:var(--white); }

        /* ── Hero ── */
        .fab-hero { padding:180px 56px 100px;text-align:center;background:var(--white); }
        .fab-eyebrow { font-size:0.85rem;letter-spacing:3px;text-transform:uppercase;color:var(--gold);margin-bottom:30px;font-weight:500; }
        .fab-hero h1 { font-family:var(--serif);font-size:clamp(3rem,5.5vw,5rem);font-weight:300;color:var(--navy);margin-bottom:30px;letter-spacing:-2px;line-height:1.08; }
        .fab-hero .subtitle { font-size:1.25rem;color:var(--text-gray);font-weight:300;max-width:700px;margin:0 auto 50px; }
        .btn-solid { display:inline-block;padding:16px 40px;background:var(--navy);color:var(--white);text-decoration:none;font-weight:500;font-size:1rem;border-radius:50px;border:2px solid var(--navy);transition:all 0.3s; }
        .btn-solid:hover { background:var(--white);color:var(--navy); }
        .btn-outline { display:inline-block;padding:16px 40px;background:transparent;color:var(--navy);text-decoration:none;font-weight:500;font-size:1rem;border-radius:50px;border:2px solid var(--navy);transition:all 0.3s;margin-left:16px; }
        .btn-outline:hover { background:var(--navy);color:var(--white); }

        /* ── Sections ── */
        .fab-section { padding:100px 56px; }
        .fab-section.gray { background:var(--off-white); }
        .fab-container { max-width:1200px;margin:0 auto; }
        .fab-stitle { font-family:var(--serif);font-size:clamp(2rem,4vw,3rem);color:var(--navy);font-weight:300;letter-spacing:-1px;margin-bottom:20px; }
        .fab-ssub { font-size:1.15rem;color:var(--text-gray);font-weight:300;max-width:700px;margin-bottom:60px; }

        /* ── Grid ── */
        .fab-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:40px;max-width:900px;margin:60px auto 0; }
        .fab-card { background:var(--white);padding:40px 30px;border-bottom:3px solid var(--gold);transition:all 0.3s; }
        .fab-card:hover { transform:translateY(-5px);box-shadow:0 10px 30px rgba(0,0,0,0.08); }
        .fab-card h3 { color:var(--navy);font-size:1.3rem;font-weight:500;margin-bottom:15px; }
        .fab-card p { color:var(--text-gray);line-height:1.8; }

        /* ── Stats ── */
        .fab-stats { display:grid;grid-template-columns:repeat(3,1fr);gap:60px;max-width:1000px;margin:60px auto 0; }
        .fab-stat { text-align:center;padding:40px 20px; }
        .fab-stat-num { font-family:var(--serif);font-size:4rem;font-weight:300;color:var(--navy);display:block;margin-bottom:15px; }
        .fab-stat-label { font-size:0.9rem;color:var(--text-gray);text-transform:uppercase;letter-spacing:1px; }

        /* ── Feature list ── */
        .fab-features { list-style:none;margin-top:40px; }
        .fab-features li { padding:18px 0;border-bottom:1px solid rgba(0,0,0,0.08);color:var(--text-gray);font-size:1.1rem;line-height:1.6; }
        .fab-features li::before { content:"→";color:var(--gold);font-weight:bold;margin-right:15px; }

        /* ── Highlight box ── */
        .fab-highlight { background:var(--off-white);border-left:4px solid var(--gold);padding:60px;margin:80px 0;text-align:left; }
        .fab-highlight h2 { font-family:var(--serif);color:var(--navy);font-size:2.4rem;font-weight:300;margin-bottom:25px; }
        .fab-highlight p { font-size:1.15rem;color:var(--text-gray);margin-bottom:20px;line-height:1.8; }
        .fab-highlight .gold { color:var(--gold);font-weight:500;font-size:1.2rem; }

        /* ── Partners ── */
        .fab-partners { display:grid;grid-template-columns:repeat(3,1fr);gap:60px;max-width:1000px;margin:60px auto 0; }
        .fab-partner { text-align:center;font-size:1.3rem;color:var(--navy);font-weight:500; }
        .fab-partner span { font-size:0.85rem;color:var(--text-gray);font-weight:400;display:block;margin-top:8px; }

        /* ── Phase cards ── */
        .fab-phases { display:grid;grid-template-columns:repeat(2,1fr);gap:40px;max-width:1100px;margin:60px auto 0; }
        .fab-phase { background:var(--white);padding:50px 40px;border-bottom:3px solid var(--navy);box-shadow:0 5px 20px rgba(0,0,0,0.05); }
        .fab-phase h3 { color:var(--navy);font-size:1.6rem;font-weight:500;margin-bottom:20px; }
        .fab-phase .amount { font-family:var(--serif);font-size:2.5rem;color:var(--gold);font-weight:300;margin-bottom:25px; }
        .fab-phase ul { list-style:none;margin-top:25px; }
        .fab-phase ul li { padding:12px 0;color:var(--text-gray);border-bottom:1px solid rgba(0,0,0,0.05);line-height:1.6; }
        .fab-phase ul li::before { content:"→";color:var(--gold);margin-right:12px;font-weight:bold; }

        /* ── Contact / CTA ── */
        .fab-contact { text-align:center;padding:100px 56px;background:var(--off-white); }
        .fab-contact h2 { font-family:var(--serif);color:var(--navy);font-size:3rem;font-weight:300;margin-bottom:30px; }
        .fab-contact p { font-size:1.1rem;color:var(--text-gray);margin-bottom:20px;line-height:1.8; }
        .fab-contact .name { font-size:1.3rem;font-weight:600;color:var(--gold);margin-top:30px; }
        .fab-contact .role { font-size:1.05rem;color:var(--text-gray); }

        /* ── Footer ── */
        .fab-footer { padding:40px 56px;border-top:1px solid rgba(0,0,0,0.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px; }
        .fab-footer-mark { font-family:var(--sans);font-size:13px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--navy); }
        .fab-footer p { font-size:12px;color:var(--text-gray); }

        /* ── Responsive ── */
        @media (max-width:960px) {
          .fab-nav { padding:18px 24px; }
          .fab-nav-links { display:none; }
          .fab-hero { padding:140px 24px 60px; }
          .fab-section { padding:72px 24px; }
          .fab-grid,.fab-phases { grid-template-columns:1fr; }
          .fab-stats,.fab-partners { grid-template-columns:1fr; }
          .fab-highlight { padding:40px 24px; }
          .fab-contact { padding:72px 24px; }
          .fab-footer { padding:32px 24px;flex-direction:column;text-align:center; }
          .btn-outline { margin-left:0;margin-top:12px; }
        }
      `}</style>

      <div className="fab-site">
        {/* Nav */}
        <nav className="fab-nav">
          <div className="fab-nav-left">
            <a className="fab-nav-mark" href="#">Onyx Semiconductor</a>
            <span className="fab-nav-sub">A Wells Onyx Company</span>
          </div>
          <ul className="fab-nav-links">
            <li><a href="#problem">The Problem</a></li>
            <li><a href="#building">What We Build</a></li>
            <li><a href="#partners">Partners</a></li>
            <li><a href="#capital">Capital</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>
          <a className="fab-nav-cta" href="#contact">Request Information</a>
        </nav>

        {/* Hero */}
        <section className="fab-hero">
          <div className="fab-container">
            <p className="fab-eyebrow">Onyx Semiconductor / Wells Onyx</p>
            <h1>Domestic Fab.<br />Strategic Resilience.</h1>
            <p className="subtitle">Semiconductor manufacturing optimized for short-run custom production. Thousands of chips, not millions — made in America, on your timeline.</p>
            <a href="#contact" className="btn-solid">Request Information</a>
            <a href="#building" className="btn-outline">Learn More</a>
          </div>
        </section>

        {/* The Problem */}
        <section className="fab-section" id="problem">
          <div className="fab-container">
            <h2 className="fab-stitle">The Problem We Solve</h2>
            <p className="fab-ssub">Traditional fabs optimize for millions of units. We optimize for thousands.</p>
            <div className="fab-grid">
              <div className="fab-card"><h3>Automotive OEMs</h3><p>Need 10,000 custom chips, not 10 million, but TSMC won&apos;t take the order.</p></div>
              <div className="fab-card"><h3>Defense Contractors</h3><p>Need secure domestic chip supply but can&apos;t wait 18 months for Intel or GlobalFoundries.</p></div>
              <div className="fab-card"><h3>IoT Companies</h3><p>Need board redesigns for legacy components no longer in production.</p></div>
              <div className="fab-card"><h3>All Industries</h3><p>Geopolitical risk makes Taiwan-dependent supply chains uninsurable.</p></div>
            </div>
          </div>
        </section>

        {/* What We're Building */}
        <section className="fab-section gray" id="building">
          <div className="fab-container">
            <h2 className="fab-stitle">What We&apos;re Building</h2>
            <div className="fab-stats">
              <div className="fab-stat"><span className="fab-stat-num">4</span><span className="fab-stat-label">Independent 7nm Microfabs</span></div>
              <div className="fab-stat"><span className="fab-stat-num">70K</span><span className="fab-stat-label">Square Feet Cleanroom</span></div>
              <div className="fab-stat"><span className="fab-stat-num">12K</span><span className="fab-stat-label">Wafers/Month Capacity</span></div>
            </div>
            <ul className="fab-features">
              <li>4 independent 7nm-capable microfabs under one roof</li>
              <li>PCB refurbishment facilities for legacy board redesign</li>
              <li>Production capacity: 4,000–12,000 wafers/month</li>
              <li>Domestic location with secure supply chain</li>
              <li>Optimized for short-run custom production (1,000–10,000 units)</li>
            </ul>
          </div>
        </section>

        {/* Redesign Library */}
        <section className="fab-section">
          <div className="fab-container">
            <div className="fab-highlight">
              <h2>Redesign Library: Production Downtime Insurance</h2>
              <p style={{ fontSize: '1.2rem', marginBottom: 20 }}>72 hours back in production instead of 6 months.</p>
              <p>We redesign your mission-critical boards now, test them, and catalog them in your private library. When components go EOL or suppliers fail, you pull the pre-tested design and resume production immediately.</p>
              <p className="gold" style={{ marginTop: 30 }}>One automotive customer avoided $97M in downtime costs on their first use.</p>
            </div>
          </div>
        </section>

        {/* Strategic Partnerships */}
        <section className="fab-section gray" id="partners">
          <div className="fab-container">
            <h2 className="fab-stitle">Strategic Partnerships</h2>
            <p className="fab-ssub">Building with world-class technical and research partners.</p>
            <div className="fab-partners">
              <div className="fab-partner">University of Florida<span>5-year research partnership, signed</span></div>
              <div className="fab-partner">Nelson Engineering<span>Technical manufacturing partner</span></div>
              <div className="fab-partner">Qualcomm<span>5nm/6nm/7nm distribution, pending</span></div>
            </div>
          </div>
        </section>

        {/* Capital Structure */}
        <section className="fab-section" id="capital">
          <div className="fab-container">
            <h2 className="fab-stitle">Capital Structure</h2>
            <p className="fab-ssub">Phase 1 proves the model. Phase 2 builds it at scale.</p>
            <div className="fab-phases">
              <div className="fab-phase">
                <h3>Phase 1: Proof of Concept</h3>
                <div className="amount">$3.5M</div>
                <ul>
                  <li>5 PCB redesign slots ($500K each)</li>
                  <li>$1M equity raise: 1% + priority chip access</li>
                  <li>Hire CEO, Head of Product, Chief Revenue Officer</li>
                  <li>12–18 months operating runway</li>
                  <li>Beta production with University of Florida</li>
                </ul>
              </div>
              <div className="fab-phase">
                <h3>Phase 2: Full Buildout</h3>
                <div className="amount">$3B</div>
                <ul>
                  <li>Facility construction ($60–80M)</li>
                  <li>Microfab equipment including EUV lithography ($1.5–2B)</li>
                  <li>PCB refurbishment facilities ($8–12M)</li>
                  <li>270–360 employees over 3 years</li>
                  <li>Full production operational by 2029</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Market Opportunity */}
        <section className="fab-section gray">
          <div className="fab-container">
            <h2 className="fab-stitle">Market Opportunity</h2>
            <div className="fab-stats">
              <div className="fab-stat"><span className="fab-stat-num">$18B</span><span className="fab-stat-label">Automotive Custom Chips</span></div>
              <div className="fab-stat"><span className="fab-stat-num">$15B</span><span className="fab-stat-label">Defense Domestic Production</span></div>
              <div className="fab-stat"><span className="fab-stat-num">$14B</span><span className="fab-stat-label">IoT Small-Batch Production</span></div>
            </div>
            <p style={{ textAlign: 'center', marginTop: 50, fontSize: '1.4rem', color: 'var(--navy)', fontWeight: 500 }}>$47B Total Addressable Market</p>
          </div>
        </section>

        {/* Beta Slots */}
        <section className="fab-section">
          <div className="fab-container">
            <div className="fab-highlight">
              <h2>5 Beta Production Slots Available</h2>
              <p>We have 5 PCB redesign slots available in beta production (in partnership with University of Florida).</p>
              <p style={{ marginBottom: 30 }}>After these 5 slots, the next availability won&apos;t be until full facility buildout in 2027.</p>
              <a href="#contact" className="btn-solid">Request Slot Information</a>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="fab-contact" id="contact">
          <div className="fab-container">
            <h2>Get Involved</h2>
            <p>If you&apos;re interested in learning more about Onyx Semiconductor, participating in Phase 1, or exploring the Redesign Library:</p>
            <p className="name">Jonah Manning</p>
            <p className="role">CEO &amp; Founder, Wells Onyx<br />Founder, Onyx Semiconductor</p>
            <p style={{ marginTop: 20 }}><a href={CONTACT_EMAIL} style={{ color: 'var(--gold)', textDecoration: 'none', fontSize: '1.2rem' }}>jonah@wellsonyx.com</a></p>
            <div style={{ marginTop: 40 }}>
              <a href={CONTACT_EMAIL} className="btn-solid">Request Information</a>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="fab-footer">
          <div className="fab-footer-mark">Onyx Semiconductor</div>
          <p>A Wells Onyx Company &middot; Houston &middot; Gainesville</p>
          <p>&copy; 2026 Onyx Semiconductor. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
