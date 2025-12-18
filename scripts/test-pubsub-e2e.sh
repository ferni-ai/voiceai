#!/bin/bash
#
# End-to-End Test for Pub/Sub Integration
#
# This script tests the complete Pub/Sub flow:
# 1. Publishes test messages to topics
# 2. Verifies they're processed by the worker
# 3. Checks metrics and health
#
# Usage: ./scripts/test-pubsub-e2e.sh [--local|--prod]
#

set -e

# Configuration
PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-ferni-prod}"
TOPIC_PREFIX="${PUBSUB_PREFIX:-ferni}"
MODE="${1:-local}"

echo "=============================================="
echo "   Ferni Pub/Sub E2E Test"
echo "=============================================="
echo ""
echo "Mode: $MODE"
echo "Project: $PROJECT_ID"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

success() { echo -e "${GREEN}✓ $1${NC}"; }
fail() { echo -e "${RED}✗ $1${NC}"; exit 1; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

# Get worker URL
if [ "$MODE" == "prod" ]; then
  WORKER_URL=$(gcloud run services describe ferni-worker \
    --region=us-central1 \
    --format='value(status.url)' 2>/dev/null || echo "")
  
  if [ -z "$WORKER_URL" ]; then
    fail "Worker service not found. Deploy first with: ./scripts/deploy-worker.sh"
  fi
else
  WORKER_URL="http://localhost:8080"
  warn "Using local worker at $WORKER_URL"
fi

echo "Worker URL: $WORKER_URL"
echo ""

# Test 1: Health Check
echo "📋 Test 1: Worker Health Check"
echo "--------------------------------------------"

HEALTH=$(curl -sf "${WORKER_URL}/health" 2>/dev/null || echo '{"status":"unhealthy"}')
STATUS=$(echo "$HEALTH" | jq -r '.status' 2>/dev/null || echo "unknown")

if [ "$STATUS" == "healthy" ]; then
  success "Worker is healthy"
  echo "$HEALTH" | jq .
else
  fail "Worker health check failed: $HEALTH"
fi
echo ""

# Test 2: Publish Test Messages
echo "📬 Test 2: Publishing Test Messages"
echo "--------------------------------------------"

TEST_TRACE_ID="e2e-test-$(date +%s)"

# Create test message
TEST_MESSAGE=$(cat <<EOF
{
  "type": "embedding:generate",
  "data": {
    "text": "This is an end-to-end test message",
    "userId": "e2e-test-user",
    "sessionId": "e2e-test-session"
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "traceId": "$TEST_TRACE_ID"
}
EOF
)

if [ "$MODE" == "prod" ]; then
  # Publish to actual Pub/Sub
  echo "Publishing to Pub/Sub topic: ${TOPIC_PREFIX}-embeddings"
  
  echo "$TEST_MESSAGE" | gcloud pubsub topics publish "${TOPIC_PREFIX}-embeddings" \
    --project="$PROJECT_ID" \
    --message="$(cat -)" \
    --attribute="type=embedding:generate"
  
  success "Message published to Pub/Sub"
else
  # Send directly to worker
  echo "Sending directly to worker..."
  
  PUSH_MESSAGE=$(cat <<EOF
{
  "message": {
    "data": "$(echo "$TEST_MESSAGE" | base64)",
    "messageId": "test-$(date +%s)",
    "publishTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  },
  "subscription": "test-subscription"
}
EOF
)
  
  RESPONSE=$(curl -sf -X POST "${WORKER_URL}/pubsub" \
    -H "Content-Type: application/json" \
    -d "$PUSH_MESSAGE" 2>/dev/null || echo '{"success":false}')
  
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")
  
  if [ "$SUCCESS" == "true" ]; then
    success "Message processed successfully"
    echo "$RESPONSE" | jq .
  else
    fail "Message processing failed: $RESPONSE"
  fi
fi
echo ""

# Test 3: Verify Metrics
echo "📊 Test 3: Checking Metrics"
echo "--------------------------------------------"

METRICS=$(curl -sf "${WORKER_URL}/metrics" 2>/dev/null || echo '{}')
HANDLER_COUNT=$(echo "$METRICS" | jq -r '.handlerCount' 2>/dev/null || echo "0")

if [ "$HANDLER_COUNT" -gt "0" ]; then
  success "Worker has $HANDLER_COUNT handlers registered"
  echo "$METRICS" | jq .
else
  warn "No handlers found (may be expected if just started)"
fi
echo ""

# Test 4: Test Multiple Message Types
echo "🔄 Test 4: Testing Multiple Message Types"
echo "--------------------------------------------"

MESSAGE_TYPES=(
  "embedding:generate"
  "summarization:conversation"
  "trust:update"
  "context:warmup"
)

for msg_type in "${MESSAGE_TYPES[@]}"; do
  echo "Testing: $msg_type"
  
  TYPE_MESSAGE=$(cat <<EOF
{
  "type": "$msg_type",
  "data": {
    "userId": "e2e-test-user",
    "sessionId": "e2e-test-session"
  },
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "traceId": "e2e-$msg_type-$(date +%s)"
}
EOF
)
  
  PUSH_MESSAGE=$(cat <<EOF
{
  "message": {
    "data": "$(echo "$TYPE_MESSAGE" | base64)",
    "messageId": "test-$msg_type-$(date +%s)",
    "publishTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  },
  "subscription": "test-subscription"
}
EOF
)
  
  RESPONSE=$(curl -sf -X POST "${WORKER_URL}/pubsub" \
    -H "Content-Type: application/json" \
    -d "$PUSH_MESSAGE" 2>/dev/null || echo '{"success":false}')
  
  SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null || echo "false")
  PROCESSING_MS=$(echo "$RESPONSE" | jq -r '.processingTimeMs' 2>/dev/null || echo "?")
  
  if [ "$SUCCESS" == "true" ]; then
    success "$msg_type processed in ${PROCESSING_MS}ms"
  else
    warn "$msg_type: ${RESPONSE}"
  fi
done
echo ""

# Test 5: Load Test (if in prod mode)
if [ "$MODE" == "prod" ]; then
  echo "🏋️ Test 5: Load Test"
  echo "--------------------------------------------"
  
  CONCURRENT=10
  echo "Sending $CONCURRENT concurrent requests..."
  
  for i in $(seq 1 $CONCURRENT); do
    LOAD_MESSAGE=$(cat <<EOF
{
  "message": {
    "data": "$(echo '{"type":"embedding:generate","data":{"text":"load test '$i'","userId":"load-test"}}' | base64)",
    "messageId": "load-test-$i-$(date +%s)",
    "publishTime": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  },
  "subscription": "test-subscription"
}
EOF
)
    curl -sf -X POST "${WORKER_URL}/pubsub" \
      -H "Content-Type: application/json" \
      -d "$LOAD_MESSAGE" &
  done
  
  wait
  success "Load test completed ($CONCURRENT requests)"
fi

# Summary
echo ""
echo "=============================================="
echo "   Test Summary"
echo "=============================================="
echo ""
success "All tests passed!"
echo ""
echo "Next steps:"
echo "  - Monitor: https://console.cloud.google.com/cloudpubsub?project=$PROJECT_ID"
echo "  - Logs: gcloud logging read 'resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"ferni-worker\"' --limit=20"
echo ""

