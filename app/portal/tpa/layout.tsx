'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Basic TPA Portal Shell (Item 8)
// Fully AWS/Cognito friendly — zero Supabase usage in the shell.
// Protection expected via middleware + future Cognito-aware checks.
// Data (user, cases, practices) loaded by pages via APIs.

export default function TpaPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <TpaHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

function TpaHeader() {
  const pathname = usePathname();

  const navItems = [
    { href: '/portal/tpa', label: 'Dashboard' },
    { href: '/portal/tpa/submit', label: 'Submit Case' },
    { href: '/portal/tpa/practices', label: 'Practices' },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-white/95 backdrop-blur">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <Link 
            href="/portal/tpa" 
            className="font-[family-name:var(--font-dm-serif)] text-2xl text-navy font-semibold tracking-tight hover:text-gold-dark transition-colors"
          >
            VantaUM
          </Link>
          <span className="hidden sm:inline text-xs uppercase tracking-[2px] text-muted border border-border px-2 py-0.5 rounded">
            TPA Portal
          </span>
        </div>

        {/* Navigation */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium">
          {navItems.map((item) => {
            const isActive = pathname === item.href || 
              (item.href !== '/portal/tpa' && pathname.startsWith(item.href));
            return (
              <Link 
                key={item.href}
                href={item.href} 
                className={
                  isActive 
                    ? 'text-navy font-semibold' 
                    : 'text-muted hover:text-navy transition-colors'
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right side — user area (ready for Cognito) */}
        <div className="flex items-center gap-4 text-sm">
          <div className="hidden sm:flex items-center gap-2 text-muted">
            <span className="text-xs text-muted">TPA User</span>
          </div>

          <Link
            href="/login"
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-muted hover:text-navy hover:border-navy/40 transition-colors"
          >
            Sign out
          </Link>

          {/* Mobile placeholder */}
          <div className="md:hidden text-muted cursor-pointer">☰</div>
        </div>
      </div>
    </header>
  );
}
