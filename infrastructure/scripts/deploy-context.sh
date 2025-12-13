#!/bin/bash
# ============================================================================
# DEPLOY FERNI CONTEXT SERVICE
# Builds and deploys the Context microservice to Cloud Run
# ============================================================================

set -e

PROJECT_ID="${PROJECT_ID:-johnb-2025}"
REGION="${REGION:-us-central1}"
IMAGE_NAME="gcr.io/${PROJECT_ID}/ferni-context"
TAG="${TAG:-latest}"

echo "🚀 Deploying Ferni Context Service"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo "   Image: ${IMAGE_NAME}:${TAG}"

# Build the context service image
echo ""
echo "📦 Building Context Service image..."
cd "$(dirname "$0")/../.."

docker build \
  -f infrastructure/docker/Dockerfile.context \
  -t "${IMAGE_NAME}:${TAG}" \
  .

# Push to GCR
echo ""
echo "📤 Pushing to Container Registry..."
docker push "${IMAGE_NAME}:${TAG}"

# Deploy Context Service
echo ""
echo "🧠 Deploying Context Service..."
gcloud run deploy ferni-context \
  --image "${IMAGE_NAME}:${TAG}" \
  --platform managed \
  --region "${REGION}" \
  --project "${PROJECT_ID}" \
  --memory 1Gi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 20 \
  --set-env-vars "GOOGLE_CLOUD_PROJECT=${PROJECT_ID}" \
  --service-account "ferni-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --allow-unauthenticated

echo ""
echo "✅ Context Service deployed successfully!"
echo ""
echo "Service URL:"
gcloud run services describe ferni-context --region "${REGION}" --format 'value(status.url)'

