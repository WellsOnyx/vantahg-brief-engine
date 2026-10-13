import { StoplossDashboard } from '@/components/vhg/StoplossDashboard';
import { DemoDisabled } from '@/components/vhg/DemoDisabled';
import { ENTITLED_CLIENT_ID } from '@/lib/vhg/catalog';
import { getStoplossDashboard } from '@/lib/vhg/dashboard';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';

export const dynamic = 'force-dynamic';

export default async function StoplossPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string }>;
}) {
  if (!isVhgScoreDemoEnabled()) return <DemoDisabled />;
  const params = await searchParams;
  const clientId = params.client || ENTITLED_CLIENT_ID;
  const result = getStoplossDashboard(clientId);
  return <StoplossDashboard result={result} basePath="/stoploss" />;
}
