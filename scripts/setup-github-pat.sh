#!/bin/bash
# Setup GitHub PAT for Cloud Build
#
# Usage: ./scripts/setup-github-pat.sh YOUR_GITHUB_PAT
#
# To create a PAT:
# 1. Go to https://github.com/settings/tokens/new
# 2. Name: "ferni-cloud-build"
# 3. Scope: "repo" (full control)
# 4. Generate and copy

set -e

if [ -z "$1" ]; then
  echo "Usage: $0 <github-personal-access-token>"
  echo ""
  echo "To create a PAT:"
  echo "1. Go to https://github.com/settings/tokens/new"
  echo "2. Name: 'ferni-cloud-build'"
  echo "3. Scope: 'repo' (full control)"
  echo "4. Generate and copy the token"
  exit 1
fi

PROJECT_ID="${PROJECT_ID:-johnb-2025}"
SECRET_NAME="github-pat"

echo "🔐 Creating/updating secret '$SECRET_NAME' in project '$PROJECT_ID'..."

# Check if secret exists
if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" &>/dev/null; then
  echo "Secret exists, adding new version..."
  echo -n "$1" | gcloud secrets versions add "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"
else
  echo "Creating new secret..."
  echo -n "$1" | gcloud secrets create "$SECRET_NAME" --data-file=- --project="$PROJECT_ID"
fi

# Grant Cloud Build access to the secret
echo "🔑 Granting Cloud Build access to secret..."
PROJECT_NUMBER=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet

echo "✅ Done! Secret '$SECRET_NAME' is ready for Cloud Build."
echo ""
echo "Next steps:"
echo "1. Run: npm run deploy:ui"

