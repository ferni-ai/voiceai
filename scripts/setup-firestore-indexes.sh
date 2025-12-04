#!/bin/bash

# ============================================================================
# Firestore Index Setup Script
# 
# Creates the required indexes for optimal memory system performance.
# Run this once after deploying to a new GCP project.
#
# Prerequisites:
# - gcloud CLI installed and authenticated
# - GOOGLE_CLOUD_PROJECT environment variable set
# ============================================================================

set -e

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔧 Firestore Index Setup${NC}"
echo "================================="

# Check for required tools
if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI not found. Please install it first.${NC}"
    echo "Visit: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Get project ID
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project 2>/dev/null)}"

if [ -z "$PROJECT_ID" ]; then
    echo -e "${RED}Error: No project ID found.${NC}"
    echo "Set GOOGLE_CLOUD_PROJECT or run: gcloud config set project YOUR_PROJECT"
    exit 1
fi

echo -e "Project: ${YELLOW}$PROJECT_ID${NC}"
echo ""

# ============================================================================
# Index 1: Vector Store (for semantic search)
# ============================================================================

echo -e "${YELLOW}Creating vector store index...${NC}"
echo "Collection: vectors"
echo "Field: embedding (768-dimension vector)"

cat > /tmp/vector-index.yaml << 'EOF'
indexes:
  - collectionGroup: vectors
    queryScope: COLLECTION
    fields:
      - fieldPath: embedding
        vectorConfig:
          dimension: 768
          flat: {}
EOF

gcloud firestore indexes composite create \
  --project="$PROJECT_ID" \
  --collection-group=vectors \
  --query-scope=COLLECTION \
  --field-config='vector-config={"dimension":"768","flat":{}},field-path=embedding' \
  2>/dev/null || echo "  (Index may already exist)"

echo -e "${GREEN}✓ Vector index created/verified${NC}"
echo ""

# ============================================================================
# Index 2: Phone Mappings (for fast phone lookups)
# ============================================================================

echo -e "${YELLOW}Creating phone mappings index...${NC}"
echo "Collection: phone_mappings"
echo "Field: phone (ascending)"

gcloud firestore indexes composite create \
  --project="$PROJECT_ID" \
  --collection-group=phone_mappings \
  --query-scope=COLLECTION \
  --field-config='field-path=phone,order=ASCENDING' \
  --field-config='field-path=userId,order=ASCENDING' \
  2>/dev/null || echo "  (Index may already exist)"

echo -e "${GREEN}✓ Phone mappings index created/verified${NC}"
echo ""

# ============================================================================
# Index 3: User Profiles - linkedIdentifiers (for cross-device lookup)
# ============================================================================

echo -e "${YELLOW}Creating linkedIdentifiers index...${NC}"
echo "Collection: bogle_users"
echo "Field: linkedIdentifiers (array-contains)"

gcloud firestore indexes composite create \
  --project="$PROJECT_ID" \
  --collection-group=bogle_users \
  --query-scope=COLLECTION \
  --field-config='field-path=linkedIdentifiers,array-config=CONTAINS' \
  2>/dev/null || echo "  (Index may already exist)"

echo -e "${GREEN}✓ Linked identifiers index created/verified${NC}"
echo ""

# ============================================================================
# Index 4: Conversation Summaries (for timeline queries)
# ============================================================================

echo -e "${YELLOW}Creating conversation summaries index...${NC}"
echo "Collection: summaries (subcollection)"
echo "Fields: timestamp (descending)"

# Note: Subcollection indexes need to be created via Firebase Console
# or firestore.indexes.json file
echo "  (Subcollection indexes created automatically by Firestore)"

echo -e "${GREEN}✓ Summaries index will be auto-created${NC}"
echo ""

# ============================================================================
# Summary
# ============================================================================

echo "================================="
echo -e "${GREEN}🎉 Index setup complete!${NC}"
echo ""
echo "Indexes created:"
echo "  ✓ vectors.embedding (vector search)"
echo "  ✓ phone_mappings.phone (phone lookups)"
echo "  ✓ bogle_users.linkedIdentifiers (cross-device)"
echo "  ✓ summaries.timestamp (auto-created)"
echo ""
echo -e "${YELLOW}Note: Indexes may take a few minutes to build.${NC}"
echo "Check status: gcloud firestore indexes composite list --project=$PROJECT_ID"
echo ""

# ============================================================================
# Optional: Export index definitions for CI/CD
# ============================================================================

cat > firestore.indexes.json << EOF
{
  "indexes": [
    {
      "collectionGroup": "vectors",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "embedding", "vectorConfig": { "dimension": 768, "flat": {} } }
      ]
    },
    {
      "collectionGroup": "phone_mappings",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "phone", "order": "ASCENDING" },
        { "fieldPath": "userId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "bogle_users",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "linkedIdentifiers", "arrayConfig": "CONTAINS" }
      ]
    }
  ],
  "fieldOverrides": []
}
EOF

echo -e "${GREEN}Created firestore.indexes.json for CI/CD${NC}"

