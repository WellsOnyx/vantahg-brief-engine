'use client';
import { SegmentError } from '@/components/SegmentError';
export default function PortalStatusError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="portal status" backHref="/portal/status" backLabel="Back to authorization status" />;
}
