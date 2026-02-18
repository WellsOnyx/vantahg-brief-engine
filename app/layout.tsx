import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { MobileNav } from "@/components/MobileNav";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-dm-serif",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: 'VantaHG Clinical Brief Engine',
  description: 'AI-powered first-level utilization review. Clinical briefs prepared by AI, determinations made by board-certified physicians.',
  keywords: ['utilization review', 'medical necessity', 'prior authorization', 'clinical brief', 'healthcare compliance'],
  authors: [{ name: 'VantaHG' }],
  openGraph: {
    title: 'VantaHG Clinical Brief Engine',
    description: 'AI-powered first-level utilization review platform for TPAs, health plans, and self-funded employers.',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c2340',
};

const navLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/cases/new", label: "Submit Case" },
  { href: "/cases", label: "Case Portal" },
  { href: "/portal", label: "Client Tracker" },
  { href: "/reviewers", label: "Reviewers" },
  { href: "/clients", label: "Clients" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerif.variable} antialiased font-[family-name:var(--font-dm-sans)]`}>
        <div className="min-h-screen flex flex-col">
          {/* Sticky header with backdrop blur */}
          <header className="sticky top-0 z-50 bg-navy/95 backdrop-blur-md text-white border-b border-white/10 shadow-lg shadow-navy-dark/20 no-print">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                {/* Logo */}
                <Link href="/" className="flex items-center gap-3 group">
                  <div className="w-9 h-9 bg-gold-gradient rounded-lg flex items-center justify-center font-bold text-navy text-sm shadow-md shadow-gold/20 transition-transform duration-200 group-hover:scale-105">
                    V
                  </div>
                  <span className="font-[family-name:var(--font-dm-serif)] text-xl tracking-tight text-white">
                    Vanta<span className="text-gold">HG</span>
                  </span>
                </Link>

                {/* Desktop navigation */}
                <nav className="hidden md:flex items-center gap-1">
                  {navLinks.map((link) => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="px-3 py-2 rounded-md text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200"
                    >
                      {link.label}
                    </Link>
                  ))}
                </nav>

                {/* Mobile hamburger */}
                <MobileNav links={navLinks} />
              </div>
            </div>
          </header>

          <main className="flex-1 animate-fade-in">
            {children}
          </main>

          {/* Footer */}
          <footer className="no-print border-t border-border bg-surface">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-gold-gradient rounded flex items-center justify-center font-bold text-navy text-[10px]">
                    V
                  </div>
                  <span className="text-sm font-semibold text-foreground">
                    VantaHG Clinical Brief Engine
                  </span>
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-3 sm:gap-6 text-xs text-muted">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    All determinations made by board-certified physicians
                  </span>
                  <span className="hidden sm:inline text-border">|</span>
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-gold-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                    HIPAA-Compliant Infrastructure
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
