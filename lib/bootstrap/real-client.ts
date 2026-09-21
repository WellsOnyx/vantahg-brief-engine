/**
 * Idempotent first-client + LPN/RN/MD roster bootstrap.
 *
 * Writes through a DbClient: the pg shim when the caller opened RDS,
 * or the Supabase JS client on the leftover hybrid path. This module
 * does not read Supabase URL keys and does not call auth.admin.
 */

import type { DbClient } from '@/lib/db/types';

export const CLIENT_TYPES = [
  'tpa',
  'health_plan',
  'self_funded_employer',
  'managed_care_org',
  'workers_comp',
  'auto_med',
] as const;

export type ClientType = (typeof CLIENT_TYPES)[number];

export type ReviewerRole = 'lpn' | 'rn' | 'md';

export interface ReviewerDraft {
  role: ReviewerRole;
  name: string;
  email: string;
  credentials: string;
  specialty?: string;
}

export interface RealClientArgs {
  clientName: string;
  clientType: ClientType;
  contactEmail: string;
  reviewers: ReviewerDraft[];
  dryRun: boolean;
}

export class BootstrapUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BootstrapUsageError';
  }
}

export class BootstrapWriteError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = 'BootstrapWriteError';
    this.exitCode = exitCode;
  }
}

export type RowAction = 'skipped_existing' | 'created' | 'would_create';

export interface BootstrapResult {
  dryRun: boolean;
  client: { name: string; action: RowAction; id: string };
  reviewers: Array<{
    name: string;
    email: string;
    credentials: string;
    role: ReviewerRole;
    action: RowAction;
    id?: string;
  }>;
}

const ROLE_CREDENTIALS: Record<ReviewerRole, string> = {
  lpn: 'LPN',
  rn: 'RN',
  md: 'MD',
};

function nextValue(argv: string[], i: number, flag: string): string {
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) {
    throw new BootstrapUsageError(`Missing value for ${flag}`);
  }
  return v;
}

function isClientType(value: string): value is ClientType {
  return (CLIENT_TYPES as readonly string[]).includes(value);
}

function requireEmail(value: string, label: string): string {
  const email = value.trim();
  if (!email.includes('@') || email.startsWith('@') || email.endsWith('@')) {
    throw new BootstrapUsageError(`${label} must be an email address`);
  }
  return email;
}

export function parseRealClientArgs(argv: string[]): RealClientArgs {
  let clientName: string | undefined;
  let clientType: ClientType = 'tpa';
  let contactEmail: string | undefined;
  let lpnName: string | undefined;
  let lpnEmail: string | undefined;
  let rnName: string | undefined;
  let rnEmail: string | undefined;
  let mdName: string | undefined;
  let mdEmail: string | undefined;
  let mdSpecialty: string | undefined;
  let dryRun = false;

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const take = (): string => {
      const v = nextValue(argv, i, flag);
      i += 1;
      return v;
    };
    switch (flag) {
      case '--client-name':
        clientName = take().trim();
        break;
      case '--client-type': {
        const raw = take().trim();
        if (!isClientType(raw)) {
          throw new BootstrapUsageError(
            `--client-type must be one of: ${CLIENT_TYPES.join(', ')}`,
          );
        }
        clientType = raw;
        break;
      }
      case '--contact-email':
        contactEmail = requireEmail(take(), '--contact-email');
        break;
      case '--lpn-name':
        lpnName = take().trim();
        break;
      case '--lpn-email':
        lpnEmail = requireEmail(take(), '--lpn-email');
        break;
      case '--rn-name':
        rnName = take().trim();
        break;
      case '--rn-email':
        rnEmail = requireEmail(take(), '--rn-email');
        break;
      case '--md-name':
        mdName = take().trim();
        break;
      case '--md-email':
        mdEmail = requireEmail(take(), '--md-email');
        break;
      case '--md-specialty':
        mdSpecialty = take().trim();
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--help':
      case '-h':
        throw new BootstrapUsageError('help');
      default:
        throw new BootstrapUsageError(`Unknown arg: ${flag}`);
    }
  }

  if (!clientName) throw new BootstrapUsageError('Missing --client-name');
  if (!contactEmail) throw new BootstrapUsageError('Missing --contact-email');

  const reviewers: ReviewerDraft[] = [];
  const push = (
    role: ReviewerRole,
    name: string | undefined,
    email: string | undefined,
    specialty?: string,
  ) => {
    if (!name && !email) return;
    if (!name || !email) {
      throw new BootstrapUsageError(
        `${role.toUpperCase()} requires both --${role}-name and --${role}-email`,
      );
    }
    reviewers.push({
      role,
      name,
      email,
      credentials: ROLE_CREDENTIALS[role],
      specialty,
    });
  };
  push('lpn', lpnName, lpnEmail);
  push('rn', rnName, rnEmail);
  push('md', mdName, mdEmail, mdSpecialty);

  if (reviewers.length === 0) {
    throw new BootstrapUsageError('At least one reviewer (LPN, RN, or MD) must be provided.');
  }

  return { clientName, clientType, contactEmail, reviewers, dryRun };
}

