'use client';
import { SegmentError } from '@/components/SegmentError';
export default function CasesError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="case list" />;
}
