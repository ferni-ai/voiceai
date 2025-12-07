#!/bin/bash
# Setup Slack Integration for Ferni AI
# Run: ./scripts/setup-slack.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🔔 Slack Integration Setup for Ferni AI"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

echo "This script will help you set up Slack notifications for:"
echo "  • Feature rollouts"
echo "  • Deployments"
echo "  • Incident alerts"
echo ""

# ============================================================================
# STEP 1: Create Slack App (Instructions)
# ============================================================================
echo -e "${CYAN}Step 1: Create Slack App${NC}"
echo "─────────────────────────────────────────────"
echo ""
echo "If you haven't created a Slack app yet:"
echo ""
echo "  1. Go to: https://api.slack.com/apps"
echo "  2. Click 'Create New App' → 'From scratch'"
echo "  3. Name: 'Ferni Notifications'"
echo "  4. Workspace: ferniai.slack.com"
echo "  5. Click 'Create App'"
echo ""
echo "  Then enable Incoming Webhooks:"
echo "  6. Go to 'Incoming Webhooks' in the left sidebar"
echo "  7. Toggle 'Activate Incoming Webhooks' to ON"
echo "  8. Click 'Add New Webhook to Workspace'"
echo "  9. Select channel (e.g., #deployments)"
echo "  10. Copy the Webhook URL"
echo ""
read -p "Press Enter when you have your webhook URL ready..."

# ============================================================================
# STEP 2: Get Webhook URLs
# ============================================================================
echo ""
echo -e "${CYAN}Step 2: Configure Webhook URLs${NC}"
echo "─────────────────────────────────────────────"
echo ""
echo "You can use one webhook for all notifications,"
echo "or different webhooks for different channels."
echo ""

# Main webhook
read -p "Main Slack Webhook URL (required): " SLACK_WEBHOOK_URL
if [ -z "$SLACK_WEBHOOK_URL" ]; then
  echo -e "${RED}❌ Webhook URL is required${NC}"
  exit 1
fi

