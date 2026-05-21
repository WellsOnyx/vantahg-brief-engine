'use client';
import { SegmentError } from '@/components/SegmentError';
export default function ClientError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="client view" backHref="/client/cases" backLabel="Back to my cases" />;
}
