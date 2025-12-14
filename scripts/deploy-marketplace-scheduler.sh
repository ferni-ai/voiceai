#!/bin/bash
# Deploy Marketplace Cloud Scheduler Jobs
# 
# This script creates/updates all Cloud Scheduler jobs for the marketplace billing system.
# Run this after deploying the UI server with marketplace routes.
#
# Usage:
#   ./scripts/deploy-marketplace-scheduler.sh
#   ./scripts/deploy-marketplace-scheduler.sh --dry-run    # Preview commands
#   ./scripts/deploy-marketplace-scheduler.sh --delete     # Remove all jobs

set -e

# Configuration
PROJECT_ID="${GCP_PROJECT_ID:-johnb-2025}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_ACCOUNT="cloud-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
BASE_URL="https://voiceai-ui-${PROJECT_ID}.a.run.app/api/jobs"
UI_SERVICE="voiceai-ui"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Flags
DRY_RUN=false
DELETE=false

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --dry-run) DRY_RUN=true ;;
        --delete) DELETE=true ;;
        -h|--help)
            echo "Usage: $0 [--dry-run] [--delete]"
            echo ""
            echo "Options:"
            echo "  --dry-run    Preview commands without executing"
            echo "  --delete     Remove all marketplace scheduler jobs"
            exit 0
            ;;
        *) echo "Unknown parameter: $1"; exit 1 ;;
    esac
    shift
done

# Job definitions: name|schedule|description
JOBS=(
    "marketplace-daily-aggregation|0 6 * * *|Aggregate daily usage metrics and send quota warnings"
    "marketplace-weekly-reports|0 9 * * 1|Generate and send weekly usage reports to users"
    "marketplace-monthly-revenue|0 0 1 * *|Calculate publisher revenue shares for previous month"
    "marketplace-publisher-payouts|0 12 15 * *|Process pending publisher payouts via Stripe"
    "marketplace-quarterly-cleanup|0 2 1 1,4,7,10 *|Archive old records and clean up data"
)

# Print header
echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║       Marketplace Cloud Scheduler Deployment                 ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "Project:         ${GREEN}${PROJECT_ID}${NC}"
echo -e "Region:          ${GREEN}${REGION}${NC}"
echo -e "Service Account: ${GREEN}${SERVICE_ACCOUNT}${NC}"
echo -e "Base URL:        ${GREEN}${BASE_URL}${NC}"
echo ""

if $DRY_RUN; then
    echo -e "${YELLOW}🔍 DRY RUN MODE - No changes will be made${NC}"
    echo ""
fi

# Function to run a command (or just print it in dry-run mode)
run_cmd() {
    if $DRY_RUN; then
        echo -e "${YELLOW}[DRY RUN]${NC} $*"
    else
        eval "$@"
    fi
}

# Delete mode
if $DELETE; then
    echo -e "${RED}⚠️  Deleting all marketplace scheduler jobs...${NC}"
    echo ""
    
    for job_def in "${JOBS[@]}"; do
        IFS='|' read -r name schedule description <<< "$job_def"
        echo -e "  Deleting ${YELLOW}${name}${NC}..."
        run_cmd "gcloud scheduler jobs delete $name --location=$REGION --quiet 2>/dev/null || true"
    done
    
    echo ""
    echo -e "${GREEN}✓ All marketplace jobs deleted${NC}"
    exit 0
fi

# Ensure service account exists
echo -e "${BLUE}1. Checking service account...${NC}"
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT" --project="$PROJECT_ID" &>/dev/null; then
    echo -e "   Creating service account..."
    run_cmd "gcloud iam service-accounts create cloud-scheduler \
        --display-name='Cloud Scheduler Service Account' \
        --project=$PROJECT_ID"
else
    echo -e "   ${GREEN}✓${NC} Service account exists"
fi

# Grant Cloud Run invoker role
echo ""
echo -e "${BLUE}2. Ensuring IAM permissions...${NC}"
run_cmd "gcloud run services add-iam-policy-binding $UI_SERVICE \
    --region=$REGION \
    --member='serviceAccount:${SERVICE_ACCOUNT}' \
    --role='roles/run.invoker' \
    --project=$PROJECT_ID 2>/dev/null || true"
echo -e "   ${GREEN}✓${NC} IAM binding configured"

# Create/update scheduler jobs
echo ""
echo -e "${BLUE}3. Creating scheduler jobs...${NC}"
echo ""

for job_def in "${JOBS[@]}"; do
    IFS='|' read -r name schedule description <<< "$job_def"
    
    echo -e "   ${YELLOW}►${NC} ${name}"
    echo -e "     Schedule: ${schedule}"
    echo -e "     Description: ${description}"
    
    # Delete existing job if it exists (for idempotent updates)
    run_cmd "gcloud scheduler jobs delete $name --location=$REGION --quiet 2>/dev/null || true"
    
    # Create the job
    run_cmd "gcloud scheduler jobs create http $name \
        --location=$REGION \
        --schedule='$schedule' \
        --uri='${BASE_URL}/${name}' \
        --http-method=POST \
        --headers='X-CloudScheduler=true,Content-Type=application/json' \
        --oidc-service-account-email=$SERVICE_ACCOUNT \
        --description='$description' \
        --project=$PROJECT_ID"
    
    echo -e "     ${GREEN}✓${NC} Created"
    echo ""
done

# Verify jobs
echo -e "${BLUE}4. Verifying jobs...${NC}"
echo ""

if ! $DRY_RUN; then
    gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID \
        --filter="name~marketplace" \
        --format="table(name,schedule,state,httpTarget.uri)" 2>/dev/null || true
fi

# Summary
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    Deployment Complete!                      ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Jobs created:"
for job_def in "${JOBS[@]}"; do
    IFS='|' read -r name schedule description <<< "$job_def"
    echo -e "  ${GREEN}✓${NC} ${name}"
done
echo ""
echo -e "To test a job manually:"
echo -e "  ${BLUE}gcloud scheduler jobs run marketplace-daily-aggregation --location=$REGION${NC}"
echo ""
echo -e "To view job status:"
echo -e "  ${BLUE}gcloud scheduler jobs list --location=$REGION${NC}"
echo ""
