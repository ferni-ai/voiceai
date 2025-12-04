#!/bin/bash
# Deploy Joel Dickson to Google Cloud
# Run: ./scripts/deploy-joel.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}🎓 Deploying Joel Dickson to Google Cloud...${NC}"
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

# Configuration - Joel specific
REGION="${GCP_REGION:-us-central1}"
AGENT_SERVICE_NAME="joel-dickson-agent"
UI_SERVICE_NAME="joel-dickson-ui"
PERSONA_ID="joel-dickson"

echo "Configuration:"
echo "  Region: $REGION"
echo "  Agent Service: $AGENT_SERVICE_NAME"
echo "  UI Service: $UI_SERVICE_NAME"
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

# Build secrets string
SECRETS_ARG="GOOGLE_API_KEY=google-api-key:latest"
SECRETS_ARG="$SECRETS_ARG,CARTESIA_API_KEY=cartesia-api-key:latest"
SECRETS_ARG="$SECRETS_ARG,LIVEKIT_URL=livekit-url:latest"
SECRETS_ARG="$SECRETS_ARG,LIVEKIT_API_KEY=livekit-api-key:latest"
SECRETS_ARG="$SECRETS_ARG,LIVEKIT_API_SECRET=livekit-api-secret:latest"

# Add optional secrets if available
if gcloud secrets describe spotify-client-id &>/dev/null 2>&1; then
  SECRETS_ARG="$SECRETS_ARG,SPOTIFY_CLIENT_ID=spotify-client-id:latest"
fi
if gcloud secrets describe spotify-client-secret &>/dev/null 2>&1; then
  SECRETS_ARG="$SECRETS_ARG,SPOTIFY_CLIENT_SECRET=spotify-client-secret:latest"
fi
if gcloud secrets describe spotify-refresh-token &>/dev/null 2>&1; then
  SECRETS_ARG="$SECRETS_ARG,SPOTIFY_REFRESH_TOKEN=spotify-refresh-token:latest"
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

# ===================================
# DEPLOY AGENT
# ===================================
echo ""
echo -e "${CYAN}📦 Building Joel agent container...${NC}"
gcloud builds submit --tag gcr.io/$PROJECT_ID/$AGENT_SERVICE_NAME:latest . --quiet

echo ""
echo -e "${CYAN}🚀 Deploying Joel agent to Cloud Run...${NC}"
gcloud run deploy $AGENT_SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$AGENT_SERVICE_NAME:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 1 \
  --min-instances 0 \
  --max-instances 20 \
  --set-env-vars "NODE_ENV=production,PERSONA_ID=$PERSONA_ID,GOOGLE_CLOUD_PROJECT=$PROJECT_ID,MUSIC_ENABLED=true" \
  --set-secrets "$SECRETS_ARG" \
  --quiet

AGENT_URL=$(gcloud run services describe $AGENT_SERVICE_NAME --region $REGION --format 'value(status.url)')
echo -e "${GREEN}✓ Agent deployed: $AGENT_URL${NC}"

# ===================================
# DEPLOY UI (Landing Page + Token Server)
# ===================================
echo ""
echo -e "${CYAN}📦 Building Joel landing page + token server...${NC}"

# Build using the Joel UI cloudbuild config
gcloud builds submit --config cloudbuild-joel-ui.yaml . --quiet

echo ""
echo -e "${CYAN}🚀 Deploying Joel landing page + token server to Cloud Run...${NC}"

# UI secrets - token server needs LiveKit credentials
UI_SECRETS="LIVEKIT_URL=livekit-url:latest"
UI_SECRETS="$UI_SECRETS,LIVEKIT_API_KEY=livekit-api-key:latest"
UI_SECRETS="$UI_SECRETS,LIVEKIT_API_SECRET=livekit-api-secret:latest"

# Add Spotify secrets if available
if gcloud secrets describe spotify-client-id &>/dev/null 2>&1; then
  UI_SECRETS="$UI_SECRETS,SPOTIFY_CLIENT_ID=spotify-client-id:latest"
fi
if gcloud secrets describe spotify-client-secret &>/dev/null 2>&1; then
  UI_SECRETS="$UI_SECRETS,SPOTIFY_CLIENT_SECRET=spotify-client-secret:latest"
fi

gcloud run deploy $UI_SERVICE_NAME \
  --image gcr.io/$PROJECT_ID/$UI_SERVICE_NAME:latest \
  --region $REGION \
  --platform managed \
  --allow-unauthenticated \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production,AGENT_NAME=voice-agent,TOKEN_SERVER_PORT=8080" \
  --set-secrets "$UI_SECRETS" \
  --quiet

UI_URL=$(gcloud run services describe $UI_SERVICE_NAME --region $REGION --format 'value(status.url)')
echo -e "${GREEN}✓ UI deployed: $UI_URL${NC}"

# ===================================
# SUMMARY
# ===================================
echo ""
echo -e "${GREEN}✅ Joel Dickson deployment complete!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "  🎓 ${CYAN}Meet Joel:${NC} $UI_URL"
echo -e "  🤖 ${CYAN}Agent API:${NC} $AGENT_URL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "View logs:"
echo "  Agent: gcloud run services logs read $AGENT_SERVICE_NAME --region $REGION --limit 50"
echo "  UI:    gcloud run services logs read $UI_SERVICE_NAME --region $REGION --limit 50"
echo ""

