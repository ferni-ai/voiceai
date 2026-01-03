#!/bin/bash
# Setup Integration Secrets for "Better than Human" APIs
#
# This script creates GCP secrets for the new integrations.
# Run with: ./scripts/setup-integration-secrets.sh
#
# Prerequisites:
# - gcloud CLI authenticated
# - GCP project set to johnb-2025

set -e

PROJECT_ID="johnb-2025"
REGION="us-central1"

echo ""
echo "🔐 Setting up Integration Secrets"
echo "   Project: $PROJECT_ID"
echo ""

# Function to create or update a secret
create_secret() {
  local SECRET_NAME=$1
  local DESCRIPTION=$2
  
  # Check if secret exists
  if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "   ⏭️  $SECRET_NAME already exists"
  else
    echo "   ✅ Creating $SECRET_NAME"
    gcloud secrets create "$SECRET_NAME" \
      --project="$PROJECT_ID" \
      --replication-policy="automatic" \
      --labels="integration=better-than-human" 2>/dev/null || true
  fi
}

echo "📊 Research APIs (Peter)"
create_secret "alpha-vantage-key" "Alpha Vantage API key for market data"
create_secret "fred-api-key" "FRED API key for macro economics"

echo ""
echo "📧 Google Services (Gmail, Calendar, Maps)"
create_secret "google-client-id" "Google OAuth client ID"
create_secret "google-client-secret" "Google OAuth client secret"
create_secret "google-maps-api-key" "Google Maps API key for travel time"

echo ""
echo "🍽️ Restaurant Reservations (Jordan)"
create_secret "opentable-api-key" "OpenTable API key"
create_secret "resy-api-key" "Resy API key"
create_secret "yelp-api-key" "Yelp Fusion API key"

echo ""
echo "💓 Biometrics (Maya)"
create_secret "oura-client-id" "Oura OAuth client ID"
create_secret "oura-client-secret" "Oura OAuth client secret"
create_secret "whoop-client-id" "Whoop OAuth client ID"
create_secret "whoop-client-secret" "Whoop OAuth client secret"
create_secret "terra-api-key" "Terra API key (300+ wearables)"
create_secret "terra-dev-id" "Terra Developer ID"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next Steps:"
echo ""
echo "1. Add values to each secret:"
echo ""
echo "   # Free APIs (get your own keys)"
echo "   echo 'YOUR_KEY' | gcloud secrets versions add alpha-vantage-key --data-file=- --project=$PROJECT_ID"
echo "   echo 'YOUR_KEY' | gcloud secrets versions add fred-api-key --data-file=- --project=$PROJECT_ID"
echo "   echo 'YOUR_KEY' | gcloud secrets versions add yelp-api-key --data-file=- --project=$PROJECT_ID"
echo ""
echo "   # Google OAuth (from GCP Console)"
echo "   echo 'YOUR_CLIENT_ID' | gcloud secrets versions add google-client-id --data-file=- --project=$PROJECT_ID"
echo "   echo 'YOUR_SECRET' | gcloud secrets versions add google-client-secret --data-file=- --project=$PROJECT_ID"
echo ""
echo "2. Sync to local environment:"
echo "   npx tsx apps/cli/src/commands/setup/sync-secrets-to-env.ts"
echo ""
echo "3. Deploy to production:"
echo "   ferni deploy all"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Interactive mode for setting values
read -p "Do you want to set secret values now? (y/N) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo ""
  echo "Setting secret values..."
  echo "(Leave empty to skip)"
  echo ""
  
  # Alpha Vantage (free)
  read -p "Alpha Vantage API Key (free: alphavantage.co): " ALPHA_VANTAGE_KEY
  if [ -n "$ALPHA_VANTAGE_KEY" ]; then
    echo "$ALPHA_VANTAGE_KEY" | gcloud secrets versions add alpha-vantage-key --data-file=- --project=$PROJECT_ID
    echo "   ✅ alpha-vantage-key set"
  fi
  
  # FRED (free)
  read -p "FRED API Key (free: fred.stlouisfed.org): " FRED_KEY
  if [ -n "$FRED_KEY" ]; then
    echo "$FRED_KEY" | gcloud secrets versions add fred-api-key --data-file=- --project=$PROJECT_ID
    echo "   ✅ fred-api-key set"
  fi
  
  # Yelp (free)
  read -p "Yelp Fusion API Key (free: yelp.com/developers): " YELP_KEY
  if [ -n "$YELP_KEY" ]; then
    echo "$YELP_KEY" | gcloud secrets versions add yelp-api-key --data-file=- --project=$PROJECT_ID
    echo "   ✅ yelp-api-key set"
  fi
  
  # Terra
  read -p "Terra API Key (tryterra.co): " TERRA_KEY
  if [ -n "$TERRA_KEY" ]; then
    echo "$TERRA_KEY" | gcloud secrets versions add terra-api-key --data-file=- --project=$PROJECT_ID
    echo "   ✅ terra-api-key set"
  fi
  
  read -p "Terra Dev ID: " TERRA_DEV
  if [ -n "$TERRA_DEV" ]; then
    echo "$TERRA_DEV" | gcloud secrets versions add terra-dev-id --data-file=- --project=$PROJECT_ID
    echo "   ✅ terra-dev-id set"
  fi
  
  echo ""
  echo "✅ Secrets configured!"
  echo ""
  echo "To sync to local: npx tsx apps/cli/src/commands/setup/sync-secrets-to-env.ts"
fi
