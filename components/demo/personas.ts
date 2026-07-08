import type { NavGroup } from '@/components/AppShell';

/**
 * Demo personas — one entry per "view" the demo can switch into.
 *
 * Each persona carries the full shell identity: sidebar nav, the role
 * surface label under the wordmark, a home route, and a display card
 * (name + role) for the switcher. Switching persona = the whole app
 * transforms, not just the page.
 *
 * Pure data, importable from server components (app/layout.tsx uses the
 * admin persona's nav as the non-demo default — same arrays as before,
 * relocated here so they exist in exactly one place).
 */

export interface DemoPersona {
  id: string;
  /** Short view name shown in the switcher, e.g. "Concierge (CX)". */
  label: string;
  /** The human being impersonated, e.g. "Alex Rivera". */
  person: string;
  /** One-line description of what this view is for. */
  blurb: string;
  /** Emoji avatar for the switcher row. */
  icon: string;
  /** Route to land on when switching to this persona. */
  home: string;
  /** Label under the sidebar wordmark. */
  roleSurface: string;
  nav: NavGroup[];
}

// Role nav arrays per design spec (mesh id=115) — moved verbatim from
// app/layout.tsx so layout and the demo switcher share one source.

export const conciergeNav: NavGroup[] = [
  {
    items: [
      { href: '/concierge', label: 'My Queue' },
      { href: '/concierge/review', label: 'Brief Review' },
      { href: '/intake', label: 'Intake Triage' },
      { href: '/cases', label: 'Cases' },
    ],
  },
];

export const clinicianNav: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'Work Dashboard' },
      { href: '/queue', label: 'My Queue' },
      { href: '/cases', label: 'Cases' },
      { href: '/quality', label: 'Quality' },
    ],
  },
];

export const deliveryLeadNav: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'Work Dashboard' },
      { href: '/delivery-lead', label: 'Team Ops' },
      { href: '/pods', label: 'Pods' },
      { href: '/quality', label: 'Quality' },
    ],
  },
];

export const executiveNav: NavGroup[] = [
  {
    items: [
      { href: '/command-center', label: 'Command Center' },
      { href: '/mission-control', label: 'Mission Control' },
      { href: '/cockpit', label: 'Command Cockpit' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/clients', label: 'Clients' },
    ],
  },
];

export const tpaClientNav: NavGroup[] = [
  {
    items: [
      { href: '/portal/tpa', label: 'Overview' },
      { href: '/portal/tpa/submit', label: 'Submit Auth' },
      { href: '/cases', label: 'Cases' },
      { href: '/portal/tpa/practices', label: 'Network' },
      { href: '/admin/billing', label: 'Billing' },
    ],
  },
];

export const adminInternalNav: NavGroup[] = [
  {
    items: [
      { href: '/dashboard', label: 'Work Dashboard' },
      { href: '/mission-control', label: 'Mission Control' },
      { href: '/cockpit', label: 'Command Cockpit' },
      { href: '/ops', label: 'Operations' },
      { href: '/clients', label: 'Clients' },
      { href: '/admin/billing', label: 'Billing' },
    ],
  },
];

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: 'concierge',
    label: 'Concierge (CX)',
    person: 'Alex Rivera',
    blurb: 'Member-facing front line — intake, follow-ups, brief validation gate',
    icon: '🎧',
    home: '/concierge',
    roleSurface: 'Concierge · CX',
    nav: conciergeNav,
  },
  {
    id: 'clinical',
    label: 'Medical Review',
    person: 'Clinical team',
    blurb: 'LPN → RN → MD worklist with SLA pressure and AI briefs',
    icon: '🩺',
    home: '/queue',
    roleSurface: 'Medical Review',
    nav: clinicianNav,
  },
  {
    id: 'delivery-lead',
    label: 'Delivery Lead',
    person: 'Ops leadership',
    blurb: 'Team load, reassignment, pod health, quality audits',
    icon: '📋',
    home: '/delivery-lead',
    roleSurface: 'Delivery Lead',
    nav: deliveryLeadNav,
  },
  {
    id: 'executive',
    label: 'Executive',
    person: 'Command center',
    blurb: 'Volume, SLA posture, and the Pod Day cockpit tour',
    icon: '📈',
    home: '/command-center',
    roleSurface: 'Executive',
    nav: executiveNav,
  },
  {
    id: 'tpa-client',
    label: 'TPA Client Portal',
    person: 'Client admin',
    blurb: 'What the TPA sees — network cases, submissions, billing',
    icon: '🏢',
    home: '/portal/tpa',
    roleSurface: 'TPA Portal',
    nav: tpaClientNav,
  },
  {
    id: 'admin',
    label: 'Admin (Internal)',
    person: 'Platform ops',
    blurb: 'Everything — the default internal shell',
    icon: '🛠️',
    home: '/dashboard',
    roleSurface: 'Admin',
    nav: adminInternalNav,
  },
];

export const DEFAULT_PERSONA_ID = 'admin';

export function getPersona(id: string | null | undefined): DemoPersona {
  return DEMO_PERSONAS.find((p) => p.id === id) ?? DEMO_PERSONAS.find((p) => p.id === DEFAULT_PERSONA_ID)!;
}
