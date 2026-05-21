import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  envName: string;
  vpc: ec2.IVpc;
  dbSecret: secretsmanager.ISecret;
  dbSecurityGroup: ec2.ISecurityGroup;
}

/**
 * Fargate-hosted Next.js app + ALB + SSM-accessible bastion.
 *
 * SCOPE:
 *   - ECR repo (defined in earlier v1; kept here for completeness)
 *   - Fargate service running the app on app.vantaum.com
 *   - ALB with HTTPS listener (ACM cert needed before HTTPS works)
 *   - SSM-only bastion EC2 in the same VPC as RDS, used for psql access
 *     to run migrations without opening RDS to the internet
 *
 * Initial deploy: uses a PLACEHOLDER nginx image so the service can come
 * up healthy before the real container is built. Once the real image
 * is pushed to ECR, redeploy with REAL_IMAGE_TAG env var set.
 *
 * After deploy:
 *   - app.vantaum.com isn't reachable until DNS + ACM are wired (manual)
 *   - SSM bastion is reachable via `aws ssm start-session
 *     --target i-xxxx --profile vantaum`
 */
export class ComputeStack extends cdk.Stack {
  public readonly appRepository: ecr.IRepository;
  public readonly cluster: ecs.Cluster;
  public readonly service: ecs.FargateService;
  public readonly loadBalancer: elbv2.ApplicationLoadBalancer;
  public readonly bastionInstance: ec2.Instance;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // VPC, DB security group, and DB secret come from DatabaseStack via
    // direct object reference (passed in bin/vantaum.ts). CDK turns these
    // into proper cross-stack imports automatically.
    const { vpc, dbSecret, dbSecurityGroup } = props;

    // ── ECR repo (from v1; reference, do not recreate) ──────────────────
    this.appRepository = ecr.Repository.fromRepositoryName(
      this,
      'AppRepository',
      `vantaum-${envName}-app`,
    );

