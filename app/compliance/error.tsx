'use client';
import { SegmentError } from '@/components/SegmentError';
export default function ComplianceError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="compliance view" />;
}
