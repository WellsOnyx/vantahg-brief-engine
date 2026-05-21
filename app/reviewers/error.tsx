'use client';
import { SegmentError } from '@/components/SegmentError';
export default function ReviewersError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="reviewer panel" />;
}
