import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BuildStackProps extends cdk.StackProps {
  envName: string;
  appRepositoryName: string; // e.g. "vantaum-prod-app"
}

/**
 * BuildStack
 *
 * Provisions the CI infrastructure for building container images.
 * Currently focused on producing verified arm64 images for the Fargate service.
 *
 * This stack exists so we are never dependent on a developer's local machine
 * (Colima, Docker Desktop, or otherwise) for the architecture-critical build step.
 */
export class BuildStack extends cdk.Stack {
  public readonly arm64BuildProject: codebuild.Project;

  constructor(scope: Construct, id: string, props: BuildStackProps) {
    super(scope, id, props);

    const { envName, appRepositoryName } = props;

    // Reference the existing app ECR repository (created / managed by ComputeStack / earlier deploys)
    const appRepository = ecr.Repository.fromRepositoryName(
      this,
      'AppRepository',
      appRepositoryName,
    );

    // Service role for the CodeBuild project
    const buildRole = new iam.Role(this, 'Arm64BuildRole', {
      assumedBy: new iam.ServicePrincipal('codebuild.amazonaws.com'),
      description: 'Role for arm64 CodeBuild project that builds and pushes the VantaUM app image',
    });

    // Permissions needed to build and push the arm64 image
    appRepository.grantPullPush(buildRole);

    // Allow reading build secrets if we later move third-party keys or similar into Secrets Manager for builds
    // (currently most secrets are only needed at runtime, but we keep the door open)
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [`arn:aws:secretsmanager:${this.region}:${this.account}:secret:vantaum-${envName}-*`],
      }),
    );

    // CloudWatch Logs permissions (standard for CodeBuild)
    buildRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
    );

    // The actual arm64 build project
    // Using native arm64 compute so we never get silent amd64 images again.
    //
    // Source: GitHub. We pin to the repo but leave the ref/branch to be supplied
    // at start-build time via sourceVersion (commit SHA or branch name). That
    // lets us build any branch/commit on demand without redeploying CDK.
    //
    // Auth: relies on a per-account GitHub OAuth/PAT connection that must be
    // configured ONCE in the CodeBuild console (Settings → Source providers).
    // If not set up yet, the first start-build will return AccessDeniedException
    // — see runbook in docs for the 1-click console wiring.
    this.arm64BuildProject = new codebuild.Project(this, 'Arm64AppBuild', {
      projectName: `vantaum-${envName}-arm64-app-build`,
      description: 'Builds the VantaUM Next.js app as a linux/arm64 Docker image and pushes to ECR',
      role: buildRole,
      source: codebuild.Source.gitHub({
        owner: 'WellsOnyx',
        repo: 'vantahg-brief-engine',
        // Default branch ref — overridden per build via --source-version
        branchOrRef: 'claude/roadmap-20260518',
        cloneDepth: 1,
      }),
      environment: {
        // Native arm64 build host. Amazon Linux 2023 standard 3.0 is the
        // current shipping image in aws-cdk-lib 2.171; the older
        // AMAZON_LINUX_2_ARM constant was dropped from this version's typings.
        buildImage: codebuild.LinuxArmBuildImage.AMAZON_LINUX_2023_STANDARD_3_0,
        computeType: codebuild.ComputeType.SMALL,
        privileged: true, // Required for docker daemon inside the CodeBuild container.
      },
      environmentVariables: {
        ECR_REPOSITORY_URI: {
          value: appRepository.repositoryUri,
        },
        AWS_DEFAULT_REGION: {
          value: this.region,
        },
        // Default tag for the current v5 arm64 cutover.
        // Can be overridden at build time via CodeBuild console / start-build API.
        IMAGE_TAG: {
          value: 'v5-arm64',
        },
      },
      buildSpec: codebuild.BuildSpec.fromSourceFilename('buildspec.yml'),
      timeout: cdk.Duration.minutes(30),
    });

    // Output the project name so it can be referenced in pipelines or scripts
    new cdk.CfnOutput(this, 'Arm64BuildProjectName', {
      value: this.arm64BuildProject.projectName,
      description: 'Name of the arm64 CodeBuild project for the app image',
    });
  }
}
