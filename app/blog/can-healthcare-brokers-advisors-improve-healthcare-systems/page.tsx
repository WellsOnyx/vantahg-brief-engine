import type { Metadata } from 'next';

/**
 * VantaUM blog — "Can Healthcare Brokers and Advisors Help Improve Our
 * Healthcare Systems?" · Byline: Jonah Manning.
 *
 * Server component so the page carries real per-page SEO metadata and the
 * Article + FAQPage JSON-LD (pasted verbatim from the SEO package). Mirrors
 * the design system of app/site/blog/* (Cormorant Garamond + DM Sans, dark
 * theme, teal/gold accents). Public + chromeless via middleware.ts and
 * components/AppShell.tsx (`/blog` prefix).
 *
 * Hero image alt (for whoever adds a hero/OG image in the CMS):
 *   "Benefits advisor reviewing a self-funded health plan design with an employer"
 */

const CANONICAL = 'https://vantaum.com/blog/can-healthcare-brokers-advisors-improve-healthcare-systems';
const EA_EMAIL = 'mailto:hello@wellsonyx.com?subject=Self-Funded%20Innovation%20%E2%80%94%20VantaUM';

export const metadata: Metadata = {
  // `absolute` bypasses the root layout's "%s · VantaUM" template so the
  // meta title is exactly the 58-char string from the SEO package.
  title: { absolute: 'Can Healthcare Brokers and Advisors Improve Healthcare?' },
  description:
    'Brokers, advisors, and consultants are debating who can fix healthcare. The fastest practical innovation is happening in the self-insured space. Here’s why.',
  keywords: [
    'healthcare brokers and advisors',
    'self-insured health plans',
    'self-funded employer health plans',
    'benefits consultant vs broker',
    'medical stop loss costs',
    'utilization management',
    'independent review organization (IRO)',
  ],
  authors: [{ name: 'Jonah Manning' }],
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: 'article',
    title: 'Can Healthcare Brokers and Advisors Help Improve Our Healthcare Systems?',
    description:
      'The fastest practical innovation in American healthcare is happening in the self-insured space — inside today’s laws, one plan at a time.',
    url: CANONICAL,
    siteName: 'VantaUM',
    publishedTime: '2026-07-28',
    authors: ['Jonah Manning'],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Can Healthcare Brokers and Advisors Improve Healthcare?',
    description:
      'The fastest practical innovation in healthcare is happening in the self-insured space. Here’s why.',
  },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Article',
      headline: 'Can Healthcare Brokers and Advisors Help Improve Our Healthcare Systems?',
      author: {
        '@type': 'Person',
        name: 'Jonah Manning',
        jobTitle: 'CEO & Co-Chair, Wells Onyx',
      },
      publisher: {
        '@type': 'Organization',
        name: 'VantaUM',
      },
      datePublished: '2026-07-28',
      about: ['self-insured health plans', 'healthcare brokers', 'benefits advisors', 'utilization management'],
      mainEntityOfPage: CANONICAL,
    },
    {
      '@type': 'FAQPage',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is a self-insured (self-funded) health plan?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'A self-insured health plan is one where the employer pays for employee medical claims directly rather than buying a fully insured policy from a carrier. The employer typically hires a third-party administrator (TPA) to process claims and buys stop loss insurance to protect against catastrophic claims. Because these plans are governed by ERISA, employers have far more freedom to design the plan than they would under a fully insured product.',
          },
        },
        {
          '@type': 'Question',
          name: 'What is the difference between a benefits broker, an advisor, and a consultant?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'The main difference is how they are paid and what they take responsibility for. Brokers are typically compensated by commissions from insurance carriers on the policies they place. Consultants are generally paid directly by the employer through flat or per-employee-per-month fees, which aligns them with the client rather than the carrier. Advisors sit in between, and the label matters less than the compensation: the practical test is to ask how they get paid and whether their advice changes when the answer changes.',
          },
        },
        {
          '@type': 'Question',
          name: 'Why are medical stop loss costs rising?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "Carrier data points to high-cost claims growing in both frequency and severity. QBE's 2026 Accident & Health Market Report identified cancer claims and specialty drugs as leading drivers of the surge in stop loss costs for self-funded employers.",
          },
        },
        {
          '@type': 'Question',
          name: 'What is utilization management and why does it matter to self-funded employers?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Utilization management (UM) is the clinical review process that determines whether care is medically necessary and appropriate before, during, or after it is delivered. For a self-funded employer, every UM decision is made with the plan’s own money. Strong, clinically honest UM protects both the member and the plan; weak UM leaks money and erodes trust. Independent review organizations (IROs) provide external, accredited physician review when decisions are disputed.',
          },
        },
      ],
    },
  ],
};

