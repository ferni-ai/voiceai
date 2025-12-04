#!/bin/bash
# ============================================================================
# FERNI FULL DEPLOYMENT SCRIPT
# Deploys all services to Google Cloud Platform
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# Banner
echo ""
echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${BOLD}FERNI DEPLOYMENT${NC}                                           ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  From Soup to Nuts: Design → Build → Deploy                 ${CYAN}║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Configuration - Using existing johnb-2025 project
export GCP_PROJECT_ID="${GCP_PROJECT_ID:-johnb-2025}"
export GCP_REGION="${GCP_REGION:-us-central1}"

# Service names (matching existing deployed services)
AGENT_SERVICE_NAME="${AGENT_SERVICE_NAME:-voiceai-agent}"
UI_SERVICE_NAME="${UI_SERVICE_NAME:-john-bogle-ui}"
PERSONA_ID="${PERSONA_ID:-ferni}"

# Parse arguments
DEPLOY_AGENT=false
DEPLOY_UI=false
DEPLOY_LANDING=false
DEPLOY_ALL=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --agent)
      DEPLOY_AGENT=true
      shift
      ;;
    --ui)
      DEPLOY_UI=true
      shift
      ;;
    --landing)
      DEPLOY_LANDING=true
      shift
      ;;
    --all)
      DEPLOY_ALL=true
      shift
      ;;
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --agent       Deploy voice agent only"
      echo "  --ui          Deploy frontend app only"
      echo "  --landing     Deploy landing page only"
      echo "  --all         Deploy everything"
      echo "  --skip-build  Skip local build steps"
      echo "  --help        Show this help"
      echo ""
      echo "Environment variables:"
      echo "  GCP_PROJECT_ID  Google Cloud project (default: johnb-2025)"
      echo "  GCP_REGION      Deployment region (default: us-central1)"
      echo ""
      exit 0
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# Default to all if nothing specified
if ! $DEPLOY_AGENT && ! $DEPLOY_UI && ! $DEPLOY_LANDING; then
  DEPLOY_ALL=true
fi

if $DEPLOY_ALL; then
  DEPLOY_AGENT=true
  DEPLOY_UI=true
  DEPLOY_LANDING=true
fi

# Show configuration
echo -e "${BOLD}Configuration:${NC}"
echo "  Project:  $GCP_PROJECT_ID"
echo "  Region:   $GCP_REGION"
echo ""
echo -e "${BOLD}Deploying:${NC}"
$DEPLOY_AGENT && echo "  ✓ Voice Agent"
$DEPLOY_UI && echo "  ✓ Frontend App"
$DEPLOY_LANDING && echo "  ✓ Landing Page"
echo ""

# Confirm
read -p "Continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Aborted."
  exit 1
fi

# ============================================================================
# PREFLIGHT CHECKS
# ============================================================================

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}PREFLIGHT CHECKS${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Check gcloud
echo -n "Checking gcloud CLI... "
if command -v gcloud &> /dev/null; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  echo "Install from: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

# Check authentication
echo -n "Checking GCP authentication... "
if gcloud auth list --filter=status:ACTIVE --format="value(account)" &>/dev/null; then
  ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null | head -1)
  echo -e "${GREEN}✓${NC} ($ACCOUNT)"
else
  echo -e "${RED}✗${NC}"
  echo "Run: gcloud auth login"
  exit 1
fi

# Set project
gcloud config set project $GCP_PROJECT_ID --quiet

# Check required secrets (you already have these configured!)
echo ""
echo "Checking secrets..."
REQUIRED_SECRETS="google-api-key cartesia-api-key livekit-url livekit-api-key livekit-api-secret"
OPTIONAL_SECRETS="alpha-vantage-key finnhub-api-key sendgrid-api-key spotify-client-id twilio-account-sid"

echo "Required:"
for SECRET in $REQUIRED_SECRETS; do
  echo -n "  $SECRET: "
  if gcloud secrets describe $SECRET &>/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
  else
    echo -e "${RED}✗ MISSING${NC}"
  fi
done

echo ""
echo "Optional (already configured):"
for SECRET in $OPTIONAL_SECRETS; do
  echo -n "  $SECRET: "
  if gcloud secrets describe $SECRET &>/dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
  else
    echo -e "${YELLOW}○ not configured${NC}"
  fi
done

# ============================================================================
# DEPLOY VOICE AGENT
# ============================================================================

