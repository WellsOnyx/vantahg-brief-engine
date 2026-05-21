'use client';
import { SegmentError } from '@/components/SegmentError';
export default function PortalError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="portal" backHref="/portal" backLabel="Back to portal home" />;
}
