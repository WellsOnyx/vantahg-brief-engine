'use client';

import React from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts';

/**
 * Production-quality wrapper for Recharts used on the internal /ops dashboard.
 *
 * This component is dynamically imported from app/ops/page.tsx so that
 * the heavy recharts library is never part of the primary server bundle
 * analysis during `next build`. This eliminates one of the persistent
 * "Module not found" sources that was breaking Vercel previews.
 *
 * All chart components are re-exported with the exact same API as before
 * so the rest of the ops page requires zero changes.
 */

export {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
};

export type { 
  // Re-export common recharts types that the ops page may use
  AreaProps,
  BarProps,
} from 'recharts';
