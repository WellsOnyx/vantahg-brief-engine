import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as rds from 'aws-cdk-lib/aws-rds';
import { Construct } from 'constructs';

export interface DatabaseStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * RDS Postgres replacing Supabase Postgres.
 *
 * V1 sizing (pre-customer):
 *   - t4g.micro single-AZ — ~$15/mo, ARM-based, plenty of headroom for
 *     the workload until first paying TPA.
 *   - 20GB gp3 storage, autoscaling to 100GB.
 *   - 7-day backup retention.
 *   - PG 15 (matches Supabase's current major version so migrations apply
 *     unchanged).
 *
 * When the first real customer signs:
 *   - Flip `instanceSize` to medium + `multiAz: true` in this file.
 *   - cdk deploy. RDS does a rolling restart; ~5 min of expected
 *     read-only mode, no data loss.
 *
 * Network model:
 *   - Dedicated VPC for VantaUM (avoids collisions with anything else
 *     in the account). 10.10.0.0/16 — outside the default 172.31.x.x
 *     and the leftover WorkSpaces VPC at 172.16.x.x.
 *   - Two private subnets (one per AZ) for the DB. The DB has no public
 *     endpoint — only the Fargate task SG can reach it.
 *   - Two public subnets for the ALB (when ComputeStack lands).
 *   - One NAT gateway in the first AZ (saves ~$30/mo vs one per AZ;
 *     acceptable for V1 since Fargate egress is light).
 *
 * Secrets:
 *   - Master credentials → Secrets Manager. 30-day rotation enabled.
 *   - The app role (vantaum_app) is created by a one-shot migration we
 *     run after the DB is up — see docs/aws-migration.md for the SQL.
 */
export class DatabaseStack extends cdk.Stack {
  public readonly vpc: ec2.Vpc;
  public readonly database: rds.DatabaseInstance;
  public readonly dbSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: DatabaseStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // ── VPC ──────────────────────────────────────────────────────────────
    // 10.10.0.0/16 is intentional — outside the default + WorkSpaces ranges
    // so we never collide with anything pre-existing in the account.
    this.vpc = new ec2.Vpc(this, 'Vpc', {
      vpcName: `vantaum-${envName}-vpc`,
      ipAddresses: ec2.IpAddresses.cidr('10.10.0.0/16'),
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: 'public', subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: 'private', subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: 'isolated', subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 },
      ],
    });

    // ── Security group for the DB ────────────────────────────────────────
    // Default-deny inbound. ComputeStack will add a rule allowing 5432
    // from the Fargate task SG when it deploys. For now we leave it
    // closed — only a Bastion or SSM session manager can reach it
    // (intentionally, until we have something to connect from).
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSecurityGroup', {
      vpc: this.vpc,
      description: 'VantaUM RDS Postgres - locked down by default',
      allowAllOutbound: false,
    });

    // ── Subnet group (uses the isolated subnets) ─────────────────────────
    const subnetGroup = new rds.SubnetGroup(this, 'DbSubnetGroup', {
      description: 'Isolated subnets for VantaUM RDS Postgres',
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
    });

    // ── Parameter group ──────────────────────────────────────────────────
    // pg_stat_statements for query observability. Slow-query log at 500ms.
    const parameterGroup = new rds.ParameterGroup(this, 'DbParameterGroup', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_8,
      }),
      description: 'VantaUM Postgres - pg_stat_statements and slow query log',
      parameters: {
        // shared_preload_libraries is statically-loaded; setting it here
        // requires a reboot which CDK handles automatically.
        shared_preload_libraries: 'pg_stat_statements',
        'log_min_duration_statement': '500',
        'log_statement': 'ddl',
      },
    });

    // ── The instance ─────────────────────────────────────────────────────
    this.database = new rds.DatabaseInstance(this, 'Database', {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_15_8,
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.MICRO),
      vpc: this.vpc,
      subnetGroup,
      securityGroups: [this.dbSecurityGroup],
      parameterGroup,
      databaseName: 'vantaum',
      credentials: rds.Credentials.fromGeneratedSecret('vantaum_admin', {
        secretName: `vantaum-${envName}-db-admin-credentials`,
      }),
      // Single-AZ for V1. Flip to true when we go production.
      multiAz: false,
      // Storage
      allocatedStorage: 20,
      maxAllocatedStorage: 100,
      storageType: rds.StorageType.GP3,
      storageEncrypted: true,
      // Backups
      backupRetention: cdk.Duration.days(7),
      preferredBackupWindow: '07:00-08:00', // UTC = 3-4am Eastern
      deletionProtection: true,
      // Logs
      cloudwatchLogsExports: ['postgresql'],
      cloudwatchLogsRetention: cdk.aws_logs.RetentionDays.ONE_MONTH,
      // Maintenance
      autoMinorVersionUpgrade: true,
      preferredMaintenanceWindow: 'sun:08:00-sun:09:00', // UTC = 4-5am Eastern
      // Don't destroy on stack delete (safety)
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      // Public access OFF — only reachable from inside the VPC
      publiclyAccessible: false,
    });

    // ── Outputs ──────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      exportName: `vantaum-${envName}-vpc-id`,
    });
    new cdk.CfnOutput(this, 'DatabaseEndpoint', {
      value: this.database.dbInstanceEndpointAddress,
      exportName: `vantaum-${envName}-db-endpoint`,
    });
    new cdk.CfnOutput(this, 'DatabasePort', {
      value: this.database.dbInstanceEndpointPort,
      exportName: `vantaum-${envName}-db-port`,
    });
    new cdk.CfnOutput(this, 'DbSecretArn', {
      value: this.database.secret?.secretArn ?? 'no-secret',
      exportName: `vantaum-${envName}-db-secret-arn`,
    });
    new cdk.CfnOutput(this, 'DbSecurityGroupId', {
      value: this.dbSecurityGroup.securityGroupId,
      exportName: `vantaum-${envName}-db-security-group-id`,
    });
  }
}
