import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import Link from "next/link";

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
  title: "VantaHG Clinical Brief Engine",
  description: "AI-powered utilization review platform for clinical brief generation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerif.variable} antialiased font-[family-name:var(--font-dm-sans)]`}>
        <div className="min-h-screen flex flex-col">
          <header className="bg-navy text-white border-b border-navy-light">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <Link href="/" className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gold rounded flex items-center justify-center font-bold text-navy text-sm">V</div>
                  <span className="font-[family-name:var(--font-dm-serif)] text-xl tracking-tight">VantaHG</span>
                </Link>
                <nav className="flex items-center gap-6 text-sm">
                  <Link href="/" className="text-white/80 hover:text-white transition-colors">Dashboard</Link>
                  <Link href="/cases/new" className="text-white/80 hover:text-white transition-colors">New Case</Link>
                  <Link href="/reviewers" className="text-white/80 hover:text-white transition-colors">Reviewers</Link>
                  <Link href="/clients" className="text-white/80 hover:text-white transition-colors">Clients</Link>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1">
            {children}
          </main>
          <footer className="border-t border-border py-4 text-center text-sm text-muted">
            VantaHG Clinical Brief Engine &mdash; Utilization Review Platform
          </footer>
        </div>
      </body>
    </html>
  );
}