if $DEPLOY_AGENT; then
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}DEPLOYING VOICE AGENT ($AGENT_SERVICE_NAME)${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # Build using existing cloudbuild.yaml
  echo ""
  echo "Building container image..."
  gcloud builds submit --config cloudbuild.yaml . --quiet
  
  # Build secrets string - include all your configured secrets
  SECRETS_ARG="GOOGLE_API_KEY=google-api-key:latest"
  SECRETS_ARG="$SECRETS_ARG,CARTESIA_API_KEY=cartesia-api-key:latest"
  SECRETS_ARG="$SECRETS_ARG,LIVEKIT_URL=livekit-url:latest"
  SECRETS_ARG="$SECRETS_ARG,LIVEKIT_API_KEY=livekit-api-key:latest"
  SECRETS_ARG="$SECRETS_ARG,LIVEKIT_API_SECRET=livekit-api-secret:latest"
  
  # Add optional secrets if they exist
  if gcloud secrets describe alpha-vantage-key &>/dev/null 2>&1; then
    SECRETS_ARG="$SECRETS_ARG,ALPHA_VANTAGE_API_KEY=alpha-vantage-key:latest"
  fi
  if gcloud secrets describe finnhub-api-key &>/dev/null 2>&1; then
    SECRETS_ARG="$SECRETS_ARG,FINNHUB_API_KEY=finnhub-api-key:latest"
  fi
  if gcloud secrets describe sendgrid-api-key &>/dev/null 2>&1; then
    SECRETS_ARG="$SECRETS_ARG,SENDGRID_API_KEY=sendgrid-api-key:latest"
  fi
  if gcloud secrets describe spotify-client-id &>/dev/null 2>&1; then
    SECRETS_ARG="$SECRETS_ARG,SPOTIFY_CLIENT_ID=spotify-client-id:latest"
    SECRETS_ARG="$SECRETS_ARG,SPOTIFY_CLIENT_SECRET=spotify-client-secret:latest"
  fi
  if gcloud secrets describe twilio-account-sid &>/dev/null 2>&1; then
    SECRETS_ARG="$SECRETS_ARG,TWILIO_ACCOUNT_SID=twilio-account-sid:latest"
    SECRETS_ARG="$SECRETS_ARG,TWILIO_AUTH_TOKEN=twilio-auth-token:latest"
  fi
  
  # Deploy to Cloud Run
  echo ""
  echo "Deploying to Cloud Run..."
  gcloud run deploy $AGENT_SERVICE_NAME \
    --image gcr.io/$GCP_PROJECT_ID/bogle-voice-agent:latest \
    --region $GCP_REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 2Gi \
    --cpu 2 \
    --timeout 3600 \
    --concurrency 1 \
    --min-instances 0 \
    --max-instances 20 \
    --set-env-vars "NODE_ENV=production,PERSONA_ID=$PERSONA_ID,GOOGLE_CLOUD_PROJECT=$GCP_PROJECT_ID" \
    --set-secrets "$SECRETS_ARG" \
    --quiet
  
  AGENT_URL=$(gcloud run services describe $AGENT_SERVICE_NAME --region $GCP_REGION --format 'value(status.url)')
  echo ""
  echo -e "${GREEN}✓ Voice Agent deployed:${NC} $AGENT_URL"
fi

# ============================================================================
# DEPLOY FRONTEND APP
# ============================================================================

if $DEPLOY_UI; then
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}DEPLOYING FRONTEND APP ($UI_SERVICE_NAME)${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # Build using existing cloudbuild-ui.yaml
  echo ""
  echo "Building container image..."
  gcloud builds submit --config cloudbuild-ui.yaml . --quiet
  
  # Deploy to Cloud Run
  echo ""
  echo "Deploying to Cloud Run..."
  gcloud run deploy $UI_SERVICE_NAME \
    --image gcr.io/$GCP_PROJECT_ID/$UI_SERVICE_NAME:latest \
    --region $GCP_REGION \
    --platform managed \
    --allow-unauthenticated \
    --memory 512Mi \
    --cpu 1 \
    --timeout 300 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production" \
    --set-secrets "LIVEKIT_URL=livekit-url:latest,LIVEKIT_API_KEY=livekit-api-key:latest,LIVEKIT_API_SECRET=livekit-api-secret:latest" \
    --quiet
  
  UI_URL=$(gcloud run services describe $UI_SERVICE_NAME --region $GCP_REGION --format 'value(status.url)')
  echo ""
  echo -e "${GREEN}✓ Frontend App deployed:${NC} $UI_URL"
fi

# ============================================================================
# DEPLOY LANDING PAGE
# ============================================================================

if $DEPLOY_LANDING; then
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}DEPLOYING LANDING PAGE${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  
  # Check if Firebase is configured
  if [ -f "promo/ferni-website/firebase.json" ] || command -v firebase &> /dev/null; then
    echo ""
    echo "Deploying via Firebase Hosting..."
    cd promo/ferni-website
    
    if [ ! -f "firebase.json" ]; then
      echo "Creating firebase.json..."
      cat > firebase.json << EOF
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ]
  }
}
EOF
    fi
    
    firebase deploy --only hosting --project $GCP_PROJECT_ID
    cd "$PROJECT_DIR"
    
    echo ""
    echo -e "${GREEN}✓ Landing Page deployed via Firebase${NC}"
  else
    # Fall back to Cloud Storage
    BUCKET_NAME="ferni-landing-$GCP_PROJECT_ID"
    
    echo ""
    echo "Deploying via Cloud Storage..."
    
    # Create bucket if needed
    if ! gsutil ls gs://$BUCKET_NAME &>/dev/null 2>&1; then
      echo "Creating bucket..."
      gsutil mb -l $GCP_REGION gs://$BUCKET_NAME
      gsutil web set -m index.html gs://$BUCKET_NAME
      gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
    fi
    
    # Upload files
    echo "Uploading files..."
    gsutil -m cp -r promo/ferni-website/* gs://$BUCKET_NAME/
    
    echo ""
    echo -e "${GREEN}✓ Landing Page deployed:${NC} https://storage.googleapis.com/$BUCKET_NAME/index.html"
  fi
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}DEPLOYMENT COMPLETE${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

if $DEPLOY_AGENT; then
  echo -e "  ${GREEN}✓${NC} Voice Agent:  ${AGENT_URL:-deployed}"
fi

if $DEPLOY_UI; then
  echo -e "  ${GREEN}✓${NC} Frontend App: ${UI_URL:-deployed}"
fi

if $DEPLOY_LANDING; then
  echo -e "  ${GREEN}✓${NC} Landing Page: deployed"
fi

echo ""
echo -e "${BOLD}Next Steps:${NC}"
echo "  1. Configure LiveKit agent URL in LiveKit Cloud dashboard"
echo "  2. Set up custom domain DNS if needed"
echo "  3. Test the deployment:"
echo "     curl \$SERVICE_URL/health"
echo ""
echo "View logs:"
echo "  gcloud run services logs read SERVICE_NAME --region $GCP_REGION"
echo ""

