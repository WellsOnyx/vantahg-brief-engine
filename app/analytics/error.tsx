'use client';
import { SegmentError } from '@/components/SegmentError';
export default function AnalyticsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="analytics view" />;
}
