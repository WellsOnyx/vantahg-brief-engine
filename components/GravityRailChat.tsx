'use client';

import { useEffect, useRef } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GravityRailChatProps {
  /** Gravity Rail workspace UUID — from NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID */
  workspaceId: string;
  /** Site UUID registered in your GR workspace */
  siteId: string;
  /** Workflow slug — determines which GR workflow starts the conversation */
  workflowSlug: string;
  /** Locale (default: "en") */
  locale?: string;
  /** Headline shown in the launcher popover */
  title?: string;
  /** Subtitle shown inside the launcher */
  subtitle?: string;
  /** CTA button text */
  buttonText?: string;
  /** Enable voice/microphone mode */
  voice?: boolean;
  /** Start the widget expanded */
  startOpen?: boolean;
  /** Collapsed launcher width in px (default: 80) */
  launcherWidth?: number;
  /** Collapsed launcher height in px (default: 80) */
  launcherHeight?: number;
  /** Expanded widget width in px (default: 420) */
  widgetWidth?: number;
  /** Expanded widget height in px (default: 640) */
  widgetHeight?: number;
  /** CSS bottom offset (default: "24px") */
  bottom?: string;
  /** CSS right offset (default: "24px") */
  right?: string;
  /** Custom z-index (default: 2147483000) */
  zIndex?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * GravityRailChat — drop-in floating chat widget powered by Gravity Rail.
 *
 * Injects the GR loader script on mount and removes it on unmount.
 * Safe for Next.js App Router (client component only).
 *
 * Usage:
 * ```tsx
 * <GravityRailChat
 *   workspaceId={process.env.NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID!}
 *   siteId={process.env.NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID!}
 *   workflowSlug="member-support"
 *   title="Need help?"
 *   subtitle="Our AI assistant is here"
 *   buttonText="Chat now"
 * />
 * ```
 */
export function GravityRailChat({
  workspaceId,
  siteId,
  workflowSlug,
  locale = 'en',
  title,
  subtitle,
  buttonText,
  voice = false,
  startOpen = false,
  launcherWidth,
  launcherHeight,
  widgetWidth,
  widgetHeight,
  bottom,
  right,
  zIndex,
}: GravityRailChatProps) {
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    // Don't double-inject
    if (scriptRef.current) return;

    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://app.gravityrail.com/widgets/chat.js';

    // Required
    script.setAttribute('data-wid', workspaceId);
    script.setAttribute('data-site', siteId);
    script.setAttribute('data-workflow', workflowSlug);
    script.setAttribute('data-locale', locale);

    // Optional
    if (title) script.setAttribute('data-title', title);
    if (subtitle) script.setAttribute('data-subtitle', subtitle);
    if (buttonText) script.setAttribute('data-button', buttonText);
    if (voice) script.setAttribute('data-voice', 'true');
    if (startOpen) script.setAttribute('data-open', 'true');
    if (launcherWidth != null) script.setAttribute('data-launcher-width', String(launcherWidth));
    if (launcherHeight != null) script.setAttribute('data-launcher-height', String(launcherHeight));
    if (widgetWidth != null) script.setAttribute('data-widget-width', String(widgetWidth));
    if (widgetHeight != null) script.setAttribute('data-widget-height', String(widgetHeight));
    if (bottom) script.setAttribute('data-bottom', bottom);
    if (right) script.setAttribute('data-right', right);
    if (zIndex != null) script.setAttribute('data-z-index', String(zIndex));

    document.body.appendChild(script);
    scriptRef.current = script;

    return () => {
      // Remove the script on unmount
      if (scriptRef.current) {
        document.body.removeChild(scriptRef.current);
        scriptRef.current = null;
      }
      // Remove any GR widget iframe the script injected
      document.querySelectorAll('[id^="gr-chat-widget"]').forEach((el) => el.remove());
    };
  }, [
    workspaceId, siteId, workflowSlug, locale,
    title, subtitle, buttonText, voice, startOpen,
    launcherWidth, launcherHeight, widgetWidth, widgetHeight,
    bottom, right, zIndex,
  ]);

  // No visible DOM output — the widget is injected by the GR script
  return null;
}

// ── VantaUM-specific preset ───────────────────────────────────────────────────

/**
 * VantaMemberChat — pre-configured for the VantaUM member support workflow.
 * Drop this into any page that needs member-facing chat.
 */
export function VantaMemberChat() {
  const workspaceId = process.env.NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID;
  const siteId = process.env.NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID;
  const workflowSlug = process.env.NEXT_PUBLIC_GRAVITY_RAIL_WORKFLOW_SLUG ?? 'member-support';

  if (!workspaceId || !siteId) {
    // Silently no-op in production if not configured; log in dev
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '[VantaMemberChat] NEXT_PUBLIC_GRAVITY_RAIL_WORKSPACE_ID and ' +
        'NEXT_PUBLIC_GRAVITY_RAIL_SITE_ID must be set to enable the chat widget.',
      );
    }
    return null;
  }

  return (
    <GravityRailChat
      workspaceId={workspaceId}
      siteId={siteId}
      workflowSlug={workflowSlug}
      title="VantaUM Support"
      subtitle="Ask about your authorization request"
      buttonText="Get help"
      bottom="24px"
      right="24px"
    />
  );
}
