#!/bin/bash
# =============================================================================
# Setup Pub/Sub Topics and Subscriptions
#
# Quick setup script for Pub/Sub infrastructure.
# For production, use Terraform (pubsub-topics.tf) instead.
#
# Usage:
# ./infra/scripts/setup-pubsub.sh
# ./infra/scripts/setup-pubsub.sh --dry-run
# =============================================================================

set -e

PROJECT_ID="${GCP_PROJECT_ID:-johnb-2025}"
REGION="${GCP_REGION:-us-central1}"
DRY_RUN="${1:-}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

run_cmd() {
  if [ "$DRY_RUN" == "--dry-run" ]; then
    echo "[DRY RUN] $1"
  else
    eval "$1"
  fi
}

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔔 Pub/Sub Setup for Ferni Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$DRY_RUN" == "--dry-run" ]; then
  log_warn "Running in DRY RUN mode - no changes will be made"
  echo ""
fi

log_info "Project: $PROJECT_ID"
log_info "Region: $REGION"
echo ""

# -----------------------------------------------------------------------------
# Topics
# -----------------------------------------------------------------------------
echo "━━━ Creating Topics ━━━"

# Intelligence Events
log_info "Creating intelligence-events topic..."
run_cmd "gcloud pubsub topics create intelligence-events \
  --project=$PROJECT_ID \
  --labels=service=intelligence-worker,environment=prod \
  --message-retention-duration=7d \
  2>/dev/null || true"
log_success "intelligence-events topic ready"

# Intelligence Events DLQ
log_info "Creating intelligence-events-dlq topic..."
run_cmd "gcloud pubsub topics create intelligence-events-dlq \
  --project=$PROJECT_ID \
  --labels=service=intelligence-worker,type=dead-letter,environment=prod \
  2>/dev/null || true"
log_success "intelligence-events-dlq topic ready"

# Outreach Triggers
log_info "Creating outreach-triggers topic..."
run_cmd "gcloud pubsub topics create outreach-triggers \
  --project=$PROJECT_ID \
  --labels=service=async-worker,environment=prod \
  --message-retention-duration=7d \
  2>/dev/null || true"
log_success "outreach-triggers topic ready"

# Embedding Requests (future)
log_info "Creating embedding-requests topic..."
run_cmd "gcloud pubsub topics create embedding-requests \
  --project=$PROJECT_ID \
  --labels=service=embedding-worker,environment=prod \
  --message-retention-duration=1d \
  2>/dev/null || true"
log_success "embedding-requests topic ready"

echo ""

# -----------------------------------------------------------------------------
# Subscriptions
# -----------------------------------------------------------------------------
echo "━━━ Creating Subscriptions ━━━"

# Note: Push subscriptions require the service URL to be configured
# For now, create pull subscriptions that can be converted later

# Intelligence Worker Subscription
log_info "Creating intelligence-events-worker-sub subscription..."
run_cmd "gcloud pubsub subscriptions create intelligence-events-worker-sub \
  --project=$PROJECT_ID \
  --topic=intelligence-events \
  --ack-deadline=300 \
  --message-retention-duration=7d \
  --dead-letter-topic=intelligence-events-dlq \
  --max-delivery-attempts=5 \
  2>/dev/null || true"
log_success "intelligence-events-worker-sub subscription ready"

# DLQ Subscription
log_info "Creating intelligence-events-dlq-sub subscription..."
run_cmd "gcloud pubsub subscriptions create intelligence-events-dlq-sub \
  --project=$PROJECT_ID \
  --topic=intelligence-events-dlq \
  --ack-deadline=600 \
  2>/dev/null || true"
log_success "intelligence-events-dlq-sub subscription ready"

# Outreach Worker Subscription
log_info "Creating outreach-triggers-worker-sub subscription..."
run_cmd "gcloud pubsub subscriptions create outreach-triggers-worker-sub \
  --project=$PROJECT_ID \
  --topic=outreach-triggers \
  --ack-deadline=300 \
  --message-retention-duration=7d \
  2>/dev/null || true"
log_success "outreach-triggers-worker-sub subscription ready"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 Pub/Sub setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

log_info "Topics created:"
run_cmd "gcloud pubsub topics list --project=$PROJECT_ID --format='value(name)' | grep -E '(intelligence|outreach|embedding)' || true"

echo ""
log_info "Subscriptions created:"
run_cmd "gcloud pubsub subscriptions list --project=$PROJECT_ID --format='value(name)' | grep -E '(intelligence|outreach|embedding)' || true"

echo ""
log_info "Next steps:"
echo "  1. Deploy intelligence worker: ferni deploy intelligence"
echo "  2. Configure push endpoints in subscriptions"
echo "  3. Test with: gcloud pubsub topics publish intelligence-events --message='{\"test\":true}'"

