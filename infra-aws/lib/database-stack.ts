import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * RDS Postgres replacing Supabase Postgres.
 *
 * Sizing for V1 (584K target lives, ~41k auths/month):
 *   - Engine: aurora-postgresql v15 (matches Supabase's PG15)
 *     OR rds.DatabaseInstance with engine_version >= 15.x and t4g.medium
 *     to start. Aurora is more expensive but auto-fails-over and
 *     scales reads horizontally.
 *   - Multi-AZ in prod, single-AZ in dev.
 *   - Storage: gp3 100GB, autoscaling to 1TB. Auths + audit log grow
 *     fast, so don't undersize.
 *   - Backups: 14 days for prod, 1 day for dev.
 *   - Param group: enable pg_stat_statements; tune log_min_duration_statement
 *     to 500ms.
 *
 * Schema:
 *   - Same migrations under supabase/migrations/ run unchanged. CDK
 *     does not own schema — keep migrations in the app repo and apply
 *     them with `psql` or a one-shot migration Lambda invoked by
 *     CI/CD after `cdk deploy`.
 *   - Drop the auth.* schema references in RLS policies if you're not
 *     using PostgREST. The migrations reference auth.uid() in a few
 *     places — replace with a session-context GUC set by the app
 *     middleware (current_setting('vantaum.user_id', true)::uuid).
 *
 * Secrets:
 *   - DB master credentials → Secrets Manager (auto-rotation 30d).
 *   - App role credentials → separate secret with minimum privileges.
 *
 * Network:
 *   - VPC with two private subnets (one per AZ).
 *   - SG allowing 5432 from the Fargate task SG only.
 *   - No public endpoint. Use a Bastion or SSM session for one-off psql.
 */
export class DatabaseStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);
    // TODO: provision VPC (or import shared)
    // TODO: provision RDS instance with the parameters above
    // TODO: provision Secrets Manager secret + rotation Lambda
    // TODO: export DatabaseEndpoint + SecretArn for ComputeStack via cdk.CfnOutput
  }
}