export function formatRealClientPlan(args: RealClientArgs): string[] {
  const lines = [
    `[dry-run] client "${args.clientName}" (${args.clientType}) contact ${args.contactEmail}`,
    '  columns: name, type, contact_email, uses_interqual=false, uses_mcg=false, contracted_sla_hours=48',
  ];
  for (const r of args.reviewers) {
    const specialty = r.specialty ? ` specialty=${r.specialty}` : '';
    lines.push(
      `[dry-run] reviewer ${r.credentials} "${r.name}" <${r.email}> max_cases_per_day=25${specialty}`,
    );
  }
  lines.push('[dry-run] No rows written.');
  return lines;
}

interface ExistingRow {
  id?: string;
  email?: string | null;
}

async function pingClients(db: DbClient): Promise<void> {
  const ping = await db.from('clients').select('id', { count: 'exact', head: true });
  if (ping.error) {
    throw new BootstrapWriteError(
      [
        `Database reachable but clients query failed: ${ping.error.message}`,
        'Check the connection and that schema migrations have been applied (npm run db:migrate:rds).',
      ].join('\n'),
      3,
    );
  }
}

async function findClient(db: DbClient, name: string): Promise<ExistingRow | null> {
  const res = await db.from('clients').select('id,name').eq('name', name).maybeSingle();
  if (res.error) {
    throw new BootstrapWriteError(`clients lookup failed: ${res.error.message}`, 3);
  }
  return (res.data as ExistingRow | null) ?? null;
}

async function findReviewer(db: DbClient, reviewer: ReviewerDraft): Promise<ExistingRow | null> {
  const byName = await db.from('reviewers').select('id,name,email').eq('name', reviewer.name).maybeSingle();
  if (byName.error) {
    throw new BootstrapWriteError(`reviewers lookup failed: ${byName.error.message}`, 3);
  }
  if (byName.data) return byName.data as ExistingRow;

  const byEmail = await db.from('reviewers').select('id,name,email').eq('email', reviewer.email).maybeSingle();
  if (byEmail.error) {
    throw new BootstrapWriteError(`reviewers lookup failed: ${byEmail.error.message}`, 3);
  }
  return (byEmail.data as ExistingRow | null) ?? null;
}

export async function bootstrapRealClient(
  db: DbClient,
  args: RealClientArgs,
): Promise<BootstrapResult> {
  await pingClients(db);

  const existingClient = await findClient(db, args.clientName);
  let clientOutcome: BootstrapResult['client'];

  if (existingClient?.id) {
    clientOutcome = {
      name: args.clientName,
      action: 'skipped_existing',
      id: String(existingClient.id),
    };
  } else if (args.dryRun) {
    clientOutcome = {
      name: args.clientName,
      action: 'would_create',
      id: '<dry-run>',
    };
  } else {
    const inserted = await db
      .from('clients')
      .insert({
        name: args.clientName,
        type: args.clientType,
        contact_email: args.contactEmail,
        uses_interqual: false,
        uses_mcg: false,
        contracted_sla_hours: 48,
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data) {
      throw new BootstrapWriteError(
        `Failed to create client: ${inserted.error?.message ?? 'unknown error'}`,
        4,
      );
    }
    const id = (inserted.data as ExistingRow).id;
    if (!id) {
      throw new BootstrapWriteError('Failed to create client: insert returned no id', 4);
    }
    clientOutcome = { name: args.clientName, action: 'created', id: String(id) };
  }

  const reviewers: BootstrapResult['reviewers'] = [];
  for (const reviewer of args.reviewers) {
    const existing = await findReviewer(db, reviewer);
    if (existing?.id) {
      reviewers.push({
        name: reviewer.name,
        email: reviewer.email,
        credentials: reviewer.credentials,
        role: reviewer.role,
        action: 'skipped_existing',
        id: String(existing.id),
      });
      continue;
    }
    if (args.dryRun) {
      reviewers.push({
        name: reviewer.name,
        email: reviewer.email,
        credentials: reviewer.credentials,
        role: reviewer.role,
        action: 'would_create',
      });
      continue;
    }
    const inserted = await db
      .from('reviewers')
      .insert({
        name: reviewer.name,
        email: reviewer.email,
        credentials: reviewer.credentials,
        specialty: reviewer.specialty ?? null,
        max_cases_per_day: 25,
        status: 'active',
      })
      .select('id')
      .single();
    if (inserted.error || !inserted.data) {
      throw new BootstrapWriteError(
        `Failed to create reviewer ${reviewer.name}: ${inserted.error?.message ?? 'unknown error'}`,
        5,
      );
    }
    const id = (inserted.data as ExistingRow).id;
    if (!id) {
      throw new BootstrapWriteError(`Failed to create reviewer ${reviewer.name}: insert returned no id`, 5);
    }
    reviewers.push({
      name: reviewer.name,
      email: reviewer.email,
      credentials: reviewer.credentials,
      role: reviewer.role,
      action: 'created',
      id: String(id),
    });
  }

  return { dryRun: args.dryRun, client: clientOutcome, reviewers };
}
