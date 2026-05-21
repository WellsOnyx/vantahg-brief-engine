'use client';
import { SegmentError } from '@/components/SegmentError';
export default function TeamError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="team access view" />;
}
