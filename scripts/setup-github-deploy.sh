#!/bin/bash
# Setup GitHub Actions CI/CD
# Run: ./scripts/setup-github-deploy.sh

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  🚀 GitHub Actions CI/CD Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${NC}"

# Check for gh CLI
if ! command -v gh &> /dev/null; then
  echo -e "${RED}❌ GitHub CLI (gh) is required. Install from: https://cli.github.com/${NC}"
  exit 1
fi

# Check if logged in
if ! gh auth status &>/dev/null; then
  echo -e "${YELLOW}Please log in to GitHub:${NC}"
  gh auth login
fi

# Get repo info
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
  echo -e "${RED}❌ Not in a git repository or not connected to GitHub${NC}"
  exit 1
fi

echo -e "${GREEN}Repository: $REPO${NC}"
echo ""

# ============================================================================
# STEP 1: GCP Service Account
# ============================================================================
echo -e "${CYAN}Step 1: GCP Service Account${NC}"
echo "─────────────────────────────────────────────"

# Check for gcloud
if command -v gcloud &> /dev/null; then
  PROJECT_ID=$(gcloud config get-value project 2>/dev/null)
  echo "Current GCP project: $PROJECT_ID"
  
  echo ""
  echo "Creating service account for GitHub Actions..."
  SA_NAME="github-actions-deploy"
  SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  
  # Check if SA exists
  if gcloud iam service-accounts describe $SA_EMAIL &>/dev/null 2>&1; then
    echo -e "${GREEN}✓ Service account exists: $SA_EMAIL${NC}"
  else
    echo "Creating service account..."
    gcloud iam service-accounts create $SA_NAME \
      --display-name="GitHub Actions Deploy" \
      --description="Service account for GitHub Actions CI/CD"
  fi
  
  # Grant required roles
  echo "Granting roles..."
  ROLES=(
    "roles/run.admin"
    "roles/storage.admin"
    "roles/iam.serviceAccountUser"
    "roles/secretmanager.secretAccessor"
  )
  
  for ROLE in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
      --member="serviceAccount:$SA_EMAIL" \
      --role="$ROLE" \
      --quiet 2>/dev/null || true
    echo -e "  ${GREEN}✓ $ROLE${NC}"
  done
  
  # Create key if doesn't exist
  KEY_FILE="/tmp/gcp-sa-key.json"
  echo ""
  echo "Creating service account key..."
  gcloud iam service-accounts keys create $KEY_FILE \
    --iam-account=$SA_EMAIL \
    --quiet
  
  # Encode key for GitHub secret
  GCP_SA_KEY=$(cat $KEY_FILE | base64)
  rm $KEY_FILE
  
  echo -e "${GREEN}✓ Service account key created${NC}"
else
  echo -e "${YELLOW}gcloud not found - skipping GCP setup${NC}"
  echo "You'll need to manually create a service account and provide the key."
  echo ""
  read -p "Paste your GCP service account JSON key (base64 encoded): " GCP_SA_KEY
  read -p "Enter your GCP Project ID: " PROJECT_ID
fi

# ============================================================================
# STEP 2: Set GitHub Secrets
# ============================================================================
echo ""
echo -e "${CYAN}Step 2: Configure GitHub Secrets${NC}"
echo "─────────────────────────────────────────────"

# Required secrets
declare -A SECRETS=(
  ["GCP_PROJECT_ID"]="$PROJECT_ID"
  ["GCP_SA_KEY"]="$GCP_SA_KEY"
)

# Optional secrets to prompt for
OPTIONAL_SECRETS=(
  "DORA_API_URL"
  "DORA_API_KEY"
  "FIREBASE_SERVICE_ACCOUNT"
)

for SECRET_NAME in "${!SECRETS[@]}"; do
  SECRET_VALUE="${SECRETS[$SECRET_NAME]}"
  if [ -n "$SECRET_VALUE" ]; then
    echo "$SECRET_VALUE" | gh secret set "$SECRET_NAME" --repo "$REPO"
    echo -e "  ${GREEN}✓ $SECRET_NAME${NC}"
  fi
done

echo ""
echo "Optional secrets (press Enter to skip):"
for SECRET_NAME in "${OPTIONAL_SECRETS[@]}"; do
  read -p "  $SECRET_NAME: " SECRET_VALUE
  if [ -n "$SECRET_VALUE" ]; then
    echo "$SECRET_VALUE" | gh secret set "$SECRET_NAME" --repo "$REPO"
    echo -e "  ${GREEN}✓ $SECRET_NAME set${NC}"
  else
    echo -e "  ${YELLOW}○ $SECRET_NAME skipped${NC}"
  fi
done

# ============================================================================
# STEP 3: Configure Branch Protection
# ============================================================================
echo ""
echo -e "${CYAN}Step 3: Branch Protection${NC}"
echo "─────────────────────────────────────────────"

read -p "Configure branch protection for main? (y/N): " CONFIGURE_PROTECTION
if [[ "$CONFIGURE_PROTECTION" =~ ^[Yy]$ ]]; then
  gh api repos/$REPO/branches/main/protection -X PUT \
    -H "Accept: application/vnd.github+json" \
    --input - <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Build & Test"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
EOF
  echo -e "${GREEN}✓ Branch protection configured${NC}"
else
  echo -e "${YELLOW}○ Skipped branch protection${NC}"
fi

# ============================================================================
# STEP 4: Create GitHub Environments
# ============================================================================
echo ""
echo -e "${CYAN}Step 4: GitHub Environments${NC}"
echo "─────────────────────────────────────────────"

# Create production environment
gh api repos/$REPO/environments/production -X PUT \
  --input - <<EOF 2>/dev/null || true
{
  "deployment_branch_policy": {
    "protected_branches": true,
    "custom_branch_policies": false
  }
}
EOF
echo -e "${GREEN}✓ Production environment created${NC}"

# Create staging environment
gh api repos/$REPO/environments/staging -X PUT --input - <<EOF 2>/dev/null || true
{}
EOF
echo -e "${GREEN}✓ Staging environment created${NC}"

# ============================================================================
# STEP 5: Summary
# ============================================================================
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✅ GitHub Actions CI/CD Setup Complete!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Workflows available:"
echo ""
echo "  📦 deploy-production.yml"
echo "     Deploys to production on push to main"
echo "     Blue-green deployment with health checks"
echo "     Canary support with traffic_percent input"
echo ""
echo "  🔄 rollback.yml"
echo "     Quick rollback to previous revision"
echo "     Or rollback to specific SHA/revision"
echo ""
echo "  🧪 staging.yml"
echo "     Creates preview deployments for PRs"
echo "     Auto-cleanup on PR close"
echo ""
echo "Manual trigger:"
echo "  gh workflow run deploy-production.yml"
echo "  gh workflow run rollback.yml -f service=voice-agent -f reason='Bug fix'"
echo ""
echo "View runs:"
echo "  gh run list"
echo "  gh run watch"
echo ""

