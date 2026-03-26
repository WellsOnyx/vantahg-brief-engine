import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VantaUM | Interactive Demo',
  description:
    'See how VantaUM transforms utilization review. Watch an AI clinical brief generate in real-time, then see the physician determination workflow.',
};

/**
 * Standalone layout for /demo — no AppShell, no auth, iframe-friendly.
 * Inherits fonts from root layout but strips all navigation chrome.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
