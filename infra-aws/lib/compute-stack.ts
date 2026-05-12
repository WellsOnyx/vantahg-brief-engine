import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  envName: string;
}

/**
 * Fargate-hosted Next.js app, replacing Vercel for the AUTHENTICATED
 * app surfaces only. The marketing site (vantaum.com root, /site,
 * /demo-record, /interactive-demo, blog) stays on Vercel.
 *
 * Split:
 *   - vantaum.com       → Vercel (marketing, no PHI, no BAA needed)
 *   - app.vantaum.com   → AWS Fargate (authenticated app, PHI, BAA)
 *
 * V1 (tonight): ECR repo only. Container image push target. No Fargate
 * service yet — that lands tomorrow when we have:
 *   - Dockerfile at repo root
 *   - Image built and pushed to ECR
 *   - DB credentials wired from Secrets Manager
 *   - Cognito User Pool ID/Client ID wired
 *   - All ENABLE_AWS_* flags set
 *   - HELLOSIGN, ANTHROPIC, etc. moved into Secrets Manager
 *
 * Why not the full service tonight: Fargate without a working image
 * fails health checks immediately. Better to deploy the service when
 * we can land the full stack in one session.
 *
 * For full plan see docs/aws-migration.md "Phase 5 - Compute".
 */
export class ComputeStack extends cdk.Stack {
  public readonly appRepository: ecr.Repository;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    const { envName } = props;

    // ── ECR repo for the Next.js app image ───────────────────────────────
    // Lifecycle: keep the last 30 images, expire untagged after 7 days.
    this.appRepository = new ecr.Repository(this, 'AppRepository', {
      repositoryName: `vantaum-${envName}-app`,
      imageScanOnPush: true,
      imageTagMutability: ecr.TagMutability.MUTABLE,
      lifecycleRules: [
        {
          description: 'Expire untagged images after 7 days',
          tagStatus: ecr.TagStatus.UNTAGGED,
          maxImageAge: cdk.Duration.days(7),
        },
        {
          description: 'Keep last 30 images total',
          tagStatus: ecr.TagStatus.ANY,
          maxImageCount: 30,
        },
      ],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    new cdk.CfnOutput(this, 'AppRepositoryUri', {
      value: this.appRepository.repositoryUri,
      exportName: `vantaum-${envName}-app-ecr-uri`,
    });
    new cdk.CfnOutput(this, 'AppRepositoryArn', {
      value: this.appRepository.repositoryArn,
      exportName: `vantaum-${envName}-app-ecr-arn`,
    });
  }
}
