#!/bin/bash
# ============================================================================
# DEPLOY FERNI WORKERS
# Builds and deploys background workers to Cloud Run
# ============================================================================

set -e

PROJECT_ID="${PROJECT_ID:-johnb-2025}"
REGION="${REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/ferni-worker"
TAG="${TAG:-latest}"

echo "🚀 Deploying Ferni Workers"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Image: ${IMAGE_NAME}:${TAG}"

# Build the worker image
echo ""
echo "📦 Building worker image..."
cd "$(dirname "$0")/../.."

docker build \
  -f infrastructure/docker/Dockerfile.worker \
  -t "${IMAGE_NAME}:${TAG}" \
  .

# Push to GCR
echo ""
echo "📤 Pushing to Container Registry..."
docker push "${IMAGE_NAME}:${TAG}"

# Deploy Trust Worker
echo ""
echo "🔧 Deploying Trust Worker..."
gcloud run deploy ferni-trust-worker \
  --image "${IMAGE_NAME}:${TAG}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "WORKER_TYPE=trust,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --service-account "ferni-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --no-allow-unauthenticated

# Deploy Analytics Worker
echo ""
echo "📊 Deploying Analytics Worker..."
gcloud run deploy ferni-analytics-worker \
  --image "${IMAGE_NAME}:${TAG}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "WORKER_TYPE=analytics,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --service-account "ferni-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --no-allow-unauthenticated

echo ""
echo "✅ Workers deployed successfully!"
echo ""
echo "Service URLs:"
gcloud run services describe ferni-trust-worker --region "${REGION}" --format 'value(status.url)'
gcloud run services describe ferni-analytics-worker --region "${REGION}" --format 'value(status.url)'

