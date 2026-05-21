'use client';
import { SegmentError } from '@/components/SegmentError';
export default function ConciergeError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="concierge view" />;
}
