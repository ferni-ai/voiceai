#!/bin/bash
# ============================================================================
# FERNI BRAND ASSETS DEPLOYMENT
# Publishes brand book and design system to Google Cloud Storage
# ============================================================================

set -e

# Colors
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
GCP_PROJECT_ID="${GCP_PROJECT_ID:-johnb-2025}"
BUCKET_NAME="ferni-brand-$GCP_PROJECT_ID"

echo ""
echo -e "${CYAN}📚 Deploying Ferni Brand Assets${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Check if bucket exists, create if not
if ! gsutil ls gs://$BUCKET_NAME &>/dev/null 2>&1; then
  echo "Creating bucket..."
  gsutil mb -l us-central1 -p $GCP_PROJECT_ID gs://$BUCKET_NAME
  gsutil web set -m brand-book.html gs://$BUCKET_NAME
  gsutil iam ch allUsers:objectViewer gs://$BUCKET_NAME
fi

# Upload brand files
echo "Uploading brand assets..."
gsutil -m cp brand/brand-book.html gs://$BUCKET_NAME/
gsutil -m cp brand/ferni-design-tokens.css gs://$BUCKET_NAME/
gsutil -m cp brand/FERNI-SCREEN-GUIDELINES.md gs://$BUCKET_NAME/
gsutil -m cp brand/FERNI-BRAND-GUIDELINES.md gs://$BUCKET_NAME/

# Upload icons
echo "Uploading icons..."
gsutil -m cp brand/icons/*.svg gs://$BUCKET_NAME/icons/
gsutil -m cp brand/favicons/*.svg gs://$BUCKET_NAME/favicons/

# Set content types
gsutil setmeta -h "Content-Type:text/html" gs://$BUCKET_NAME/brand-book.html
gsutil setmeta -h "Content-Type:text/css" gs://$BUCKET_NAME/ferni-design-tokens.css
gsutil -m setmeta -h "Content-Type:image/svg+xml" "gs://$BUCKET_NAME/icons/*.svg"
gsutil -m setmeta -h "Content-Type:image/svg+xml" "gs://$BUCKET_NAME/favicons/*.svg"

echo ""
echo -e "${GREEN}✓ Brand assets published!${NC}"
echo ""
echo "URLs:"
echo "  Brand Book:        https://storage.googleapis.com/$BUCKET_NAME/brand-book.html"
echo "  Design Tokens:     https://storage.googleapis.com/$BUCKET_NAME/ferni-design-tokens.css"
echo "  Screen Guidelines: https://storage.googleapis.com/$BUCKET_NAME/FERNI-SCREEN-GUIDELINES.md"
echo ""
echo "Icons:"
echo "  App Icon 1024:     https://storage.googleapis.com/$BUCKET_NAME/icons/app-icon-1024.svg"
echo "  iOS Simple:        https://storage.googleapis.com/$BUCKET_NAME/icons/app-icon-ios-simple.svg"
echo "  Android:           https://storage.googleapis.com/$BUCKET_NAME/icons/app-icon-android.svg"
echo "  Favicon 32:        https://storage.googleapis.com/$BUCKET_NAME/favicons/favicon-32.svg"
echo ""

