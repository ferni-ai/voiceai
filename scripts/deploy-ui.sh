#!/bin/bash
set -e

export PATH="/opt/homebrew/share/google-cloud-sdk/bin:$PATH"
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-johnb-2025}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="john-bogle-ui"
IMAGE_NAME="gcr.io/$GCP_PROJECT_ID/$SERVICE_NAME"

echo "🌐 Deploying John Bogle UI to Google Cloud Run"
echo "   Project: $GCP_PROJECT_ID"
echo "   Region: $REGION"
echo ""

# Build the image using cloudbuild-ui.yaml
echo "🏗️  Building Docker image..."
gcloud builds submit --config cloudbuild-ui.yaml .

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
    --image $IMAGE_NAME:latest \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production" \
    --set-secrets "LIVEKIT_URL=livekit-url:latest,LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest"

echo ""
echo "✅ UI deployed!"
echo ""
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)' 2>/dev/null || echo "")
echo "🌐 UI URL: $SERVICE_URL"
