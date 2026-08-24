import { describe, it, expect, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import {
  GravityRailChat,
  VantaMemberChat,
  isGravityRailWidgetConfigured,
} from '@/components/GravityRailChat';

describe('isGravityRailWidgetConfigured', () => {
  it('is false when workspace or site is missing / blank', () => {
    expect(isGravityRailWidgetConfigured(undefined, 'site')).toBe(false);
    expect(isGravityRailWidgetConfigured('ws', undefined)).toBe(false);
    expect(isGravityRailWidgetConfigured('', 'site')).toBe(false);
    expect(isGravityRailWidgetConfigured('ws', '   ')).toBe(false);
    expect(isGravityRailWidgetConfigured(null, null)).toBe(false);
  });

  it('is true only when both public ids are actually set', () => {
    expect(isGravityRailWidgetConfigured('ws_abc', 'site_1')).toBe(true);
  });
});

describe('GravityRailChat widget visibility', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.unstubAllEnvs();
  });

  it('does not inject the GR script when public ids are missing', () => {
    render(<GravityRailChat workspaceId="" siteId="" workflowSlug="member-support" />);
    expect(document.querySelector('script[src="https://app.gravityrail.com/widgets/chat.js"]')).toBeNull();
  });

  it('injects the GR script only when both ids are set', () => {
    render(
      <GravityRailChat workspaceId="ws_abc" siteId="site_1" workflowSlug="member-support" />,
    );
    const script = document.querySelector('script[src="https://app.gravityrail.com/widgets/chat.js"]');
    expect(script).not.toBeNull();
    expect(script?.getAttribute('data-wid')).toBe('ws_abc');
    expect(script?.getAttribute('data-site')).toBe('site_1');
  });

  it('VantaMemberChat is hidden when NEXT_PUBLIC ids are unset', () => {
    vi.stubEnv('NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID', '');
    vi.stubEnv('NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID', '');
    const { container } = render(<VantaMemberChat />);
    expect(container.firstChild).toBeNull();
    expect(document.querySelector('script[src="https://app.gravityrail.com/widgets/chat.js"]')).toBeNull();
  });
});
