'use client';
import { SegmentError } from '@/components/SegmentError';
export default function PodsError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="pods view" />;
}
