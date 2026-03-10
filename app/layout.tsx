import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { AppShell } from "@/components/AppShell";

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
  title: 'FLR by VantaUM | Clinical Brief Engine',
  description: 'AI-powered first-level utilization review by Wells Onyx. Clinical briefs prepared by AI, determinations made by board-certified physicians.',
  keywords: ['utilization review', 'medical necessity', 'prior authorization', 'clinical brief', 'healthcare compliance', 'first-level review', 'Wells Onyx'],
  authors: [{ name: 'VantaUM' }, { name: 'Wells Onyx' }],
  openGraph: {
    title: 'FLR by VantaUM | Clinical Brief Engine',
    description: 'AI-powered first-level utilization review platform by Wells Onyx for TPAs, health plans, and self-funded employers.',
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
  { href: "/command-center", label: "Command Center" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/cases/new", label: "Submit Case" },
  { href: "/batch", label: "Batch Upload" },
  { href: "/cases", label: "Case Portal" },
  { href: "/portal", label: "Client Tracker" },
  { href: "/reviewers", label: "Reviewers" },
  { href: "/staff", label: "Staff" },
  { href: "/pods", label: "Pods" },
  { href: "/quality", label: "Quality" },
  { href: "/intake", label: "Intake" },
  { href: "/clients", label: "Clients" },
  { href: "/analytics", label: "Analytics" },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerif.variable} antialiased font-[family-name:var(--font-dm-sans)]`}>
        <AuthProvider>
          <AppShell navLinks={navLinks}>
            {children}
          </AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
