import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import DemoWalkthrough from '@/components/demo/DemoWalkthrough';
import { VhgReviewPanels } from '@/components/vhg/VhgReviewPanels';
import { StoplossDashboard } from '@/components/vhg/StoplossDashboard';
import StoplossReviewPage from '@/app/stoploss/review/[id]/page';
import { metadata } from '@/app/stoploss/layout';
import { VHG_BRAND } from '@/lib/vhg/brand';
import { demoWalkthroughVhgScore } from '@/lib/vhg/demo-brief';
import { DEMO_WALKTHROUGH_VHG_SCORE } from '@/lib/vhg/demo-brief-score';
import { getStoplossDashboard } from '@/lib/vhg/dashboard';
import { getMedReviewDemoCase, panelFromCase } from '@/lib/vhg/portfolio';

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Area: ({ name }: { name?: string }) => <span>{name}</span>,
  Bar: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
}));

function assertTrademark(html: string) {
  expect(html).toContain(VHG_BRAND);
  expect(html).not.toMatch(/VHG(?!\u2122)/);
}

describe('VHG trademark on rendered demo surfaces', () => {
  it('keeps the walkthrough snapshot equal to the live score', () => {
    expect(demoWalkthroughVhgScore()).toEqual(DEMO_WALKTHROUGH_VHG_SCORE);
  });

  it('renders VHG™ on the /demo physician step', () => {
    const { container } = render(<DemoWalkthrough vhgScore={demoWalkthroughVhgScore()} initialStep={2} />);
    assertTrademark(container.innerHTML);
    expect(container.textContent).toContain('Likely IDR Contested Score');
    expect(container.textContent).toContain('Moderate');
    expect(container.textContent).toContain('68%');
    expect(container.textContent).toContain('criteria result (demo)');
    expect(container.textContent).toContain('The doctor decides');
  });

  it('renders VHG™ on the stop-loss dashboard and case panel', async () => {
    const dashboard = getStoplossDashboard();
    const dash = render(
      <StoplossDashboard result={dashboard} basePath="/stoploss" />,
    );
    assertTrademark(dash.container.innerHTML);

    const panel = panelFromCase(getMedReviewDemoCase('vhg-mr-0101')!, false);
    const review = render(<VhgReviewPanels panel={panel} />);
    assertTrademark(review.container.innerHTML);
    expect(review.container.textContent).toContain('Likely IDR Contested Score');
    expect(review.container.textContent).toMatch(/High|Moderate|Low/);

    expect(metadata.description).toContain(VHG_BRAND);
    expect(String(metadata.description)).not.toMatch(/VHG(?!\u2122)/);

    vi.stubEnv('ENABLE_VHG_SCORE_DEMO', 'true');
    const reviewPage = render(await StoplossReviewPage({ params: Promise.resolve({ id: 'vhg-mr-0101' }) }));
    assertTrademark(reviewPage.container.innerHTML);
  });
});