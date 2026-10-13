import { StoplossDashboard } from '@/components/vhg/StoplossDashboard';
import { StoplossLive } from '@/components/vhg/StoplossLive';
import { DemoDisabled } from '@/components/vhg/DemoDisabled';
import { aggregateStoploss } from '@/lib/vhg/aggregate';
import { ENTITLED_CLIENT_ID } from '@/lib/vhg/catalog';
import { getStoplossDashboard } from '@/lib/vhg/dashboard';
import { isVhgScoreDemoEnabled } from '@/lib/vhg/flag';
import { LEDGER_END, LEDGER_START } from '@/lib/vhg/time-range';

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
  if (!result.ok) return <StoplossDashboard result={result} basePath="/stoploss" />;
  const initial = aggregateStoploss({
    clientId,
    grain: 'year',
    from: LEDGER_START,
    to: LEDGER_END,
  });
  if (!initial.ok) return <StoplossDashboard result={result} basePath="/stoploss" />;
  return <StoplossLive initial={initial} basePath="/stoploss" clientId={clientId} />;
}
