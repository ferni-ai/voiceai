#!/bin/bash
# Setup ALL Missing API Keys for Ferni "Better than Human" Integrations
#
# Run with: ./scripts/setup-all-api-keys.sh

set -e

PROJECT_ID="johnb-2025"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🔐 Ferni API Keys Setup - Better than Human                 ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Function to check and set a secret
setup_secret() {
  local SECRET_NAME=$1
  local DISPLAY_NAME=$2
  local SIGNUP_URL=$3
  local INSTRUCTIONS=$4
  
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  
  if gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "✅ $DISPLAY_NAME - Already configured"
    read -p "   Reconfigure? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      return 0
    fi
  else
    echo "⚠️  $DISPLAY_NAME - NOT CONFIGURED"
  fi
  
  echo ""
  echo "📋 $DISPLAY_NAME"
  echo "   $INSTRUCTIONS"
  echo ""
  echo "   Signup URL: $SIGNUP_URL"
  
  read -p "   Open in browser? (Y/n) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Nn]$ ]]; then
    open "$SIGNUP_URL" 2>/dev/null || xdg-open "$SIGNUP_URL" 2>/dev/null || echo "   Please open: $SIGNUP_URL"
  fi
  
  echo ""
  read -p "   Enter API Key (or press Enter to skip): " API_KEY
  
  if [ -n "$API_KEY" ]; then
    echo "$API_KEY" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
      (gcloud secrets create "$SECRET_NAME" --project="$PROJECT_ID" --replication-policy="automatic" && \
       echo "$API_KEY" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID")
    echo "   ✅ Saved!"
  else
    echo "   ⏭️  Skipped"
  fi
  echo ""
}

# ============================================================================
# FREE APIs (Quick wins)
# ============================================================================

echo ""
echo "🆓 FREE APIs (Quick Wins)"
echo ""

setup_secret "yelp-api-key" \
  "Yelp Fusion API (Jordan - Restaurants)" \
  "https://www.yelp.com/developers/v3/manage_app" \
  "FREE - Click 'Create App', copy the API Key"

# ============================================================================
# BIOMETRICS APIs (Maya)
# ============================================================================

echo ""
echo "💓 BIOMETRICS APIs (Maya - Health Tracking)"
echo ""

setup_secret "terra-api-key" \
  "Terra API Key (300+ wearables)" \
  "https://dashboard.tryterra.co/" \
  "FREE tier - Sign up, go to Dashboard > API Keys"

setup_secret "terra-dev-id" \
  "Terra Developer ID" \
  "https://dashboard.tryterra.co/" \
  "Same dashboard - copy the Dev ID"

setup_secret "oura-client-id" \
  "Oura Ring - Client ID" \
  "https://cloud.ouraring.com/oauth2/applications" \
  "Create app, Redirect URI: https://app.ferni.ai/api/oura/callback"

setup_secret "oura-client-secret" \
  "Oura Ring - Client Secret" \
  "https://cloud.ouraring.com/oauth2/applications" \
  "Same app page - copy Client Secret"

setup_secret "whoop-client-id" \
  "Whoop - Client ID" \
  "https://developer-dashboard.whoop.com/" \
  "Create app, Redirect URI: https://app.ferni.ai/api/whoop/callback"

setup_secret "whoop-client-secret" \
  "Whoop - Client Secret" \
  "https://developer-dashboard.whoop.com/" \
  "Same app page - copy Client Secret"

# ============================================================================
# GOOGLE OAUTH (Alex - Calendar/Gmail)
# ============================================================================

echo ""
echo "📧 GOOGLE OAUTH (Alex - Calendar/Gmail)"
echo ""

setup_secret "google-calendar-client-id" \
  "Google OAuth - Client ID" \
  "https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID" \
  "Create OAuth 2.0 Client ID (Web app), Redirect: https://app.ferni.ai/auth/google/callback"

setup_secret "google-calendar-client-secret" \
  "Google OAuth - Client Secret" \
  "https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID" \
  "Same OAuth client - copy Client Secret"

# ============================================================================
# RESTAURANT RESERVATIONS (Jordan)
# ============================================================================

echo ""
echo "🍽️  RESTAURANT RESERVATIONS (Jordan)"
echo ""

echo "Note: OpenTable and Resy require partner applications"
echo "      (Not available for self-service signup)"
echo ""

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  📊 FINAL STATUS                                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

check_secret() {
  local SECRET_NAME=$1
  local DISPLAY_NAME=$2
  if gcloud secrets versions access latest --secret="$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
    echo "  ✅ $DISPLAY_NAME"
  else
    echo "  ❌ $DISPLAY_NAME"
  fi
}

echo "Core Services:"
check_secret "google-api-key" "Google Gemini AI"
check_secret "cartesia-api-key" "Cartesia TTS"
check_secret "livekit-api-key" "LiveKit Voice"

echo ""
echo "Communication:"
check_secret "sendgrid-api-key" "SendGrid Email"
check_secret "twilio-account-sid" "Twilio SMS/Calls"

echo ""
echo "Research (Peter):"
check_secret "alpha-vantage-key" "Alpha Vantage"
check_secret "fred-api-key" "FRED Economics"

echo ""
echo "Google OAuth (Alex):"
check_secret "google-calendar-client-id" "Google Calendar/Gmail"
check_secret "google-maps-api-key" "Google Maps"

echo ""
echo "Biometrics (Maya):"
check_secret "terra-api-key" "Terra (300+ wearables)"
check_secret "oura-client-id" "Oura Ring"
check_secret "whoop-client-id" "Whoop"

echo ""
echo "Restaurants (Jordan):"
check_secret "yelp-api-key" "Yelp Fusion"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🚀 Next Steps:"
echo ""
echo "  1. Redeploy to pick up new secrets:"
echo "     pnpm deploy:agent --skip-git-check"
echo ""
echo "  2. Sync secrets to local .env (for testing):"
echo "     npx tsx apps/cli/src/commands/setup/sync-secrets-to-env.ts"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