    // ── Fargate cluster ─────────────────────────────────────────────────
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      vpc,
      clusterName: `vantaum-${envName}`,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
    });

    // ── Task role and execution role ────────────────────────────────────
    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'Permissions for the running VantaUM Fargate container',
    });
    // Grant the task read access to the DB secret.
    dbSecret.grantRead(taskRole);

    // The execution role is what pulls the image + writes logs (separate
    // from what the running container itself can do).
    const execRole = new iam.Role(this, 'ExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
      ],
    });
    this.appRepository.grantPull(execRole);

    // ── Task definition with placeholder image ──────────────────────────
    // Real image gets swapped in after the container is built + pushed.
    // Using nginx:alpine for the placeholder so the health check passes
    // (it listens on 80 by default — we map container 80 to the ALB).
    const taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      cpu: 1024,
      memoryLimitMiB: 2048,
      taskRole,
      executionRole: execRole,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
    });

    // Default to the real app image now that one's been pushed.
    // Set USE_PLACEHOLDER_IMAGE=true to revert to nginx for debugging.
    const usePlaceholder = process.env.USE_PLACEHOLDER_IMAGE === 'true';
    const imageTag = process.env.REAL_IMAGE_TAG ?? 'latest';
    const containerImage = usePlaceholder
      ? ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:alpine')
      : ecs.ContainerImage.fromEcrRepository(this.appRepository, imageTag);

    const containerPort = usePlaceholder ? 80 : 3000;

    // Third-party API keys live in a single JSON secret. Fields:
    //   anthropic_api_key, hellosign_api_key, hellosign_client_id,
    //   phaxio_api_key, phaxio_api_secret, phaxio_callback_token,
    //   google_vision_api_key, sentry_dsn, gravity_rail_api_key
    // Created here with empty defaults so the service can deploy even
    // before secrets are populated. Fill them in via AWS Console ->
    // Secrets Manager after the stack is up.
    // Third-party + Supabase API keys live in a single JSON secret.
    // The app still talks to Supabase Postgres for V1 - we'll port to
    // RDS-direct in a later phase. Until then, AWS-side compute + S3 +
    // SES are real, and the DB call path goes through Supabase.
    const thirdPartySecret = new secretsmanager.Secret(this, 'ThirdPartySecret', {
      secretName: `vantaum-${envName}-third-party-keys`,
      description: 'API keys for Supabase, Anthropic, HelloSign, Phaxio, Google Vision, Sentry, Gravity Rail',
      secretObjectValue: {
        supabase_url: cdk.SecretValue.unsafePlainText(''),
        supabase_anon_key: cdk.SecretValue.unsafePlainText(''),
        supabase_service_role_key: cdk.SecretValue.unsafePlainText(''),
        anthropic_api_key: cdk.SecretValue.unsafePlainText(''),
        hellosign_api_key: cdk.SecretValue.unsafePlainText(''),
        hellosign_client_id: cdk.SecretValue.unsafePlainText(''),
        phaxio_api_key: cdk.SecretValue.unsafePlainText(''),
        phaxio_api_secret: cdk.SecretValue.unsafePlainText(''),
        phaxio_callback_token: cdk.SecretValue.unsafePlainText(''),
        google_vision_api_key: cdk.SecretValue.unsafePlainText(''),
        sentry_dsn: cdk.SecretValue.unsafePlainText(''),
        gravity_rail_api_key: cdk.SecretValue.unsafePlainText(''),
        cron_secret: cdk.SecretValue.unsafePlainText(''),
        // Meow billing — PEPM invoice push + status sync. Slots
        // declared empty so CDK is self-consistent; populated out-of-
        // band via aws secretsmanager put-secret-value from the
        // bastion (see docs/meow-bootstrap-resume.md). NOTE: CDK does
        // not overwrite existing secret values on stack update — only
        // the initial create — so re-deploying this stack will NOT
        // wipe populated meow_* values.
        meow_api_key: cdk.SecretValue.unsafePlainText(''),
        meow_entity_id: cdk.SecretValue.unsafePlainText(''),
        meow_collection_account_id: cdk.SecretValue.unsafePlainText(''),
        meow_vantaum_product_id: cdk.SecretValue.unsafePlainText(''),
      },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });
    thirdPartySecret.grantRead(taskRole);

    const logGroup = new logs.LogGroup(this, 'AppLogGroup', {
      logGroupName: `/vantaum/${envName}/app`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    taskDefinition.addContainer('app', {
      image: containerImage,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'app',
        logGroup,
      }),
      portMappings: [{ containerPort, protocol: ecs.Protocol.TCP }],
      environment: {
        NODE_ENV: 'production',
        PORT: String(containerPort),
        // AWS adapter flags - the app routes through S3 / Cognito / SES.
        ENABLE_AWS_STORAGE: 'true',
        ENABLE_AWS_AUTH: 'true',
        ENABLE_AWS_EMAIL: 'true',
        // Route DB calls through the pg shim against RDS instead of
        // Supabase Postgres. lib/supabase.ts:27 reads this flag and
        // substitutes PgShimClient. Auth (auth.getUser) still routes
        // to Supabase Auth in V1 — see lib/supabase.ts:19-22, which
        // means the Supabase Auth secrets must still be populated for
        // authenticated routes to work.
        ENABLE_AWS_DB: 'true',
        ENABLE_REAL_ANTHROPIC: 'true',
        ENABLE_REAL_HELLOSIGN: 'true',
        ENABLE_REAL_EFAX: 'true',
        // Opt-in flag for the Meow billing client. Matches the
        // ENABLE_REAL_ANTHROPIC / ENABLE_REAL_HELLOSIGN pattern.
        // lib/env.ts::isRealMeowEnabled() reads this. Demo-mode stubs
        // run when false.
        ENABLE_REAL_MEOW: 'true',
        // App URL and SES sender (must be SES-verified domain).
        NEXT_PUBLIC_SITE_URL: 'https://app.vantaum.com',
        APP_URL: 'https://app.vantaum.com',
        SES_FROM_ADDRESS: 'noreply@vantaum.com',
        // Region for AWS SDK clients.
        AWS_REGION: this.region,
        // Cognito user pool wiring. Without these, the auth adapter falls
        // back to empty-string defaults and the magic-link route silently
        // returns 202 with no email actually sent. Pool + Lambdas are
        // deployed by the vantaum-prod-auth stack.
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: 'us-east-1_CjZbn5TD4',
        COGNITO_CLIENT_ID: '4v19mdtmaa8ubns3d6bsi4t2i7',
      },
      secrets: usePlaceholder
        ? undefined
        : {
            // RDS connection (available for the future direct-Postgres swap).
            DB_HOST: ecs.Secret.fromSecretsManager(dbSecret, 'host'),
            DB_PORT: ecs.Secret.fromSecretsManager(dbSecret, 'port'),
            DB_NAME: ecs.Secret.fromSecretsManager(dbSecret, 'dbname'),
            DB_USER: ecs.Secret.fromSecretsManager(dbSecret, 'username'),
            DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, 'password'),
            // Supabase connection - V1 app talks to Supabase Postgres
            // via the @supabase/supabase-js client. Will swap to direct
            // pg/Drizzle in a later phase.
            NEXT_PUBLIC_SUPABASE_URL: ecs.Secret.fromSecretsManager(thirdPartySecret, 'supabase_url'),
            NEXT_PUBLIC_SUPABASE_ANON_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'supabase_anon_key'),
            SUPABASE_SERVICE_ROLE_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'supabase_service_role_key'),
            // Third-party API keys.
            ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'anthropic_api_key'),
            HELLOSIGN_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'hellosign_api_key'),
            HELLOSIGN_CLIENT_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'hellosign_client_id'),
            // Meow billing — see docs/meow-bootstrap-resume.md for the
            // bootstrap sequence that populates these vault slots.
            MEOW_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_api_key'),
            MEOW_ENTITY_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_entity_id'),
            MEOW_COLLECTION_ACCOUNT_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_collection_account_id'),
            MEOW_VANTAUM_PRODUCT_ID: ecs.Secret.fromSecretsManager(thirdPartySecret, 'meow_vantaum_product_id'),
            PHAXIO_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'phaxio_api_key'),
            PHAXIO_API_SECRET: ecs.Secret.fromSecretsManager(thirdPartySecret, 'phaxio_api_secret'),
            PHAXIO_CALLBACK_TOKEN: ecs.Secret.fromSecretsManager(thirdPartySecret, 'phaxio_callback_token'),
            GOOGLE_VISION_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'google_vision_api_key'),
            SENTRY_DSN: ecs.Secret.fromSecretsManager(thirdPartySecret, 'sentry_dsn'),
            GRAVITY_RAIL_API_KEY: ecs.Secret.fromSecretsManager(thirdPartySecret, 'gravity_rail_api_key'),
            CRON_SECRET: ecs.Secret.fromSecretsManager(thirdPartySecret, 'cron_secret'),
          },
    });

    // ── Service security group ──────────────────────────────────────────
    const serviceSecurityGroup = new ec2.SecurityGroup(this, 'ServiceSecurityGroup', {
      vpc,
      description: 'VantaUM Fargate service - allow ALB and outbound',
      allowAllOutbound: true,
    });

    // Allow the service to reach RDS on 5432.
    // Use CfnSecurityGroupIngress directly (not dbSecurityGroup.addIngressRule)
    // to avoid creating a cross-stack reference from db-stack to compute-stack
    // which would form a dependency cycle.
    new ec2.CfnSecurityGroupIngress(this, 'DbIngressFromService', {
      groupId: dbSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      sourceSecurityGroupId: serviceSecurityGroup.securityGroupId,
      description: 'Fargate service to RDS',
    });

    // ── Fargate service ─────────────────────────────────────────────────
    this.service = new ecs.FargateService(this, 'Service', {
      cluster: this.cluster,
      taskDefinition,
      serviceName: `vantaum-${envName}-app`,
      desiredCount: 1,
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [serviceSecurityGroup],
      // Health check grace period - give the app 60s to come up.
      healthCheckGracePeriod: cdk.Duration.seconds(60),
      // Allow ECS Exec into the container for debugging.
      enableExecuteCommand: true,
      circuitBreaker: { rollback: true },
    });

    // ── ALB ──────────────────────────────────────────────────────────────
    this.loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', {
      vpc,
      internetFacing: true,
      loadBalancerName: `vantaum-${envName}-alb`,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
    });

    // HTTP listener that just answers 200 on / for now. HTTPS listener
    // requires an ACM cert which requires DNS validation -- manual step.
    const listener = this.loadBalancer.addListener('HttpListener', {
      port: 80,
      open: true,
    });

    listener.addTargets('AppTargets', {
      port: containerPort,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [this.service],
      healthCheck: {
        path: usePlaceholder ? '/' : '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
      },
      deregistrationDelay: cdk.Duration.seconds(30),
    });

    // ── SSM Bastion ─────────────────────────────────────────────────────
    // A t4g.nano instance inside the same VPC as RDS, with no SSH port
    // open, accessible only via SSM Session Manager. Used for psql and
    // ad-hoc DB ops. Costs ~$3/mo.
    const bastionSecurityGroup = new ec2.SecurityGroup(this, 'BastionSecurityGroup', {
      vpc,
      description: 'VantaUM bastion - egress only',
      allowAllOutbound: true,
    });

    // Allow bastion to reach RDS (same trick as service).
    new ec2.CfnSecurityGroupIngress(this, 'DbIngressFromBastion', {
      groupId: dbSecurityGroup.securityGroupId,
      ipProtocol: 'tcp',
      fromPort: 5432,
      toPort: 5432,
      sourceSecurityGroupId: bastionSecurityGroup.securityGroupId,
      description: 'SSM bastion to RDS',
    });

    const bastionRole = new iam.Role(this, 'BastionRole', {
      assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'),
      ],
    });
    dbSecret.grantRead(bastionRole);

    // Amazon Linux 2023 ARM, has SSM agent + psql via dnf.
    this.bastionInstance = new ec2.Instance(this, 'Bastion', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, ec2.InstanceSize.NANO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      securityGroup: bastionSecurityGroup,
      role: bastionRole,
      instanceName: `vantaum-${envName}-bastion`,
      userData: ec2.UserData.custom(`#!/bin/bash
# Install postgres client for psql access to RDS
dnf install -y postgresql15 jq
`),
    });

    // ── Outputs ─────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'AlbDnsName', {
      value: this.loadBalancer.loadBalancerDnsName,
      exportName: `vantaum-${envName}-alb-dns`,
    });
    new cdk.CfnOutput(this, 'ClusterName', {
      value: this.cluster.clusterName,
      exportName: `vantaum-${envName}-cluster-name`,
    });
    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      exportName: `vantaum-${envName}-service-name`,
    });
    new cdk.CfnOutput(this, 'BastionInstanceId', {
      value: this.bastionInstance.instanceId,
      exportName: `vantaum-${envName}-bastion-id`,
    });
    new cdk.CfnOutput(this, 'AppRepositoryUri', {
      value: this.appRepository.repositoryUri,
      exportName: `vantaum-${envName}-app-ecr-uri-v2`,
    });
  }
}