export default function BlogPost() {
  const year = new Date().getFullYear();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />

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

        .blog-article { max-width:720px;margin:0 auto;padding:140px 24px 100px; }
        .blog-back { display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:300;color:var(--white-muted);text-decoration:none;margin-bottom:48px;transition:color 0.2s; }
        .blog-back:hover { color:var(--white); }
        .blog-kicker { font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--teal);margin-bottom:20px;display:block; }
        .blog-title { font-family:var(--serif);font-size:clamp(36px,4.5vw,56px);font-weight:300;line-height:1.1;letter-spacing:-0.3px;color:var(--white);margin-bottom:24px; }
        .blog-title em { font-style:italic;color:var(--teal); }
        .blog-meta { font-size:13px;font-weight:300;color:var(--white-dim);margin-bottom:48px;display:flex;align-items:center;gap:16px;flex-wrap:wrap; }
        .blog-meta-dot { width:3px;height:3px;border-radius:50%;background:var(--white-dim); }
        .blog-divider { border:none;border-top:1px solid var(--border);margin:0 0 48px; }

        .blog-body h2 { font-family:var(--serif);font-size:28px;font-weight:300;line-height:1.2;color:var(--white);margin:56px 0 20px;letter-spacing:-0.2px; }
        .blog-body h2 em { font-style:italic;color:var(--teal); }
        .blog-body p { font-size:17px;font-weight:300;line-height:1.8;color:var(--white-muted);margin-bottom:24px; }
        .blog-body p strong { color:var(--white);font-weight:400; }
        .blog-body p em { font-style:italic;color:var(--white); }
        .blog-body a.ext { color:var(--teal);text-decoration:none;border-bottom:1px solid var(--teal-mid);transition:border-color 0.2s; }
        .blog-body a.ext:hover { border-color:var(--teal); }

        .blog-body .pull-quote { margin:48px 0;padding:32px 0 32px 32px;border-left:2px solid var(--teal);font-family:var(--serif);font-size:24px;font-weight:300;line-height:1.4;color:var(--white);letter-spacing:-0.2px; }
        .blog-body .pull-quote em { font-style:italic;color:var(--teal); }

        .blog-body .stat-row { display:grid;grid-template-columns:repeat(3,1fr);gap:2px;margin:40px 0; }
        .blog-body .stat-card { padding:26px 24px;background:var(--surface);border:1px solid var(--border);border-radius:6px; }
        .blog-body .stat-num { font-family:var(--serif);font-size:32px;font-weight:400;color:var(--teal);line-height:1;margin-bottom:8px; }
        .blog-body .stat-label { font-size:12px;font-weight:300;line-height:1.5;color:var(--white-muted); }

        .blog-body .faq { margin:24px 0 0; }
        .blog-body .faq-item { padding:24px 0;border-top:1px solid var(--border); }
        .blog-body .faq-item:last-child { border-bottom:1px solid var(--border); }
        .blog-body .faq-q { font-family:var(--serif);font-size:21px;font-weight:400;color:var(--white);margin-bottom:10px; }
        .blog-body .faq-a { font-size:15px;font-weight:300;line-height:1.75;color:var(--white-muted);margin:0; }

        .blog-sources { margin:56px 0 0;padding-top:28px;border-top:1px solid var(--border); }
        .blog-sources h3 { font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--white-dim);margin-bottom:14px; }
        .blog-sources p { font-size:13px;font-weight:300;line-height:1.8;color:var(--white-dim); }
        .blog-sources a { color:var(--white-muted);text-decoration:none;border-bottom:1px solid var(--border-strong); }
        .blog-sources a:hover { color:var(--white); }

        .blog-byline { margin:40px 0 0;font-size:14px;font-weight:300;font-style:italic;line-height:1.7;color:var(--white-muted); }

        .blog-cta { margin:64px 0 0;padding:40px;background:var(--surface);border:1px solid var(--border);border-radius:8px;text-align:center; }
        .blog-cta-kicker { font-size:11px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--gold);margin-bottom:16px;display:block; }
        .blog-cta h3 { font-family:var(--serif);font-size:28px;font-weight:300;color:var(--white);margin-bottom:12px; }
        .blog-cta p { font-size:15px;font-weight:300;color:var(--white-muted);margin-bottom:28px;max-width:480px;margin-left:auto;margin-right:auto; }
        .btn-primary { background:var(--teal);color:#fff;padding:13px 30px;border-radius:4px;font-family:var(--sans);font-size:14px;font-weight:500;text-decoration:none;transition:opacity 0.2s,transform 0.15s;display:inline-block; }
        .btn-primary:hover { opacity:0.88;transform:translateY(-1px); }

        .vum-footer { background:var(--black);border-top:1px solid var(--border);padding:40px 56px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:24px; }
        .footer-logo { font-family:var(--sans);font-size:13px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--white); }
        .footer-logo span { color:var(--teal); }
        .vum-footer p { font-size:12px;color:var(--white-dim); }
        .footer-nav { display:flex;flex-direction:column;gap:7px;align-items:flex-start; }
        .footer-nav-label { font-size:10px;font-weight:500;letter-spacing:0.14em;text-transform:uppercase;color:var(--white-dim);margin-bottom:1px; }
        .footer-nav a { font-size:12px;font-weight:300;color:var(--white-muted);text-decoration:none;transition:color 0.2s; }
        .footer-nav a:hover { color:var(--teal); }

        @keyframes fadeUp { from{opacity:0;transform:translateY(20px);} to{opacity:1;transform:translateY(0);} }
        .blog-article .blog-kicker { animation:fadeUp 0.6s ease both; }
        .blog-article .blog-title { animation:fadeUp 0.7s 0.1s ease both; }
        .blog-article .blog-meta { animation:fadeUp 0.7s 0.2s ease both; }
        .blog-article .blog-body { animation:fadeUp 0.7s 0.3s ease both; }

        @media (max-width:960px) {
          .vum-nav { padding:18px 24px; }
          .nav-links { display:none; }
          .blog-article { padding:100px 20px 72px; }
          .blog-body .stat-row { grid-template-columns:1fr; }
          .vum-footer { padding:32px 24px;flex-direction:column;text-align:center; }
          .footer-nav { align-items:center; }
        }
      `}</style>

      <div className="vum-site">
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

        <article className="blog-article">
          <a className="blog-back" href="/site">&#8592; Back to VantaUM</a>

          <span className="blog-kicker">Perspective</span>
          <h1 className="blog-title">Can Healthcare Brokers and Advisors Help Improve Our <em>Healthcare Systems?</em></h1>
          <div className="blog-meta">
            <span>Jonah Manning</span>
            <span className="blog-meta-dot" />
            <span>CEO &amp; Co-Chair, Wells Onyx</span>
            <span className="blog-meta-dot" />
            <span>July 28, 2026</span>
          </div>
          <hr className="blog-divider" />

          <div className="blog-body">
            <p>
              The July 2026 edition of{' '}
              <a className="ext" href="https://www.theselfinsurer.com/" target="_blank" rel="noopener noreferrer">The Self-Insurer</a>{' '}
              opens a debate the industry has been circling for years: brokers, advisors, and consultants all claim a
              seat at the table when it comes to fixing American healthcare. Who actually deserves one?
            </p>

            <p>
              It&rsquo;s a fair question, and the market behind it is not small. The healthcare insurance broker market
              is projected to grow from roughly $64 billion in 2025 to $70 billion in 2026, on its way to nearly
              $99 billion by 2030, according to{' '}
              <a className="ext" href="https://www.researchandmarkets.com/reports/6170784" target="_blank" rel="noopener noreferrer">Research and Markets</a>.
              That is a lot of intermediation. The uncomfortable question inside those numbers is whether all that spend
              moves healthcare forward &mdash; or just moves it around.
            </p>

            <div className="stat-row">
              <div className="stat-card"><div className="stat-num">$64B</div><div className="stat-label">Healthcare insurance broker market, 2025</div></div>
              <div className="stat-card"><div className="stat-num">$70B</div><div className="stat-label">Projected 2026</div></div>
              <div className="stat-card"><div className="stat-num">~$99B</div><div className="stat-label">Projected 2030</div></div>
            </div>

            <h2>Brokers, advisors, consultants &mdash; the difference is the <em>incentive</em>.</h2>

            <p>
              Strip away the titles and the real distinction is compensation. Brokers are traditionally paid by carrier
              commission on the products they place. Consultants are paid directly by the employer, usually flat or
              per-employee-per-month fees. Advisors live somewhere in between.
            </p>

            <p>
              None of these models is dishonest. But incentives are gravity &mdash; they pull quietly and constantly. A
              commission tied to a specific carrier creates a different conversation than a flat consulting fee. The
              employers getting the best outcomes tend to be the ones who asked their intermediary one simple question
              early: <em>how do you get paid, and what changes about your advice when the answer changes?</em>
            </p>

            <p>The best people in this industry &mdash; and there are many &mdash; welcome that question. The ones who dodge it are answering it anyway.</p>

            <h2>Why the self-insured space is where the <em>innovation</em> is.</h2>

            <p>Here is where I&rsquo;ve landed after immersing myself in this world:</p>

            <div className="pull-quote">
              To my surprise, learning more and more about this space, I think the self-insured space has the potential to
              drive the most short-term practical innovation within our current healthcare laws and framework.
            </div>

            <p>
              That surprise is worth explaining. Most conversations about fixing healthcare turn into conversations about
              legislation &mdash; new laws, new agencies, new mandates, each a decade-long fight. The self-insured space
              is different for one structural reason: under ERISA, a self-funded employer largely controls its own plan
              design. It doesn&rsquo;t need to wait for Washington to act. It can change how it buys care, how it reviews
              care, and who it partners with &mdash; this plan year, not in some imagined future.
            </p>

            <p>
              That means the self-insured market is effectively a laboratory running thousands of live experiments inside
              today&rsquo;s laws. Direct contracting, reference-based pricing, transparent pharmacy arrangements, captive
              stop loss programs, independent clinical review &mdash; none of these required an act of Congress. They
              required an employer willing to try, and an advisor honest enough to bring the idea forward.
            </p>

            <p>
              The pressure to experiment is only growing.{' '}
              <a className="ext" href="https://www.insurancebusinessmag.com/us/" target="_blank" rel="noopener noreferrer">QBE&rsquo;s 2026 Accident &amp; Health Market Report</a>{' '}
              points to cancer claims and specialty drugs driving a surge in stop loss costs. When catastrophic claims
              climb, the cost of a lazy status quo climbs with them. Nothing focuses innovation like a renewal.
            </p>

            <h2>What practical innovation actually <em>looks like</em>.</h2>

            <p>
              &ldquo;Innovation&rdquo; in healthcare has a credibility problem &mdash; it usually means a pitch deck. The
              practical version is quieter. It looks like clinical decisions made by the right specialist instead of the
              nearest reviewer. It looks like{' '}
              <a href="/site#model">utilization management solution</a>{' '}
              that a member experiences as guidance rather than obstruction. It looks like disputed decisions going to
              genuinely independent, accredited review instead of dying in an appeals queue.
            </p>

            <p>
              That is the corner of the system we&rsquo;re building in. I am building a portfolio company doing IRO work,
              medical review, and next-gen utilization management &mdash; including a{' '}
              <a href="/site#urac">URAC accredited IRO</a>{' '}
              and a concierge-level UM solution &mdash; because the self-funded market is exactly where clinically honest
              review can change outcomes fastest. Plan by plan, decision by decision, inside the rules as they exist today.
            </p>

            <h2>So &mdash; can brokers and advisors <em>improve</em> the system?</h2>

            <p>Yes. Unironically, yes. The good ones already are.</p>

            <p>
              An aligned advisor sitting with a self-funded employer controls something no legislator does: the next plan
              design decision. Multiply that across the tens of thousands of self-funded plans covering the majority of
              American workers with employer coverage, and you get the most underrated reform engine in healthcare.
            </p>

            <p>
              The system doesn&rsquo;t only get fixed from the top down. It also gets fixed one plan at a time &mdash; by
              employers who ask better questions, and by brokers and advisors willing to be judged on answers instead of
              commissions.
            </p>

            <p>If you&rsquo;re keeping your eyes and ears open to what&rsquo;s possible in the self-funded space, I would love to discuss.</p>

            {/* FAQ — mirrors the FAQPage JSON-LD for readers + AI answer engines */}
            <h2>Frequently asked questions</h2>
            <div className="faq">
              <div className="faq-item">
                <div className="faq-q">What is a self-insured (self-funded) health plan?</div>
                <p className="faq-a">A self-insured health plan is one where the employer pays for employee medical claims directly rather than buying a fully insured policy from a carrier. The employer typically hires a third-party administrator (TPA) to process claims and buys stop loss insurance to protect against catastrophic claims. Because these plans are governed by ERISA, employers have far more freedom to design the plan than they would under a fully insured product.</p>
              </div>
              <div className="faq-item">
                <div className="faq-q">What is the difference between a benefits broker, an advisor, and a consultant?</div>
                <p className="faq-a">The main difference is how they are paid and what they take responsibility for. Brokers are typically compensated by commissions from insurance carriers on the policies they place. Consultants are generally paid directly by the employer through flat or per-employee-per-month fees, which aligns them with the client rather than the carrier. Advisors sit in between, and the label matters less than the compensation: the practical test is to ask how they get paid and whether their advice changes when the answer changes.</p>
              </div>
              <div className="faq-item">
                <div className="faq-q">Why are medical stop loss costs rising?</div>
                <p className="faq-a">Carrier data points to high-cost claims growing in both frequency and severity. QBE&rsquo;s 2026 Accident &amp; Health Market Report identified cancer claims and specialty drugs as leading drivers of the surge in stop loss costs for self-funded employers.</p>
              </div>
              <div className="faq-item">
                <div className="faq-q">What is utilization management and why does it matter to self-funded employers?</div>
                <p className="faq-a">Utilization management (UM) is the clinical review process that determines whether care is medically necessary and appropriate before, during, or after it is delivered. For a self-funded employer, every UM decision is made with the plan&rsquo;s own money. Strong, clinically honest UM protects both the member and the plan; weak UM leaks money and erodes trust. Independent review organizations (IROs) provide external, accredited physician review when decisions are disputed.</p>
              </div>
            </div>

            <p className="blog-byline">
              Jonah Manning is CEO &amp; Co-Chair of Wells Onyx, building a portfolio of companies in IRO, medical review,
              and next generation utilization management, including VantaUM.
            </p>

            <div className="blog-sources">
              <h3>Sources</h3>
              <p>
                <a href="https://www.theselfinsurer.com/" target="_blank" rel="noopener noreferrer">The Self-Insurer</a>, July 2026 &middot;{' '}
                <a href="https://www.researchandmarkets.com/reports/6170784" target="_blank" rel="noopener noreferrer">Research and Markets, Healthcare Insurance Broker Market (report 6170784)</a> &middot;{' '}
                <a href="https://www.insurancebusinessmag.com/us/" target="_blank" rel="noopener noreferrer">Insurance Business America</a>, coverage of QBE&rsquo;s 2026 Accident &amp; Health Market Report.
              </p>
            </div>
          </div>

          <div className="blog-cta">
            <span className="blog-cta-kicker">Self-Funded Innovation</span>
            <h3>Clinically honest review, one plan at a time.</h3>
            <p>VantaUM delivers IRO, medical review, and next-generation utilization management for self-funded employers, TPAs, and the advisors who serve them.</p>
            <a className="btn-primary" href={EA_EMAIL}>Start a conversation →</a>
          </div>
        </article>

        <footer className="vum-footer">
          <div className="footer-logo"><span>Vanta</span>UM</div>
          <nav className="footer-nav" aria-label="Blog">
            <span className="footer-nav-label">Blog</span>
            <a href="/blog/can-healthcare-brokers-advisors-improve-healthcare-systems">Can Brokers &amp; Advisors Improve Healthcare?</a>
            <a href="/site/blog/buying-outcomes-not-infrastructure-utilization-management">The TPA UM Model Is Broken</a>
          </nav>
          <p>&copy; {year} Wells Onyx. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}
