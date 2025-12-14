#!/bin/bash
#
# Setup Cloud Scheduler jobs for Marketplace Billing
#
# Usage: ./scripts/setup-marketplace-scheduler.sh
#

set -e

PROJECT_ID="johnb-2025"
REGION="us-central1"
SERVICE_ACCOUNT="cloud-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
BASE_URL="https://john-bogle-ui-bmopaivmsq-uc.a.run.app/api/jobs"

echo "=========================================="
echo "Marketplace Billing - Cloud Scheduler Setup"
echo "=========================================="
echo ""
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Base URL: $BASE_URL"
echo ""

# Check if service account exists
echo "Step 1: Checking service account..."
if ! gcloud iam service-accounts describe $SERVICE_ACCOUNT --project=$PROJECT_ID &>/dev/null; then
  echo "  Creating service account: cloud-scheduler"
  gcloud iam service-accounts create cloud-scheduler \
    --display-name="Cloud Scheduler Service Account" \
    --project=$PROJECT_ID
else
  echo "  Service account already exists"
fi

# Grant Cloud Run invoker role
echo ""
echo "Step 2: Granting Cloud Run invoker permissions..."
gcloud run services add-iam-policy-binding john-bogle-ui \
  --region=$REGION \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID 2>/dev/null || echo "  (Permission may already exist)"

# Job definitions: name|schedule|description
JOBS=(
  "marketplace-daily-aggregation|0 6 * * *|Aggregate daily usage metrics and send quota warnings"
  "marketplace-weekly-reports|0 9 * * 1|Generate and send weekly usage reports to users"
  "marketplace-monthly-revenue|0 0 1 * *|Calculate publisher revenue shares for previous month"
  "marketplace-publisher-payouts|0 12 15 * *|Process pending publisher payouts via Stripe"
  "marketplace-quarterly-cleanup|0 2 1 1,4,7,10 *|Archive old records and clean up data"
)

echo ""
echo "Step 3: Creating/updating scheduler jobs..."
echo ""

for job in "${JOBS[@]}"; do
  IFS='|' read -r name schedule description <<< "$job"

  echo "  📅 $name"
  echo "     Schedule: $schedule"

  # Delete if exists (for updates)
  gcloud scheduler jobs delete $name --location=$REGION --quiet 2>/dev/null || true

  # Create job
  gcloud scheduler jobs create http $name \
    --location=$REGION \
    --schedule="$schedule" \
    --uri="${BASE_URL}/${name}" \
    --http-method=POST \
    --headers="X-CloudScheduler=true,Content-Type=application/json" \
    --oidc-service-account-email=$SERVICE_ACCOUNT \
    --description="$description" \
    --project=$PROJECT_ID \
    --quiet

  echo "     ✅ Created"
  echo ""
done

echo "=========================================="
echo "✅ All marketplace scheduler jobs configured!"
echo "=========================================="
echo ""
echo "Jobs created:"
gcloud scheduler jobs list --location=$REGION --format='table(name,schedule,state)' --project=$PROJECT_ID
echo ""
echo "To manually trigger a job:"
echo "  gcloud scheduler jobs run marketplace-daily-aggregation --location=$REGION"
echo ""
echo "To view logs:"
echo "  gcloud logging read 'resource.type=\"cloud_scheduler_job\"' --limit=10"
