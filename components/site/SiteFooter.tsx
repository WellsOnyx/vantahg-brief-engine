/**
 * Shared marketing footer for all public VantaUM site pages (homepage +
 * blog articles). Renders inside the page's `.vum-site` wrapper, so it
 * inherits the design-token CSS variables (--teal, --white, etc.) and
 * carries its own scoped styles.
 *
 * Replaces the three separate inline footers that had drifted apart — one
 * structured, balanced footer: brand + tagline, an Explore nav column, a
 * Blog column, and a clean bottom bar.
 */

const BLOG_POSTS = [
  { href: '/blog/can-healthcare-brokers-advisors-improve-healthcare-systems', label: 'Can Brokers & Advisors Improve Healthcare?' },
  { href: '/site/blog/buying-outcomes-not-infrastructure-utilization-management', label: 'The TPA UM Model Is Broken' },
];

const EXPLORE = [
  { href: '/site#philosophy', label: 'Philosophy' },
  { href: '/site#model', label: 'Our Model' },
  { href: '/site#compare', label: 'Why VantaUM' },
  { href: '/site#demo', label: 'Live Demo' },
  { href: '/site#urac', label: 'Accreditation' },
];

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <>
      <style>{`
        .vfoot { background:var(--black); border-top:1px solid var(--border); }
        .vfoot-top { max-width:1120px; margin:0 auto; padding:60px 56px 44px; display:grid; grid-template-columns:1.5fr 1fr 1.2fr; gap:48px; }
        .vfoot-brand .vfoot-word { font-family:var(--sans); font-size:15px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:var(--white); }
        .vfoot-brand .vfoot-word span { color:var(--teal); }
        .vfoot-brand .vfoot-tag { font-size:13px; font-weight:300; line-height:1.75; color:var(--white-muted); margin-top:16px; max-width:300px; }
        .vfoot-brand .vfoot-loc { font-size:12px; font-weight:300; letter-spacing:0.04em; color:var(--white-dim); margin-top:20px; }
        .vfoot-col h4 { font-size:10px; font-weight:500; letter-spacing:0.14em; text-transform:uppercase; color:var(--white-dim); margin-bottom:18px; }
        .vfoot-col a { display:block; font-size:13px; font-weight:300; color:var(--white-muted); text-decoration:none; margin-bottom:12px; transition:color 0.2s; }
        .vfoot-col a:hover { color:var(--teal); }
        .vfoot-bottom { border-top:1px solid var(--border); }
        .vfoot-bottom-inner { max-width:1120px; margin:0 auto; padding:22px 56px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; }
        .vfoot-bottom p { font-size:12px; font-weight:300; color:var(--white-dim); }
        .vfoot-bottom .vfoot-logo { font-family:var(--sans); font-size:12px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:var(--white-muted); }
        .vfoot-bottom .vfoot-logo span { color:var(--teal); }
        @media (max-width:860px) {
          .vfoot-top { grid-template-columns:1fr; gap:36px; padding:48px 24px 36px; }
          .vfoot-bottom-inner { padding:20px 24px; flex-direction:column-reverse; text-align:center; gap:10px; }
        }
      `}</style>
      <footer className="vfoot">
        <div className="vfoot-top">
          <div className="vfoot-brand">
            <div className="vfoot-word"><span>Vanta</span>UM</div>
            <p className="vfoot-tag">
              Concierge member advocacy meets clinical intelligence — utilization management, IRO,
              and medical review built to hold up under independent review.
            </p>
            <div className="vfoot-loc">A Wells Onyx Company &middot; Houston &middot; Miami &middot; Tallahassee</div>
          </div>

          <nav className="vfoot-col" aria-label="Explore">
            <h4>Explore</h4>
            {EXPLORE.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>

          <nav className="vfoot-col" aria-label="Blog">
            <h4>Blog</h4>
            {BLOG_POSTS.map((l) => (
              <a key={l.href} href={l.href}>{l.label}</a>
            ))}
          </nav>
        </div>

        <div className="vfoot-bottom">
          <div className="vfoot-bottom-inner">
            <p>&copy; {year} VantaUM. All rights reserved.</p>
            <span className="vfoot-logo"><span>Vanta</span>UM</span>
          </div>
        </div>
      </footer>
    </>
  );
}
