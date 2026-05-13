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

    const usePlaceholder = process.env.REAL_IMAGE_TAG === undefined;
    const containerImage = usePlaceholder
      ? ecs.ContainerImage.fromRegistry('public.ecr.aws/nginx/nginx:alpine')
      : ecs.ContainerImage.fromEcrRepository(this.appRepository, process.env.REAL_IMAGE_TAG);

    const containerPort = usePlaceholder ? 80 : 3000;

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
        ENABLE_AWS_STORAGE: 'true',
        ENABLE_AWS_AUTH: 'true',
        ENABLE_AWS_EMAIL: 'true',
      },
      // Real container will need more secrets (HelloSign, Anthropic, etc.) —
      // those land when we swap from placeholder to real image.
      secrets: usePlaceholder
        ? undefined
        : {
            // DB credentials. The secret value is a JSON object — we
            // exposed individual fields via JSONPath.
            DATABASE_URL: ecs.Secret.fromSecretsManager(dbSecret),
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
