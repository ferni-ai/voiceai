#!/bin/bash
#
# Deploy Ferni Pub/Sub Worker to Cloud Run
#
# Usage: ./scripts/deploy-worker.sh
#
# This script:
# 1. Builds the worker Docker image
# 2. Pushes to Google Container Registry
# 3. Deploys to Cloud Run
# 4. Creates/updates Pub/Sub subscriptions
#

set -e

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-ferni-prod}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
SERVICE_NAME="ferni-worker"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🔨 Building Pub/Sub Worker..."
docker build -f Dockerfile.worker -t "${IMAGE_NAME}:latest" .

echo "📤 Pushing to Container Registry..."
docker push "${IMAGE_NAME}:latest"

echo "🚀 Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_NAME}:latest" \
  --region "${REGION}" \
  --platform managed \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 100 \
  --timeout 300 \
  --concurrency 80 \
  --set-env-vars "NODE_ENV=production,PUBSUB_ENABLED=true" \
  --allow-unauthenticated \
  --quiet

# Get the service URL
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region "${REGION}" \
  --format 'value(status.url)')

echo "📬 Setting up Pub/Sub subscriptions..."

# Topics to create subscriptions for
TOPICS=(
  "ferni-embeddings"
  "ferni-summaries"
  "ferni-analytics"
  "ferni-audio"
  "ferni-trust-updates"
  "ferni-context-warmup"
  "ferni-memory-consolidation"
)

for TOPIC in "${TOPICS[@]}"; do
  SUB_NAME="${TOPIC}-worker-sub"
  
  # Check if topic exists, create if not
  if ! gcloud pubsub topics describe "${TOPIC}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "  Creating topic: ${TOPIC}"
    gcloud pubsub topics create "${TOPIC}" --project="${PROJECT_ID}"
  fi
  
  # Check if subscription exists
  if gcloud pubsub subscriptions describe "${SUB_NAME}" --project="${PROJECT_ID}" &>/dev/null; then
    echo "  Updating subscription: ${SUB_NAME}"
    gcloud pubsub subscriptions update "${SUB_NAME}" \
      --project="${PROJECT_ID}" \
      --push-endpoint="${SERVICE_URL}/pubsub" \
      --ack-deadline=60
  else
    echo "  Creating subscription: ${SUB_NAME}"
    gcloud pubsub subscriptions create "${SUB_NAME}" \
      --project="${PROJECT_ID}" \
      --topic="${TOPIC}" \
      --push-endpoint="${SERVICE_URL}/pubsub" \
      --ack-deadline=60 \
      --message-retention-duration=1d \
      --min-retry-delay=10s \
      --max-retry-delay=600s
  fi
done

echo ""
echo "✅ Pub/Sub Worker deployed successfully!"
echo ""
echo "Service URL: ${SERVICE_URL}"
echo "Health check: curl ${SERVICE_URL}/health"
echo ""
echo "Topics configured:"
for TOPIC in "${TOPICS[@]}"; do
  echo "  - ${TOPIC}"
done

