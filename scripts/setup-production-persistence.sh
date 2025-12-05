#!/bin/bash

# =============================================================================
# Ferni AI - Production Persistence Setup
# =============================================================================
# This script helps set up Google Cloud Firestore for production persistence.
#
# Prerequisites:
# - Google Cloud SDK (gcloud) installed
# - Authenticated with: gcloud auth login
# - A GCP project created
#
# Usage:
#   ./scripts/setup-production-persistence.sh
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Ferni AI - Production Persistence Setup                ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# =============================================================================
# Step 1: Check prerequisites
# =============================================================================
echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

# Check gcloud
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}❌ gcloud CLI not found${NC}"
    echo "   Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi
echo -e "   ${GREEN}✓ gcloud CLI installed${NC}"

# Check authentication
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo -e "${RED}❌ Not authenticated with gcloud${NC}"
    echo "   Run: gcloud auth login"
    exit 1
fi
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo -e "   ${GREEN}✓ Authenticated as: $ACCOUNT${NC}"

# =============================================================================
# Step 2: Get or create project
# =============================================================================
echo ""
echo -e "${YELLOW}Step 2: Configuring GCP project...${NC}"

# Check for existing project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)

if [ -n "$CURRENT_PROJECT" ]; then
    echo -e "   Current project: ${BLUE}$CURRENT_PROJECT${NC}"
    read -p "   Use this project? (y/n): " USE_CURRENT
    if [ "$USE_CURRENT" != "y" ]; then
        read -p "   Enter project ID: " PROJECT_ID
        gcloud config set project "$PROJECT_ID"
    else
        PROJECT_ID="$CURRENT_PROJECT"
    fi
else
    read -p "   Enter your GCP project ID: " PROJECT_ID
    gcloud config set project "$PROJECT_ID"
fi

echo -e "   ${GREEN}✓ Using project: $PROJECT_ID${NC}"

# =============================================================================
# Step 3: Enable Firestore API
# =============================================================================
echo ""
echo -e "${YELLOW}Step 3: Enabling Firestore API...${NC}"

gcloud services enable firestore.googleapis.com --project="$PROJECT_ID" 2>/dev/null || true
echo -e "   ${GREEN}✓ Firestore API enabled${NC}"

# =============================================================================
# Step 4: Check/Create Firestore database
# =============================================================================
echo ""
echo -e "${YELLOW}Step 4: Setting up Firestore database...${NC}"

# Check if database exists
DB_EXISTS=$(gcloud firestore databases list --project="$PROJECT_ID" --format="value(name)" 2>/dev/null | grep -c "(default)" || true)

if [ "$DB_EXISTS" -eq "0" ]; then
    echo "   Creating Firestore database in Native mode..."
    
    # Ask for region
    echo ""
    echo "   Available regions:"
    echo "   1) us-central1 (Iowa)"
    echo "   2) us-east1 (South Carolina)"
    echo "   3) us-west1 (Oregon)"
    echo "   4) europe-west1 (Belgium)"
    echo "   5) asia-east1 (Taiwan)"
    read -p "   Select region (1-5) [1]: " REGION_CHOICE
    
    case "${REGION_CHOICE:-1}" in
        1) REGION="us-central1" ;;
        2) REGION="us-east1" ;;
        3) REGION="us-west1" ;;
        4) REGION="europe-west1" ;;
        5) REGION="asia-east1" ;;
        *) REGION="us-central1" ;;
    esac
    
    gcloud firestore databases create --project="$PROJECT_ID" --location="$REGION" --type=firestore-native
    echo -e "   ${GREEN}✓ Firestore database created in $REGION${NC}"
else
    echo -e "   ${GREEN}✓ Firestore database already exists${NC}"
fi

# =============================================================================
# Step 5: Create service account
# =============================================================================
echo ""
echo -e "${YELLOW}Step 5: Setting up service account...${NC}"

SA_NAME="ferni-ai-backend"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

# Check if service account exists
SA_EXISTS=$(gcloud iam service-accounts list --project="$PROJECT_ID" --filter="email:$SA_EMAIL" --format="value(email)" 2>/dev/null || true)

if [ -z "$SA_EXISTS" ]; then
    echo "   Creating service account: $SA_NAME"
    gcloud iam service-accounts create "$SA_NAME" \
        --project="$PROJECT_ID" \
        --display-name="Ferni AI Backend" \
        --description="Service account for Ferni AI persistence"
    echo -e "   ${GREEN}✓ Service account created${NC}"
else
    echo -e "   ${GREEN}✓ Service account already exists${NC}"
fi

# Grant Firestore access
echo "   Granting Firestore permissions..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="roles/datastore.user" \
    --quiet 2>/dev/null || true
echo -e "   ${GREEN}✓ Firestore permissions granted${NC}"

# =============================================================================
# Step 6: Create/download credentials
# =============================================================================
echo ""
echo -e "${YELLOW}Step 6: Setting up credentials...${NC}"

CREDS_DIR="$HOME/.ferni"
CREDS_FILE="$CREDS_DIR/service-account.json"

mkdir -p "$CREDS_DIR"

if [ ! -f "$CREDS_FILE" ]; then
    echo "   Creating service account key..."
    gcloud iam service-accounts keys create "$CREDS_FILE" \
        --project="$PROJECT_ID" \
        --iam-account="$SA_EMAIL"
    chmod 600 "$CREDS_FILE"
    echo -e "   ${GREEN}✓ Credentials saved to: $CREDS_FILE${NC}"
else
    echo -e "   ${GREEN}✓ Credentials already exist: $CREDS_FILE${NC}"
fi

# =============================================================================
# Step 7: Generate .env entries
# =============================================================================
echo ""
echo -e "${YELLOW}Step 7: Environment configuration...${NC}"

ENV_CONTENT="# Ferni AI - Production Persistence
# Add these to your .env file:

GOOGLE_CLOUD_PROJECT=$PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=$CREDS_FILE
"

echo ""
echo -e "${BLUE}Add these environment variables to your .env file:${NC}"
echo ""
echo -e "${GREEN}$ENV_CONTENT${NC}"
echo ""

# Check if .env exists and offer to append
if [ -f ".env" ]; then
    read -p "Append to existing .env file? (y/n): " APPEND_ENV
    if [ "$APPEND_ENV" = "y" ]; then
        echo "" >> .env
        echo "# Ferni AI - Production Persistence" >> .env
        echo "GOOGLE_CLOUD_PROJECT=$PROJECT_ID" >> .env
        echo "GOOGLE_APPLICATION_CREDENTIALS=$CREDS_FILE" >> .env
        echo -e "${GREEN}✓ Added to .env${NC}"
    fi
fi

# =============================================================================
# Step 8: Verify setup
# =============================================================================
echo ""
echo -e "${YELLOW}Step 8: Verifying setup...${NC}"

# Export for current shell
export GOOGLE_CLOUD_PROJECT="$PROJECT_ID"
export GOOGLE_APPLICATION_CREDENTIALS="$CREDS_FILE"

# Run verification
if command -v npx &> /dev/null; then
    echo "   Running verification script..."
    npx ts-node scripts/verify-persistence.ts 2>/dev/null || {
        echo -e "   ${YELLOW}⚠ Verification script not found (optional)${NC}"
    }
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✓ Production Persistence Setup Complete!               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "1. Add the environment variables to your deployment configuration"
echo "2. Restart the Ferni AI application"
echo "3. Verify persistence is working with: npm run test:persistence"
echo ""
echo "For Cloud Run deployment, add these to your deploy command:"
echo "  --set-env-vars \"GOOGLE_CLOUD_PROJECT=$PROJECT_ID\""
echo ""