# Validate webhook URL format
if [[ ! "$SLACK_WEBHOOK_URL" =~ ^https://hooks.slack.com/services/ ]]; then
  echo -e "${YELLOW}⚠️ Warning: URL doesn't look like a Slack webhook${NC}"
  read -p "Continue anyway? (y/N): " CONTINUE
  if [[ ! "$CONTINUE" =~ ^[Yy]$ ]]; then
    exit 1
  fi
fi

# Optional: separate webhooks
echo ""
echo "Optional: Configure separate webhooks for different notification types"
echo "(Press Enter to use the main webhook for all)"
echo ""

read -p "Deployments channel webhook (optional): " SLACK_DEPLOYMENTS_WEBHOOK
read -p "Alerts channel webhook (optional): " SLACK_ALERTS_WEBHOOK
read -p "Rollouts channel webhook (optional): " SLACK_ROLLOUTS_WEBHOOK

# Use main webhook as fallback
SLACK_DEPLOYMENTS_WEBHOOK=${SLACK_DEPLOYMENTS_WEBHOOK:-$SLACK_WEBHOOK_URL}
SLACK_ALERTS_WEBHOOK=${SLACK_ALERTS_WEBHOOK:-$SLACK_WEBHOOK_URL}
SLACK_ROLLOUTS_WEBHOOK=${SLACK_ROLLOUTS_WEBHOOK:-$SLACK_WEBHOOK_URL}

# ============================================================================
# STEP 3: Set GitHub Secrets
# ============================================================================
echo ""
echo -e "${CYAN}Step 3: Configure GitHub Secrets${NC}"
echo "─────────────────────────────────────────────"

if command -v gh &> /dev/null; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
  
  if [ -n "$REPO" ]; then
    echo "Setting GitHub secrets for: $REPO"
    
    echo "$SLACK_WEBHOOK_URL" | gh secret set SLACK_WEBHOOK_URL --repo "$REPO"
    echo -e "  ${GREEN}✓ SLACK_WEBHOOK_URL${NC}"
    
    if [ "$SLACK_DEPLOYMENTS_WEBHOOK" != "$SLACK_WEBHOOK_URL" ]; then
      echo "$SLACK_DEPLOYMENTS_WEBHOOK" | gh secret set SLACK_DEPLOYMENTS_WEBHOOK --repo "$REPO"
      echo -e "  ${GREEN}✓ SLACK_DEPLOYMENTS_WEBHOOK${NC}"
    fi
    
    if [ "$SLACK_ALERTS_WEBHOOK" != "$SLACK_WEBHOOK_URL" ]; then
      echo "$SLACK_ALERTS_WEBHOOK" | gh secret set SLACK_ALERTS_WEBHOOK --repo "$REPO"
      echo -e "  ${GREEN}✓ SLACK_ALERTS_WEBHOOK${NC}"
    fi
    
    if [ "$SLACK_ROLLOUTS_WEBHOOK" != "$SLACK_WEBHOOK_URL" ]; then
      echo "$SLACK_ROLLOUTS_WEBHOOK" | gh secret set SLACK_ROLLOUTS_WEBHOOK --repo "$REPO"
      echo -e "  ${GREEN}✓ SLACK_ROLLOUTS_WEBHOOK${NC}"
    fi
  else
    echo -e "${YELLOW}Not in a GitHub repository, skipping GitHub secrets${NC}"
  fi
else
  echo -e "${YELLOW}GitHub CLI not found, skipping GitHub secrets${NC}"
  echo "Manually add these secrets in GitHub → Settings → Secrets:"
  echo "  SLACK_WEBHOOK_URL"
fi

# ============================================================================
# STEP 4: Set GCP Secrets (for production)
# ============================================================================
echo ""
echo -e "${CYAN}Step 4: Configure GCP Secrets${NC}"
echo "─────────────────────────────────────────────"

if command -v gcloud &> /dev/null; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
  
  if [ -n "$PROJECT_ID" ]; then
    echo "Setting GCP secrets for: $PROJECT_ID"
    
    # Create or update secrets
    if gcloud secrets describe slack-webhook-url &>/dev/null 2>&1; then
      echo -n "$SLACK_WEBHOOK_URL" | gcloud secrets versions add slack-webhook-url --data-file=-
    else
      echo -n "$SLACK_WEBHOOK_URL" | gcloud secrets create slack-webhook-url --data-file=-
    fi
    echo -e "  ${GREEN}✓ slack-webhook-url${NC}"
  else
    echo -e "${YELLOW}No GCP project configured, skipping GCP secrets${NC}"
  fi
else
  echo -e "${YELLOW}gcloud CLI not found, skipping GCP secrets${NC}"
fi

# ============================================================================
# STEP 5: Update local .env
# ============================================================================
echo ""
echo -e "${CYAN}Step 5: Update Local Environment${NC}"
echo "─────────────────────────────────────────────"

ENV_FILE=".env"
if [ -f "$ENV_FILE" ]; then
  # Check if variables already exist
  if grep -q "SLACK_WEBHOOK_URL" "$ENV_FILE"; then
    echo -e "${YELLOW}SLACK_WEBHOOK_URL already in .env - updating${NC}"
    sed -i.bak "s|^SLACK_WEBHOOK_URL=.*|SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL|" "$ENV_FILE"
  else
    echo "" >> "$ENV_FILE"
    echo "# Slack Integration" >> "$ENV_FILE"
    echo "SLACK_WEBHOOK_URL=$SLACK_WEBHOOK_URL" >> "$ENV_FILE"
  fi
  echo -e "  ${GREEN}✓ Updated .env${NC}"
else
  echo -e "${YELLOW}.env file not found - create it from .env.example${NC}"
fi

# ============================================================================
# STEP 6: Test Notification
# ============================================================================
echo ""
echo -e "${CYAN}Step 6: Test Notification${NC}"
echo "─────────────────────────────────────────────"

read -p "Send a test notification? (Y/n): " SEND_TEST
if [[ ! "$SEND_TEST" =~ ^[Nn]$ ]]; then
  echo "Sending test notification..."
  
  TEST_PAYLOAD='{
    "text": "🎉 Ferni AI Slack Integration Configured!",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*🎉 Ferni AI Slack Integration Configured!*\n\nYou will now receive notifications for:\n• Feature rollouts\n• Deployments\n• Incident alerts"
        }
      },
      {
        "type": "context",
        "elements": [
          {
            "type": "mrkdwn",
            "text": "Configured by: '"$USER"' | '"$(date)"'"
          }
        ]
      }
    ]
  }'
  
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "$TEST_PAYLOAD")
  
  if [ "$RESPONSE" = "200" ]; then
    echo -e "  ${GREEN}✓ Test notification sent successfully!${NC}"
  else
    echo -e "  ${RED}❌ Failed to send test notification (HTTP $RESPONSE)${NC}"
  fi
fi

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ Slack Integration Setup Complete!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "You will now receive Slack notifications for:"
echo "  🚀 Feature rollouts"
echo "  📦 Deployments"
echo "  🚨 Incidents"
echo ""
echo "Test locally:"
echo "  npm run rollout:start test-feature --preset=canary"
echo ""
echo "Trigger via GitHub Actions:"
echo "  gh workflow run feature-rollout.yml -f feature_id=test-feature"
echo ""

