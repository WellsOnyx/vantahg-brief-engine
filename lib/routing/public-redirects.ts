/**
 * Public redirects. Standalone UM sales paths land on the Med Review application.
 * Existing staff signup alias stays. Do not point these at an IRO lifecycle route.
 */

export interface PublicRedirect {
  source: string;
  destination: string;
  permanent: boolean;
}

export const MED_REVIEW_OFFER_PATH = '/signup-tpa';

export const PUBLIC_REDIRECTS: readonly PublicRedirect[] = [
  { source: '/sign-up', destination: '/signup', permanent: false },
  { source: '/um', destination: MED_REVIEW_OFFER_PATH, permanent: false },
  { source: '/products/um', destination: MED_REVIEW_OFFER_PATH, permanent: false },
  { source: '/brief-engine', destination: MED_REVIEW_OFFER_PATH, permanent: false },
  { source: '/ai-um', destination: MED_REVIEW_OFFER_PATH, permanent: false },
  { source: '/utilization-management', destination: MED_REVIEW_OFFER_PATH, permanent: false },
];
