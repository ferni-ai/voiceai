# Marketplace Billing - Cloud Scheduler Setup

This document describes how to configure Google Cloud Scheduler jobs for the marketplace billing system.

## Prerequisites

- GCP project with Cloud Scheduler API enabled
- Service account with Cloud Run invoker permissions
- UI Server deployed with marketplace endpoints

## Job Configurations

### 1. Daily Usage Aggregation

**Schedule:** 6:00 AM UTC daily

```bash
gcloud scheduler jobs create http marketplace-daily-aggregation \
  --location=us-central1 \
  --schedule="0 6 * * *" \
  --uri="https://voiceai-ui-johnb-2025.a.run.app/api/jobs/marketplace-daily-aggregation" \
  --http-method=POST \
  --headers="X-CloudScheduler=true,Content-Type=application/json" \
  --oidc-service-account-email=cloud-scheduler@johnb-2025.iam.gserviceaccount.com \
  --description="Aggregate daily usage metrics and send quota warnings"
```

### 2. Weekly Usage Reports

**Schedule:** Monday 9:00 AM UTC

```bash
gcloud scheduler jobs create http marketplace-weekly-reports \
  --location=us-central1 \
  --schedule="0 9 * * 1" \
  --uri="https://voiceai-ui-johnb-2025.a.run.app/api/jobs/marketplace-weekly-reports" \
  --http-method=POST \
  --headers="X-CloudScheduler=true,Content-Type=application/json" \
  --oidc-service-account-email=cloud-scheduler@johnb-2025.iam.gserviceaccount.com \
  --description="Generate and send weekly usage reports to users"
```

### 3. Monthly Revenue Calculation

**Schedule:** 1st of each month at midnight UTC

```bash
gcloud scheduler jobs create http marketplace-monthly-revenue \
  --location=us-central1 \
  --schedule="0 0 1 * *" \
  --uri="https://voiceai-ui-johnb-2025.a.run.app/api/jobs/marketplace-monthly-revenue" \
  --http-method=POST \
  --headers="X-CloudScheduler=true,Content-Type=application/json" \
  --oidc-service-account-email=cloud-scheduler@johnb-2025.iam.gserviceaccount.com \
  --description="Calculate publisher revenue shares for previous month"
```

### 4. Publisher Payouts

**Schedule:** 15th of each month at noon UTC

```bash
gcloud scheduler jobs create http marketplace-publisher-payouts \
  --location=us-central1 \
  --schedule="0 12 15 * *" \
  --uri="https://voiceai-ui-johnb-2025.a.run.app/api/jobs/marketplace-publisher-payouts" \
  --http-method=POST \
  --headers="X-CloudScheduler=true,Content-Type=application/json" \
  --oidc-service-account-email=cloud-scheduler@johnb-2025.iam.gserviceaccount.com \
  --description="Process pending publisher payouts via Stripe"
```

### 5. Quarterly Cleanup

**Schedule:** 1st of Jan, Apr, Jul, Oct at 2:00 AM UTC

```bash
gcloud scheduler jobs create http marketplace-quarterly-cleanup \
  --location=us-central1 \
  --schedule="0 2 1 1,4,7,10 *" \
  --uri="https://voiceai-ui-johnb-2025.a.run.app/api/jobs/marketplace-quarterly-cleanup" \
  --http-method=POST \
  --headers="X-CloudScheduler=true,Content-Type=application/json" \
  --oidc-service-account-email=cloud-scheduler@johnb-2025.iam.gserviceaccount.com \
  --description="Archive old records and clean up data"
```

## Quick Setup Script

Run all jobs at once:

```bash
#!/bin/bash
# setup-marketplace-scheduler.sh

PROJECT_ID="johnb-2025"
REGION="us-central1"
SERVICE_ACCOUNT="cloud-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
BASE_URL="https://voiceai-ui-${PROJECT_ID}.a.run.app/api/jobs"

# Create service account if not exists
gcloud iam service-accounts create cloud-scheduler \
  --display-name="Cloud Scheduler Service Account" \
  --project=$PROJECT_ID 2>/dev/null || true

# Grant Cloud Run invoker role
gcloud run services add-iam-policy-binding voiceai-ui \
  --region=$REGION \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID

# Create scheduler jobs
JOBS=(
  "marketplace-daily-aggregation|0 6 * * *|Daily usage aggregation"
  "marketplace-weekly-reports|0 9 * * 1|Weekly usage reports"
  "marketplace-monthly-revenue|0 0 1 * *|Monthly revenue calculation"
  "marketplace-publisher-payouts|0 12 15 * *|Publisher payouts"
  "marketplace-quarterly-cleanup|0 2 1 1,4,7,10 *|Quarterly cleanup"
)

for job in "${JOBS[@]}"; do
  IFS='|' read -r name schedule description <<< "$job"

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
    --project=$PROJECT_ID

  echo "Created job: $name"
done

echo "All marketplace scheduler jobs configured!"
```

## Manual Triggering (Testing)

Test individual jobs manually:

```bash
# Daily aggregation
gcloud scheduler jobs run marketplace-daily-aggregation --location=us-central1

# Or with curl (dev mode)
curl -X POST https://voiceai-ui-johnb-2025.a.run.app/api/jobs/marketplace-daily-aggregation \
  -H "X-Dev-Trigger: true" \
  -H "Content-Type: application/json"
```

## Monitoring

View job status:

```bash
# List all jobs
gcloud scheduler jobs list --location=us-central1

# View job details
gcloud scheduler jobs describe marketplace-daily-aggregation --location=us-central1

# View execution history (via Cloud Logging)
gcloud logging read 'resource.type="cloud_scheduler_job"' --limit=10
```

## Authentication

Jobs are authenticated via:

1. **X-CloudScheduler header**: Set to `true` by Cloud Scheduler
2. **X-AppEngine-Cron header**: Alternative for App Engine cron
3. **X-Dev-Trigger header**: For local development testing only

The handler validates these headers in `src/api/scheduled-jobs-handler.ts:isCloudScheduler()`.

## Firestore Collections

The billing jobs interact with these Firestore collections:

| Collection | Purpose |
|------------|---------|
| `marketplace_installations` | User tool/agent installations |
| `marketplace_purchases` | Purchase records |
| `marketplace_payouts` | Publisher payout records |
| `marketplace_publishers` | Publisher profiles with Stripe Connect IDs |

## Environment Variables

Required secrets in Cloud Run:

| Secret | Description |
|--------|-------------|
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET_MARKETPLACE` | Webhook signing secret |
