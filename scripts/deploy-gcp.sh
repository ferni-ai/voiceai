#!/bin/bash
# Google Cloud Deployment Script
# Run: ./scripts/deploy-gcp.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🚀 Deploying Voice AI to Google Cloud...${NC}"
echo ""

# Check for gcloud
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}❌ gcloud CLI is required. Install from: https://cloud.google.com/sdk/docs/install${NC}"
  exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo -e "${YELLOW}No project set. Please enter your GCP project ID:${NC}"
  read PROJECT_ID
  gcloud config set project $PROJECT_ID
fi

echo -e "${GREEN}Project: $PROJECT_ID${NC}"
echo ""

# Configuration
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="${GCP_SERVICE_NAME:-voiceai-agent}"
PERSONA_ID="${PERSONA_ID:-jack-bogle}"

echo "Configuration:"
echo "  Region: $REGION"
echo "  Service: $SERVICE_NAME"
echo "  Persona: $PERSONA_ID"
echo ""

# Check for required secrets
echo "Checking secrets..."
REQUIRED_SECRETS="google-api-key cartesia-api-key livekit-url livekit-api-key livekit-api-secret"
MISSING_SECRETS=""

for SECRET in $REQUIRED_SECRETS; do
  if ! gcloud secrets describe $SECRET &>/dev/null; then
    MISSING_SECRETS="$MISSING_SECRETS $SECRET"
  else
    echo -e "  ${GREEN}✓ $SECRET${NC}"
  fi
done

if [ ! -z "$MISSING_SECRETS" ]; then
  echo ""
  echo -e "${RED}Missing secrets:$MISSING_SECRETS${NC}"
  echo ""
  echo "Create them with:"
  echo '  echo -n "YOUR_VALUE" | gcloud secrets create SECRET_NAME --data-file=-'
  echo ""
  exit 1
fi

# Check for optional secrets
OPTIONAL_SECRETS="redis-url alpha-vantage-key"
echo ""
echo "Optional secrets:"
for SECRET in $OPTIONAL_SECRETS; do
  if gcloud secrets describe $SECRET &>/dev/null 2>&1; then
    echo -e "  ${GREEN}✓ $SECRET${NC}"
  else
    echo -e "  ${YELLOW}○ $SECRET (not configured)${NC}"
  fi
done

# Build secrets string
SECRETS_ARG="GOOGLE_API_KEY=google-api-key:latest"
SECRETS_ARG="$SECRETS_ARG,CARTESIA_API_KEY=cartesia-api-key:latest"
SECRETS_ARG="$SECRETS_ARG,LIVEKIT_URL=livekit-url:latest"
SECRETS_ARG="$SECRETS_ARG,LIVEKIT_API_KEY=livekit-api-key:latest"
SECRETS_ARG="$SECRETS_ARG,LIVEKIT_API_SECRET=livekit-api-secret:latest"

if gcloud secrets describe redis-url &>/dev/null 2>&1; then
  SECRETS_ARG="$SECRETS_ARG,REDIS_URL=redis-url:latest"
fi

if gcloud secrets describe alpha-vantage-key &>/dev/null 2>&1; then
  SECRETS_ARG="$SECRETS_ARG,ALPHA_VANTAGE_API_KEY=alpha-vantage-key:latest"
fi

# Enable required APIs
echo ""
echo "Enabling required APIs..."
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  firestore.googleapis.com \
  secretmanager.googleapis.com \
  --quiet

# Check for Firestore database
echo ""
echo "Checking Firestore..."
if ! gcloud firestore databases describe --format="value(name)" 2>/dev/null | grep -q "default"; then
  echo "Creating Firestore database..."
  gcloud firestore databases create --location=$REGION --type=firestore-native --quiet || true
fi
echo -e "${GREEN}✓ Firestore ready${NC}"

# Build the container
echo ""
echo "Building container..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/$SERVICE_NAME:latest . --quiet

# Check for VPC connector (needed for Redis)
VPC_CONNECTOR=""
if gcloud secrets describe redis-url &>/dev/null 2>&1; then
  CONNECTOR_NAME="voiceai-connector"
  if gcloud compute networks vpc-access connectors describe $CONNECTOR_NAME --region=$REGION &>/dev/null 2>&1; then
    VPC_CONNECTOR="--vpc-connector=$CONNECTOR_NAME"
    echo -e "${GREEN}✓ VPC connector found${NC}"
  else
    echo -e "${YELLOW}⚠️  Redis configured but no VPC connector. Redis will not work.${NC}"
    echo "Create one with: gcloud compute networks vpc-access connectors create $CONNECTOR_NAME --region=$REGION --network=default --range=10.8.0.0/28"
  fi
fi

# Deploy to Cloud Run
echo ""
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$SERVICE_NAME:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 20 \
  --set-env-vars "NODE_ENV=production,PERSONA_ID=$PERSONA_ID,GOOGLE_CLOUD_PROJECT=$PROJECT_ID" \
  --set-secrets "$SECRETS_ARG" \
  $VPC_CONNECTOR \
  --quiet

# Get service URL
echo ""
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Service URL: $SERVICE_URL"
echo ""
echo "Configure this URL in your LiveKit agent settings."
echo ""
echo "View logs:"
echo "  gcloud run services logs read $SERVICE_NAME --region $REGION --limit 50"
echo ""

