'use client';
import { SegmentError } from '@/components/SegmentError';
export default function IntakeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="intake queue" />;
}
