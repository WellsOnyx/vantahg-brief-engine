#!/bin/bash
set -euo pipefail

# =============================================================================
# VantaUM V1 — Production Deploy Script (Full Quality, No Shortcuts)
# =============================================================================
# This script ships the complete V1 (TPA + Concierge 21-45 + AI 46-65 + all 13
# Payer IDR tasks) to real AWS Fargate behind app.vantaum.com.
#
# PREREQUISITES (run these first on your machine):
#   1. Colima running: colima start --cpu 4 --memory 8
#   2. AWS profile "vantaum" configured and working (309921834034)
#   3. Prod RDS has migrations 021-026 applied (see step below)
#   4. You are on the correct branch with latest code (claude/roadmap-20260518 or main)
#
# SAFETY:
# - This script is idempotent where possible.
# - Always apply DB migrations BEFORE rolling the new container image.
# - Have a rollback plan (previous ECS task revision or image tag).
#
# Usage:
#   chmod +x docs/production-deploy-v1-2026-05-19.sh
#   ./docs/production-deploy-v1-2026-05-19.sh
# =============================================================================

echo "=== VantaUM V1 Production Deploy — $(date) ==="

# --- 0. Pre-flight checks --------------------------------------------------------
echo "[0] Pre-flight checks..."

command -v docker >/dev/null 2>&1 || { echo "Docker not found. Start Colima first."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker daemon not running. Run: colima start"; exit 1; }

aws sts get-caller-identity --profile vantaum --region us-east-1 >/dev/null 2>&1 || {
  echo "AWS profile 'vantaum' not working or wrong account.";
  exit 1;
}

echo "    Docker + AWS profile OK"

# --- 1. RDS Migrations (CRITICAL - do this first) -------------------------------
echo ""
echo "[1] Prod RDS Migrations 021-026 (IDR support) — MUST BE DONE BEFORE IMAGE ROLL"

echo "    Option A (recommended): Use the SSM/bastion path documented in infra-aws/rds-migrations/README.md"
echo "    Option B: If you have direct psql access to the prod writer, run the 6 files in order:"
echo "      psql -h \$PROD_RDS_HOST ... -f infra-aws/rds-migrations/021_case_type.sql"
echo "      ... repeat for 022 through 026_idr_external_outcomes.sql"

read -p "Have the IDR migrations (021-026) been successfully applied to prod RDS? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborting. Apply migrations first — new image will 500 on case_type / attorney fields otherwise."
  exit 1
fi

# --- 2. Build the production image ---------------------------------------------
echo ""
echo "[2] Building production Docker image (linux/arm64)..."

docker build --platform linux/arm64 -t vantaum-app:v4 .

echo "    Image built: vantaum-app:v4"

# --- 3. ECR Login + Push -------------------------------------------------------
echo ""
echo "[3] Pushing to ECR..."

aws ecr get-login-password --profile vantaum --region us-east-1 | \
  docker login --username AWS --password-stdin 309921834034.dkr.ecr.us-east-1.amazonaws.com

docker tag vantaum-app:v4 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v4
docker tag vantaum-app:v4 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest

docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:v4
docker push 309921834034.dkr.ecr.us-east-1.amazonaws.com/vantaum-prod-app:latest

echo "    Pushed v4 + latest"

# --- 4. Force new deployment on ECS --------------------------------------------
echo ""
echo "[4] Forcing ECS service rollout (vantaum-prod / vantaum-prod-app)..."

aws ecs update-service \
  --cluster vantaum-prod \
  --service vantaum-prod-app \
  --force-new-deployment \
  --profile vantaum --region us-east-1

echo "    Rollout initiated. Monitor in ECS console or with:"
echo "    aws ecs describe-services --cluster vantaum-prod --service vantaum-prod-app --profile vantaum --region us-east-1"

# --- 5. Verification ------------------------------------------------------------
echo ""
echo "[5] Post-deploy verification checklist (run these after tasks are healthy):"

echo ""
echo "    5.1 Health check:"
echo "        curl -I http://vantaum-prod-alb-1169380410.us-east-1.elb.amazonaws.com/api/health"

echo ""
echo "    5.2 IDR surfaces (after logging in as idr-attorney or admin):"
echo "        - /attorney/review shows Payer IDR queue"
echo "        - Attorney assignment + determination flow works end-to-end"
echo "        - New statuses appear in analytics"

echo ""
echo "    5.3 Concierge flows still healthy (regression check)"
echo "        - /concierge/review, validation gates, first appeal"

echo ""
echo "    5.4 Full audit trail for new actions (check recent audit logs)"

echo ""
echo "=== Deploy script finished. Monitor rollout and verify before cutting DNS. ==="