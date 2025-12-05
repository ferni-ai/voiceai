#!/bin/bash
# =============================================================================
# Ferni AI - GitHub Secrets Setup
# =============================================================================
# This script helps you set up GitHub repository secrets for CI/CD
#
# Prerequisites:
# - GitHub CLI (gh) installed: brew install gh
# - Authenticated with GitHub: gh auth login
# =============================================================================

set -e

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Ferni AI - GitHub Secrets Setup                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo

# Check prerequisites
echo -e "${YELLOW}Checking prerequisites...${NC}"

if ! command -v gh &> /dev/null; then
    echo -e "${RED}✗ GitHub CLI (gh) not found${NC}"
    echo "  Install with: brew install gh"
    exit 1
fi
echo -e "${GREEN}✓${NC} GitHub CLI installed"

if ! gh auth status &> /dev/null; then
    echo -e "${RED}✗ Not authenticated with GitHub${NC}"
    echo "  Run: gh auth login"
    exit 1
fi
echo -e "${GREEN}✓${NC} Authenticated with GitHub"

# Get repository info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
if [ -z "$REPO" ]; then
    echo -e "${RED}✗ Not in a GitHub repository${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Repository: $REPO"
echo

# Menu for setting secrets
echo -e "${YELLOW}Which secrets would you like to set up?${NC}"
echo "1) GCP Deployment (GCP_PROJECT_ID, GCP_SA_KEY)"
echo "2) Sentry Error Tracking (SENTRY_DSN)"
echo "3) Firebase Hosting (FIREBASE_SERVICE_ACCOUNT)"
echo "4) All of the above"
echo "5) Exit"
echo
read -p "Choice [1-5]: " choice

set_secret() {
    local name=$1
    local value=$2
    echo -n "  Setting $name... "
    if gh secret set "$name" --body "$value" 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        return 1
    fi
}

set_secret_from_file() {
    local name=$1
    local file=$2
    echo -n "  Setting $name from file... "
    if gh secret set "$name" < "$file" 2>/dev/null; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        return 1
    fi
}

setup_gcp() {
    echo
    echo -e "${YELLOW}Setting up GCP Deployment secrets...${NC}"
    
    # Get project ID
    read -p "  GCP Project ID: " GCP_PROJECT_ID
    if [ -n "$GCP_PROJECT_ID" ]; then
        set_secret "GCP_PROJECT_ID" "$GCP_PROJECT_ID"
    fi
    
    # Get service account key
    echo "  GCP Service Account Key file path (JSON):"
    read -p "  " SA_KEY_FILE
    if [ -f "$SA_KEY_FILE" ]; then
        set_secret_from_file "GCP_SA_KEY" "$SA_KEY_FILE"
    else
        echo -e "${RED}  File not found: $SA_KEY_FILE${NC}"
    fi
}

setup_sentry() {
    echo
    echo -e "${YELLOW}Setting up Sentry secrets...${NC}"
    
    read -p "  Sentry DSN: " SENTRY_DSN
    if [ -n "$SENTRY_DSN" ]; then
        set_secret "SENTRY_DSN" "$SENTRY_DSN"
    fi
}

setup_firebase() {
    echo
    echo -e "${YELLOW}Setting up Firebase secrets...${NC}"
    
    echo "  Firebase Service Account file path (JSON):"
    read -p "  " FIREBASE_SA_FILE
    if [ -f "$FIREBASE_SA_FILE" ]; then
        set_secret_from_file "FIREBASE_SERVICE_ACCOUNT" "$FIREBASE_SA_FILE"
    else
        echo -e "${RED}  File not found: $FIREBASE_SA_FILE${NC}"
    fi
}

case $choice in
    1) setup_gcp ;;
    2) setup_sentry ;;
    3) setup_firebase ;;
    4)
        setup_gcp
        setup_sentry
        setup_firebase
        ;;
    5) echo "Exiting."; exit 0 ;;
    *) echo -e "${RED}Invalid choice${NC}"; exit 1 ;;
esac

echo
echo -e "${GREEN}Done!${NC} Verify secrets at:"
echo "  https://github.com/$REPO/settings/secrets/actions"

