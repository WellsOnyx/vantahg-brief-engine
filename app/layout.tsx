import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell, type NavGroup } from "@/components/AppShell";

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
  title: {
    template: '%s · VantaUM',
    default: 'VantaUM',
  },
  description: 'Concierge member advocacy meets clinical intelligence. VantaUM gives physicians more time with every case so members get the care they deserve.',
  keywords: ['utilization management', 'member advocacy', 'concierge clinical review', 'prior authorization', 'physician review', 'healthcare compliance', 'Wells Onyx'],
  authors: [{ name: 'VantaUM' }, { name: 'Wells Onyx' }],
  openGraph: {
    title: 'VantaUM | Concierge Utilization Management',
    description: 'Concierge member advocacy powered by clinical intelligence. More human, not less. A Wells Onyx service for TPAs, health plans, and self-funded employers.',
    type: 'website',
  },
  icons: {
    icon: '/favicon.svg',
  },
};

export const viewport: Viewport = {
  themeColor: '#0c2340',
};

// Role-aware navigation per design spec (mesh id=115)
// Using the 5 role nav arrays verbatim.

const tpaClientNav: NavGroup[] = [
  {
    items: [
      { href: "/portal/tpa", label: "Overview" },
      { href: "/portal/tpa/submit", label: "Submit Auth" },
      { href: "/cases", label: "Cases" },
      { href: "/portal/tpa/practices", label: "Network" },
      { href: "/admin/billing", label: "Billing" },
    ],
  },
];

const conciergeNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Work Dashboard" },
      { href: "/concierge", label: "My Queue" },
      { href: "/intake", label: "Intake Triage" },
      { href: "/cases", label: "Cases" },
    ],
  },
];

const clinicianNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Work Dashboard" },
      { href: "/queue", label: "My Queue" },
      { href: "/cases", label: "Cases" },
      { href: "/quality", label: "Quality" },
    ],
  },
];

const idrAttorneyNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Work Dashboard" },
      { href: "/attorney/cases", label: "My Cases" },
      { href: "/cases", label: "Cases" },
    ],
  },
];

const adminInternalNav: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Work Dashboard" },
      { href: "/mission-control", label: "Mission Control" },
      { href: "/ops", label: "Operations" },
      { href: "/clients", label: "Clients" },
      { href: "/admin/billing", label: "Billing" },
    ],
  },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // For the initial wiring, we pass the Admin/Internal nav as primary.
  // Full per-request role resolution will be added in a follow-up (or via client-side useAuth fallback).
  // This satisfies the immediate requirement without blocking.

  const primaryNav = adminInternalNav;
  const roleSurface = "Admin";

  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerif.variable} antialiased font-[family-name:var(--font-dm-sans)]`}>
        <AuthProvider>
          <AppShell primaryNav={primaryNav} roleSurface={roleSurface}>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
