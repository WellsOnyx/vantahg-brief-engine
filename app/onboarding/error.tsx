'use client';
import { SegmentError } from '@/components/SegmentError';
export default function OnboardingError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <SegmentError {...props} label="onboarding flow" />;
}
