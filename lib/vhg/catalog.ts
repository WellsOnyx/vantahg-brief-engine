import type { FacilityType } from './types';

export const VHG_PATTERN_COUNT = 200;
export const VHG_PORTFOLIO_COUNT = 96;

export const ENTITLED_CLIENT_ID = 'syn-vhg-med-review';
export const UNENTITLED_CLIENT_ID = 'syn-vhg-no-contract';

export interface ServiceLineTemplate {
  service_line: string;
  specialty: string;
  cpts: readonly string[];
}

export const SERVICE_LINES: readonly ServiceLineTemplate[] = [
  { service_line: 'Emergency medicine', specialty: 'emergency_medicine', cpts: ['99285', '99284', '99283'] },
  { service_line: 'Radiology', specialty: 'radiology', cpts: ['70553', '74177', '72148'] },
  { service_line: 'Anesthesiology', specialty: 'anesthesiology', cpts: ['00740', '00840', '01967'] },
  { service_line: 'Pathology', specialty: 'pathology', cpts: ['88305', '88307'] },
  { service_line: 'Orthopedics', specialty: 'orthopedics', cpts: ['27447', '29881', '99213'] },
  { service_line: 'Cardiology', specialty: 'cardiology', cpts: ['93458', '93306'] },
  { service_line: 'Air ambulance', specialty: 'air_ambulance', cpts: ['A0431', 'A0430'] },
];

export const DEMO_STATES = ['TX', 'FL', 'CA', 'NY', 'GA', 'AZ', 'OH', 'IL', 'NC', 'PA', 'NJ', 'CO', 'MN'] as const;

export const FACILITIES: readonly FacilityType[] = ['hospital', 'asc', 'office', 'freestanding_er'];

export const DEMO_MONTHS = ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'] as const;
