#!/usr/bin/env bash
# Upload secrets from .env to Google Cloud Secret Manager
# Run: bash scripts/upload-secrets-gcp.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║     Upload Secrets to Google Cloud                 ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════╝${NC}"
echo ""

# Check for gcloud
if ! command -v gcloud &> /dev/null; then
  echo -e "${RED}❌ gcloud CLI required. Install from: https://cloud.google.com/sdk/docs/install${NC}"
  exit 1
fi

# Check for .env file
if [ ! -f .env ]; then
  echo -e "${RED}❌ .env file not found${NC}"
  exit 1
fi

# Get project ID
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
if [ -z "$PROJECT_ID" ]; then
  echo -e "${YELLOW}No project set. Enter your GCP project ID:${NC}"
  read PROJECT_ID
  gcloud config set project $PROJECT_ID
fi

echo -e "Project: ${GREEN}$PROJECT_ID${NC}"
echo ""

# Enable Secret Manager API
echo "Enabling Secret Manager API..."
gcloud services enable secretmanager.googleapis.com --quiet 2>/dev/null || true

# Function to get GCP secret name from env var name
get_secret_name() {
  local key=$1
  case $key in
    LIVEKIT_URL) echo "livekit-url" ;;
    LIVEKIT_API_KEY) echo "livekit-api-key" ;;
    LIVEKIT_API_SECRET) echo "livekit-api-secret" ;;
    GOOGLE_API_KEY) echo "google-api-key" ;;
    CARTESIA_API_KEY) echo "cartesia-api-key" ;;
    ALPHA_VANTAGE_API_KEY) echo "alpha-vantage-key" ;;
    FINNHUB_API_KEY) echo "finnhub-api-key" ;;
    TWILIO_ACCOUNT_SID) echo "twilio-account-sid" ;;
    TWILIO_AUTH_TOKEN) echo "twilio-auth-token" ;;
    TWILIO_PHONE_NUMBER) echo "twilio-phone-number" ;;
    SENDGRID_API_KEY) echo "sendgrid-api-key" ;;
    SENDGRID_FROM_EMAIL) echo "sendgrid-from-email" ;;
    SPOTIFY_CLIENT_ID) echo "spotify-client-id" ;;
    SPOTIFY_CLIENT_SECRET) echo "spotify-client-secret" ;;
    SPOTIFY_REFRESH_TOKEN) echo "spotify-refresh-token" ;;
    SPOTIFY_REDIRECT_URI) echo "spotify-redirect-uri" ;;
    PLAID_CLIENT_ID) echo "plaid-client-id" ;;
    PLAID_SECRET) echo "plaid-secret" ;;
    PLAID_ENV) echo "plaid-env" ;;
    DATABASE_URL) echo "database-url" ;;
    REDIS_URL) echo "redis-url" ;;
    JACK_BOGLE_VOICE_ID) echo "jack-bogle-voice-id" ;;
    PETER_LYNCH_VOICE_ID) echo "peter-lynch-voice-id" ;;
    *) echo "" ;;
  esac
}

# Function to create or update a secret
create_secret() {
  local secret_name=$1
  local secret_value=$2
  
  if [ -z "$secret_value" ]; then
    return
  fi
  
  # Check if secret exists
  if gcloud secrets describe "$secret_name" &>/dev/null 2>&1; then
    # Update existing secret with new version
    echo -n "$secret_value" | gcloud secrets versions add "$secret_name" --data-file=- --quiet 2>/dev/null
    echo -e "  ${GREEN}✓ Updated${NC} $secret_name"
  else
    # Create new secret
    echo -n "$secret_value" | gcloud secrets create "$secret_name" --data-file=- --quiet 2>/dev/null
    echo -e "  ${GREEN}✓ Created${NC} $secret_name"
  fi
}

echo "Uploading secrets from .env..."
echo ""

# Read .env and create secrets
created=0

while IFS= read -r line || [ -n "$line" ]; do
  # Skip comments and empty lines
  [[ "$line" =~ ^#.*$ ]] && continue
  [[ -z "$line" ]] && continue
  [[ ! "$line" =~ = ]] && continue
  
  # Extract key and value
  key="${line%%=*}"
  value="${line#*=}"
  
  # Remove quotes from value
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  
  # Get the GCP secret name
  secret_name=$(get_secret_name "$key")
  
  if [ -n "$secret_name" ] && [ -n "$value" ]; then
    create_secret "$secret_name" "$value"
    ((created++)) || true
  fi
done < .env

echo ""
echo -e "${GREEN}✅ Uploaded $created secrets to $PROJECT_ID${NC}"
echo ""

# Grant Cloud Run access
echo "Granting Cloud Run service account access..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)' 2>/dev/null)

if [ -n "$PROJECT_NUMBER" ]; then
  SERVICE_ACCOUNT="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
  
  # Get list of created secrets
  for secret_name in $(gcloud secrets list --format='value(name)' 2>/dev/null); do
    gcloud secrets add-iam-policy-binding "$secret_name" \
      --member="serviceAccount:$SERVICE_ACCOUNT" \
      --role="roles/secretmanager.secretAccessor" \
      --quiet 2>/dev/null || true
  done
  
  echo -e "${GREEN}✓ Access granted to Cloud Run service account${NC}"
fi

echo ""
echo -e "${CYAN}━━━ Done! ━━━${NC}"
echo ""
echo "View secrets:  gcloud secrets list"
echo "Deploy agent:  ./scripts/deploy-gcp.sh"
echo ""
