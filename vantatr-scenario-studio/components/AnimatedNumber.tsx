"use client";

import { useAnimatedNumber } from "./useAnimatedNumber";
import { formatUSD, formatNumber } from "@/lib/model";

export function AnimatedUSD({
  value,
  compact,
  className,
}: {
  value: number;
  compact?: boolean;
  className?: string;
}) {
  const animated = useAnimatedNumber(value);
  return <span className={className}>{formatUSD(animated, { compact })}</span>;
}

export function AnimatedCount({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const animated = useAnimatedNumber(value);
  return <span className={className}>{formatNumber(animated)}</span>;
}
