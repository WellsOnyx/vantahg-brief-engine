import { redactCaseForViewer } from '@/lib/case-spine/rbac';
import type { CanonicalCase, DeterminationPackage, SpineViewer } from '@/lib/case-spine/types';
import { portalPackageUrl } from './webhook';

export interface PortalDetermination {
  case_id: string;
  case_number: string;
  client_id: string;
  external_id: string | null;
  type: CanonicalCase['type'];
  state: CanonicalCase['state'];
  determination: CanonicalCase['determination'];
  determined_at: string | null;
  sla_status: CanonicalCase['sla_status'];
  fanout_status: CanonicalCase['fanout_status'];
  download_url: string;
  package_version: number | null;
  package_key: string | null;
  letter_available: boolean;
}

export function toPortalDetermination(
  c: CanonicalCase,
  pkg: DeterminationPackage | null,
  viewer?: SpineViewer,
  appUrl?: string,
): PortalDetermination {
  const visible = viewer ? redactCaseForViewer(viewer, c) : c;
  return {
    case_id: visible.case_id,
    case_number: visible.case_number,
    client_id: visible.client_id,
    external_id: visible.external_id,
    type: visible.type,
    state: visible.state,
    determination: visible.determination,
    determined_at: visible.determined_at,
    sla_status: visible.sla_status,
    fanout_status: visible.fanout_status,
    download_url: portalPackageUrl(visible.case_id, appUrl),
    package_version: visible.determination_package_version,
    package_key: visible.determination_package_key,
    letter_available: Boolean(pkg?.letter_html),
  };
}

export function isSignedForPortal(c: CanonicalCase): boolean {
  return Boolean(c.determination && c.determination_package_version);
}
