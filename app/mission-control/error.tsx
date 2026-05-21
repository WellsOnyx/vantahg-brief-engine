'use client';
import { SegmentError } from '@/components/SegmentError';
export default function MissionControlError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="mission control" />;
}
