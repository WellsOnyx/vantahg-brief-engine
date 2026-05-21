'use client';
import { SegmentError } from '@/components/SegmentError';
export default function QueueError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="queue" />;
}
