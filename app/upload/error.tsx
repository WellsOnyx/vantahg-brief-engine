'use client';
import { SegmentError } from '@/components/SegmentError';
export default function UploadError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="upload view" />;
}
