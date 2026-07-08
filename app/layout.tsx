import type { Metadata, Viewport } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";
import { DemoPersonaShell } from "@/components/demo/DemoPersonaShell";

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

// Role-aware navigation per design spec (mesh id=115) lives in
// components/demo/personas.ts — one source shared by this layout's default
// shell and the demo persona switcher. Non-demo behavior is unchanged: the
// Admin/Internal nav renders until per-request role resolution ships.
// (Full role resolution will be added in a follow-up, or via client-side
// useAuth fallback.)

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerif.variable} antialiased font-[family-name:var(--font-dm-sans)]`}>
        <AuthProvider>
          <DemoPersonaShell>{children}</DemoPersonaShell>
        </AuthProvider>
      </body>
    </html>
  );
}
