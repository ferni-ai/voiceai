#!/bin/bash
# Warm up LiveKit agent workers after deployment
# This prevents "runner initialization timed out" errors

set -e

SERVICE_URL="https://voiceai-agent-bmopaivmsq-uc.a.run.app"
WARMUP_PINGS=5
DELAY_SECONDS=6

echo "🔥 Warming up LiveKit workers..."
echo "   This prevents 'runner initialization timed out' errors"
echo ""

for i in $(seq 1 $WARMUP_PINGS); do
  echo "  Warm-up ping $i/$WARMUP_PINGS..."
  curl -s -o /dev/null "$SERVICE_URL/health" || true
  
  if [ $i -lt $WARMUP_PINGS ]; then
    sleep $DELAY_SECONDS
  fi
done

echo ""
echo "✅ Warm-up complete - LiveKit workers should be ready"
echo ""
echo "Service health:"
curl -s "$SERVICE_URL/health" | jq . 2>/dev/null || curl -s "$SERVICE_URL/health"

