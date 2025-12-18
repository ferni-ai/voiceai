#!/bin/bash
#
# Setup GCP Pub/Sub Infrastructure for Ferni
#
# This script sets up all required GCP resources for the Pub/Sub-based
# scaling architecture.
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - Appropriate IAM permissions (Pub/Sub Admin, Cloud Run Admin)
#
# Usage: ./scripts/setup-pubsub-infrastructure.sh [--dry-run]
#

set -e

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-ferni-prod}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
TOPIC_PREFIX="${PUBSUB_PREFIX:-ferni}"
DRY_RUN=false

# Parse arguments
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "🔍 DRY RUN MODE - No changes will be made"
fi

echo "=============================================="
echo "   Ferni Pub/Sub Infrastructure Setup"
echo "=============================================="
echo ""
echo "Project: ${PROJECT_ID}"
echo "Region: ${REGION}"
echo "Topic Prefix: ${TOPIC_PREFIX}"
echo ""

# Function to run or print command
run_cmd() {
  if [ "$DRY_RUN" = true ]; then
    echo "[DRY RUN] $*"
  else
    eval "$@"
  fi
}

# Step 1: Enable required APIs
echo "📡 Step 1: Enabling required GCP APIs..."
APIS=(
  "pubsub.googleapis.com"
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
  "containerregistry.googleapis.com"
  "cloudmonitoring.googleapis.com"
  "cloudtrace.googleapis.com"
)

for api in "${APIS[@]}"; do
  echo "  Enabling $api..."
  run_cmd "gcloud services enable $api --project=$PROJECT_ID --quiet"
done
echo "✅ APIs enabled"
echo ""

# Step 2: Create Pub/Sub Topics
echo "📬 Step 2: Creating Pub/Sub topics..."
TOPICS=(
  "${TOPIC_PREFIX}-embeddings"
  "${TOPIC_PREFIX}-summaries"
  "${TOPIC_PREFIX}-analytics"
  "${TOPIC_PREFIX}-audio"
  "${TOPIC_PREFIX}-trust-updates"
  "${TOPIC_PREFIX}-context-warmup"
  "${TOPIC_PREFIX}-memory-consolidation"
  "${TOPIC_PREFIX}-notifications"
)

for topic in "${TOPICS[@]}"; do
  if gcloud pubsub topics describe "$topic" --project="$PROJECT_ID" &>/dev/null; then
    echo "  ✓ Topic exists: $topic"
  else
    echo "  Creating topic: $topic"
    run_cmd "gcloud pubsub topics create $topic --project=$PROJECT_ID"
  fi
done
echo "✅ Topics created"
echo ""

# Step 3: Create Dead Letter Topics
echo "📭 Step 3: Creating dead letter topics..."
DL_TOPICS=(
  "${TOPIC_PREFIX}-embeddings-dlq"
  "${TOPIC_PREFIX}-summaries-dlq"
  "${TOPIC_PREFIX}-audio-dlq"
  "${TOPIC_PREFIX}-notifications-dlq"
)

for topic in "${DL_TOPICS[@]}"; do
  if gcloud pubsub topics describe "$topic" --project="$PROJECT_ID" &>/dev/null; then
    echo "  ✓ DLQ exists: $topic"
  else
    echo "  Creating DLQ: $topic"
    run_cmd "gcloud pubsub topics create $topic --project=$PROJECT_ID"
  fi
done
echo "✅ Dead letter topics created"
echo ""

# Step 4: Create Service Account for Workers
echo "👤 Step 4: Setting up service account..."
SA_NAME="ferni-pubsub-worker"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "  ✓ Service account exists: $SA_EMAIL"
else
  echo "  Creating service account: $SA_NAME"
  run_cmd "gcloud iam service-accounts create $SA_NAME \
    --project=$PROJECT_ID \
    --display-name='Ferni Pub/Sub Worker'"
fi

# Grant required roles
ROLES=(
  "roles/pubsub.subscriber"
  "roles/pubsub.publisher"
  "roles/datastore.user"
  "roles/firebase.admin"
  "roles/cloudtrace.agent"
  "roles/monitoring.metricWriter"
)

echo "  Granting IAM roles..."
for role in "${ROLES[@]}"; do
  run_cmd "gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member=serviceAccount:$SA_EMAIL \
    --role=$role \
    --quiet" || true
done
echo "✅ Service account configured"
echo ""

# Step 5: Create Cloud Monitoring Alert Policies
echo "🔔 Step 5: Setting up monitoring alerts..."

# Alert: High message backlog
ALERT_BACKLOG=$(cat <<EOF
{
  "displayName": "Ferni Pub/Sub - High Message Backlog",
  "conditions": [{
    "displayName": "Unacked messages > 1000",
    "conditionThreshold": {
      "filter": "resource.type=\"pubsub_subscription\" AND metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 1000,
      "duration": "300s",
      "aggregations": [{
        "alignmentPeriod": "60s",
        "perSeriesAligner": "ALIGN_MEAN"
      }]
    }
  }],
  "alertStrategy": {
    "autoClose": "604800s"
  },
  "combiner": "OR",
  "enabled": true
}
EOF
)

# Alert: Worker errors
ALERT_ERRORS=$(cat <<EOF
{
  "displayName": "Ferni Worker - High Error Rate",
  "conditions": [{
    "displayName": "Error rate > 5%",
    "conditionThreshold": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"ferni-worker\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class!=\"2xx\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0.05,
      "duration": "300s",
      "aggregations": [{
        "alignmentPeriod": "60s",
        "perSeriesAligner": "ALIGN_RATE"
      }]
    }
  }],
  "alertStrategy": {
    "autoClose": "604800s"
  },
  "combiner": "OR",
  "enabled": true
}
EOF
)

echo "  Alert policies will be created via Cloud Console or Terraform"
echo "  (Alerting API requires additional setup)"
echo "✅ Monitoring configured"
echo ""

# Step 6: Output summary
echo "=============================================="
echo "   Setup Complete!"
echo "=============================================="
echo ""
echo "Next steps:"
echo ""
echo "1. Deploy the worker service:"
echo "   ./scripts/deploy-worker.sh"
echo ""
echo "2. Enable Pub/Sub in your voice agent:"
echo "   export PUBSUB_ENABLED=true"
echo ""
echo "3. Verify subscriptions:"
echo "   gcloud pubsub subscriptions list --project=$PROJECT_ID"
echo ""
echo "4. Monitor in Cloud Console:"
echo "   https://console.cloud.google.com/cloudpubsub?project=$PROJECT_ID"
echo ""

# Output environment variables to set
echo "=============================================="
echo "   Environment Variables"
echo "=============================================="
cat <<EOF

Add these to your Cloud Run service:

PUBSUB_ENABLED=true
GOOGLE_CLOUD_PROJECT=${PROJECT_ID}
PUBSUB_PREFIX=${TOPIC_PREFIX}

EOF

