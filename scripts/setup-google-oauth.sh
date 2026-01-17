#!/bin/bash
# Setup Google OAuth 2.0 for Ferni
#
# This script guides you through creating OAuth credentials for:
# - Google Calendar (Alex can see user's schedule)
# - Gmail (Alex can read/send emails)
# - Google Maps (travel time estimates)
#
# Run with: ./scripts/setup-google-oauth.sh

set -e

PROJECT_ID="johnb-2025"
REDIRECT_URI="https://app.ferni.ai/auth/google/callback"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  🔐 Google OAuth Setup for Ferni                             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Check if we already have credentials
if gcloud secrets versions access latest --secret="google-calendar-client-id" --project="$PROJECT_ID" &>/dev/null; then
  echo "✅ Google OAuth credentials already configured!"
  echo ""
  echo "Current status:"
  echo "  GOOGLE_CALENDAR_CLIENT_ID: ✅ Set"
  
  if gcloud secrets versions access latest --secret="google-calendar-client-secret" --project="$PROJECT_ID" &>/dev/null; then
    echo "  GOOGLE_CALENDAR_CLIENT_SECRET: ✅ Set"
  else
    echo "  GOOGLE_CALENDAR_CLIENT_SECRET: ❌ Missing"
  fi
  echo ""
  read -p "Do you want to reconfigure? (y/N) " -n 1 -r
  echo ""
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 0
  fi
fi

echo "📋 STEP 1: Open Google Cloud Console"
echo ""
echo "   Opening: APIs & Services > Credentials"
echo ""

# Open the GCP Console credentials page
if command -v open &>/dev/null; then
  open "https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
elif command -v xdg-open &>/dev/null; then
  xdg-open "https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
else
  echo "   Please open: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 STEP 2: Create OAuth 2.0 Client ID"
echo ""
echo "   1. Click '+ CREATE CREDENTIALS' → 'OAuth client ID'"
echo ""
echo "   2. If prompted to configure consent screen:"
echo "      - User Type: External"
echo "      - App name: Ferni"
echo "      - User support email: Your email"
echo "      - Developer contact: Your email"
echo "      - Click 'Save and Continue' through the rest"
echo ""
echo "   3. For the OAuth Client ID:"
echo "      - Application type: Web application"
echo "      - Name: Ferni Web Client"
echo "      - Authorized redirect URIs: $REDIRECT_URI"
echo ""
echo "   4. Click 'CREATE'"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

read -p "Press Enter when you've created the OAuth client ID..."

echo ""
echo "📋 STEP 3: Enter the credentials"
echo ""
read -p "   Client ID: " CLIENT_ID
read -p "   Client Secret: " CLIENT_SECRET

if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "❌ Both Client ID and Client Secret are required!"
  exit 1
fi

echo ""
echo "🔐 Saving credentials to GCP Secret Manager..."
echo ""

# Create or update the secrets
echo "$CLIENT_ID" | gcloud secrets versions add google-calendar-client-id --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
  (gcloud secrets create google-calendar-client-id --project="$PROJECT_ID" --replication-policy="automatic" && \
   echo "$CLIENT_ID" | gcloud secrets versions add google-calendar-client-id --data-file=- --project="$PROJECT_ID")
echo "   ✅ google-calendar-client-id saved"

echo "$CLIENT_SECRET" | gcloud secrets versions add google-calendar-client-secret --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
  (gcloud secrets create google-calendar-client-secret --project="$PROJECT_ID" --replication-policy="automatic" && \
   echo "$CLIENT_SECRET" | gcloud secrets versions add google-calendar-client-secret --data-file=- --project="$PROJECT_ID")
echo "   ✅ google-calendar-client-secret saved"

# Also save the redirect URI
echo "$REDIRECT_URI" | gcloud secrets versions add google-calendar-redirect-uri --data-file=- --project="$PROJECT_ID" 2>/dev/null || \
  (gcloud secrets create google-calendar-redirect-uri --project="$PROJECT_ID" --replication-policy="automatic" && \
   echo "$REDIRECT_URI" | gcloud secrets versions add google-calendar-redirect-uri --data-file=- --project="$PROJECT_ID")
echo "   ✅ google-calendar-redirect-uri saved"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "✅ Google OAuth Setup Complete!"
echo ""
echo "Next steps:"
echo "  1. Redeploy to pick up new secrets:"
echo "     pnpm deploy:agent --skip-git-check"
echo ""
echo "  2. Test the flow:"
echo "     - Open https://app.ferni.ai"
echo "     - Go to Settings → Connect Google Calendar"
echo "     - Complete the OAuth flow"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
