import { getCockpitDay } from '@/lib/cockpit/get-cockpit-day';
import { CockpitWalkthrough } from '@/components/cockpit/CockpitWalkthrough';

export const dynamic = 'force-dynamic';

/**
 * Command Cockpit — the Pod Day Gauntlet walkthrough.
 * Server-loads the day (demo seed by default; real cases only when
 * ENABLE_LABOR_METRIC is on in the MVP env), then renders the client tour.
 */
export default async function CockpitPage() {
  const day = await getCockpitDay();
  return <CockpitWalkthrough day={day} />;
}
