'use client';
import { SegmentError } from '@/components/SegmentError';
export default function StaffError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="staff directory" />;
}
