#!/bin/bash
# Deploy the Evolution Scheduler Cloud Function
# This function runs daily to make all personas smarter

set -e

echo "🚀 Deploying Evolution Scheduler..."

PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

cd "$(dirname "$0")/../functions"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# Create Pub/Sub topic if it doesn't exist
echo "📬 Creating Pub/Sub topic..."
gcloud pubsub topics create evolution-trigger --project=$PROJECT_ID 2>/dev/null || echo "Topic already exists"

# Deploy the function (Gen 1 for faster deployment)
echo "☁️ Deploying Cloud Function..."
gcloud functions deploy evolutionScheduler \
  --runtime=nodejs20 \
  --trigger-topic=evolution-trigger \
  --entry-point=evolutionScheduler \
  --timeout=540s \
  --memory=1GB \
  --region=$REGION \
  --project=$PROJECT_ID \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --quiet

# Deploy HTTP trigger version (for manual runs)
echo "☁️ Deploying HTTP-triggered version..."
gcloud functions deploy evolutionSchedulerHttp \
  --runtime=nodejs20 \
  --trigger-http \
  --entry-point=evolutionSchedulerHttp \
  --timeout=540s \
  --memory=1GB \
  --region=$REGION \
  --project=$PROJECT_ID \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --quiet

# Create Cloud Scheduler job (runs daily at 3am ET)
echo "⏰ Creating Cloud Scheduler job..."
gcloud scheduler jobs delete daily-evolution --location=$REGION --quiet 2>/dev/null || true
gcloud scheduler jobs create pubsub daily-evolution \
  --schedule="0 3 * * *" \
  --topic=evolution-trigger \
  --message-body="{}" \
  --time-zone="America/New_York" \
  --location=$REGION \
  --project=$PROJECT_ID

echo ""
echo "✅ Evolution Scheduler deployed successfully!"
echo ""
echo "📊 The system will now automatically:"
echo "   • Run daily at 3:00 AM ET"
echo "   • Process learning signals from all conversations"
echo "   • Recompute community patterns"
echo "   • Update persona adjustments"
echo "   • Make all personas smarter over time"
echo ""
echo "🔧 Manual trigger:"
echo "   curl -X POST https://$REGION-$PROJECT_ID.cloudfunctions.net/evolutionSchedulerHttp"
echo ""

