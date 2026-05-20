import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface BuildStackProps extends cdk.StackProps {
  envName: string;
  appRepositoryName: string; // e.g. "vantaum-prod-app"
  /**
   * ARN of the CodeConnections GitHub connection authorizing CodeBuild to
   * clone the source repo. Created once per account+region via the Developer
   * Tools console (Settings → Connections → Create connection → GitHub).
   * The connection must be in `Available` state before the project can build.
   *
   * Required because the legacy OAuth-per-account credential is deprecated;
   * CodeConnections (formerly CodeStar Connections) is the modern auth path.
   */
  githubConnectionArn: string;
  /** GitHub owner. e.g. "WellsOnyx" */
  githubOwner: string;
  /** GitHub repo (no owner prefix). e.g. "vantahg-brief-engine" */
  githubRepo: string;
  /** Default branch the project tracks; per-build overrides via --source-version. */
  defaultBranch?: string;
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

    const {
      envName,
      appRepositoryName,
      githubConnectionArn,
      githubOwner,
      githubRepo,
      defaultBranch = 'main',
    } = props;

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

    // CodeConnections needs to be used by the build role to clone the source repo.
    buildRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['codeconnections:UseConnection', 'codestar-connections:UseConnection'],
        resources: [githubConnectionArn],
      }),
    );

    // CloudWatch Logs permissions (standard for CodeBuild)
    buildRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName('CloudWatchLogsFullAccess'),
    );

    // The actual arm64 build project
    // Using native arm64 compute so we never get silent amd64 images again.
    //
    // Source auth uses the modern CodeConnections (formerly CodeStar
    // Connections) GitHub integration via `connectionArn`. We construct the
    // source with `Source.gitHub` then patch the underlying CloudFormation
    // resource to set `Auth.Type=CODECONNECTIONS` with the ARN — the L2
    // construct doesn't yet expose `connectionArn` as a typed prop, but the
    // L1 override is type-safe and stable.
    //
    // `--source-version` at start-build time can target any commit or branch
    // without redeploying CDK.
    this.arm64BuildProject = new codebuild.Project(this, 'Arm64AppBuild', {
      projectName: `vantaum-${envName}-arm64-app-build`,
      description: 'Builds the VantaUM Next.js app as a linux/arm64 Docker image and pushes to ECR',
      role: buildRole,
      source: codebuild.Source.gitHub({
        owner: githubOwner,
        repo: githubRepo,
        branchOrRef: defaultBranch,
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

    // L1 patch: switch the GitHub source from the legacy OAuth auth to
    // CodeConnections. The L2 construct generates the project with no auth
    // block; we add Auth.Type=CODECONNECTIONS pointing at the connection ARN
    // so CodeBuild can clone the repo via the modern path.
    const cfnProject = this.arm64BuildProject.node.defaultChild as codebuild.CfnProject;
    cfnProject.addPropertyOverride('Source.Auth', {
      Type: 'CODECONNECTIONS',
      Resource: githubConnectionArn,
    });

    // Output the project name so it can be referenced in pipelines or scripts
    new cdk.CfnOutput(this, 'Arm64BuildProjectName', {
      value: this.arm64BuildProject.projectName,
      description: 'Name of the arm64 CodeBuild project for the app image',
    });
  }
}
