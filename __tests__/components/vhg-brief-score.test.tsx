import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { VhgDemoBriefScore } from '@/components/vhg/VhgDemoBriefScore';
import { VHG_BRAND, VHG_SCORE_LABEL } from '@/lib/vhg/brand';
import { DEMO_WALKTHROUGH_VHG_SCORE } from '@/lib/vhg/demo-brief-score';

describe('guided tour brief VHG score', () => {
  it('shows the same score as the physician step, with the trademark', () => {
    const { container } = render(<VhgDemoBriefScore />);
    const text = container.textContent ?? '';
    expect(text).toContain(VHG_SCORE_LABEL);
    expect(text).toContain(VHG_BRAND);
    expect(text).not.toMatch(/VHG(?!\u2122)/);
    expect(text).toContain('Moderate');
    expect(text).toContain(`${DEMO_WALKTHROUGH_VHG_SCORE.score}%`);
    expect(text).toContain('Likely IDR Contested Score');
    expect(text).toContain('Advisory. The physician decides.');
    for (const driver of DEMO_WALKTHROUGH_VHG_SCORE.drivers.slice(0, 3)) {
      expect(text).toContain(driver.label);
    }
    expect(text).not.toContain(DEMO_WALKTHROUGH_VHG_SCORE.drivers[3].label);
  });
});