#!/bin/bash
# ============================================================================
# CHECK SCALING INFRASTRUCTURE HEALTH
# Verifies all scaling components are healthy
# ============================================================================

set -e

PROJECT_ID="${PROJECT_ID:-johnb-2025}"
REGION="${REGION:-us-central1}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Checking Ferni Scaling Infrastructure Health"
echo "   Project: ${PROJECT_ID}"
echo "   Region: ${REGION}"
echo ""

# Track overall status
OVERALL_STATUS=0

# ============================================================================
# PUB/SUB TOPICS
# ============================================================================

echo "📮 Pub/Sub Topics:"
for TOPIC in ferni-events ferni-events-dlq; do
  if gcloud pubsub topics describe "${TOPIC}" --project="${PROJECT_ID}" &>/dev/null; then
    echo -e "   ${GREEN}✅${NC} ${TOPIC}"
  else
    echo -e "   ${RED}❌${NC} ${TOPIC} - NOT FOUND"
    OVERALL_STATUS=1
  fi
done

# ============================================================================
# PUB/SUB SUBSCRIPTIONS
# ============================================================================

echo ""
echo "📬 Pub/Sub Subscriptions:"
for SUB in ferni-trust-sub ferni-analytics-sub; do
  if gcloud pubsub subscriptions describe "${SUB}" --project="${PROJECT_ID}" &>/dev/null; then
    # Get message count
    BACKLOG=$(gcloud pubsub subscriptions pull "${SUB}" --project="${PROJECT_ID}" --limit=0 --format="value(ackId)" 2>/dev/null | wc -l | tr -d ' ')
    echo -e "   ${GREEN}✅${NC} ${SUB} (backlog: ~${BACKLOG})"
  else
    echo -e "   ${RED}❌${NC} ${SUB} - NOT FOUND"
    OVERALL_STATUS=1
  fi
done

# ============================================================================
# CLOUD RUN SERVICES
# ============================================================================

echo ""
echo "🚀 Cloud Run Services:"

# Voice Agent (required)
if gcloud run services describe voiceai-agent --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null; then
  URL=$(gcloud run services describe voiceai-agent --region="${REGION}" --format="value(status.url)")
  echo -e "   ${GREEN}✅${NC} voiceai-agent"
  echo "      URL: ${URL}"
else
  echo -e "   ${RED}❌${NC} voiceai-agent - NOT FOUND"
  OVERALL_STATUS=1
fi

# Trust Worker (optional - Phase 3)
if gcloud run services describe ferni-trust-worker --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
  URL=$(gcloud run services describe ferni-trust-worker --region="${REGION}" --format="value(status.url)")
  # Check health
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/health" 2>/dev/null || echo "000")
  if [ "${HTTP_STATUS}" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} ferni-trust-worker (healthy)"
  else
    echo -e "   ${YELLOW}⚠️${NC} ferni-trust-worker (status: ${HTTP_STATUS})"
  fi
else
  echo -e "   ${YELLOW}⏭️${NC}  ferni-trust-worker - Not deployed (Phase 3)"
fi

# Analytics Worker (optional - Phase 3)
if gcloud run services describe ferni-analytics-worker --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
  URL=$(gcloud run services describe ferni-analytics-worker --region="${REGION}" --format="value(status.url)")
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/health" 2>/dev/null || echo "000")
  if [ "${HTTP_STATUS}" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} ferni-analytics-worker (healthy)"
  else
    echo -e "   ${YELLOW}⚠️${NC} ferni-analytics-worker (status: ${HTTP_STATUS})"
  fi
else
  echo -e "   ${YELLOW}⏭️${NC}  ferni-analytics-worker - Not deployed (Phase 3)"
fi

# Context Service (optional - Phase 4)
if gcloud run services describe ferni-context --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
  URL=$(gcloud run services describe ferni-context --region="${REGION}" --format="value(status.url)")
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/health" 2>/dev/null || echo "000")
  if [ "${HTTP_STATUS}" = "200" ]; then
    echo -e "   ${GREEN}✅${NC} ferni-context (healthy)"
  else
    echo -e "   ${YELLOW}⚠️${NC} ferni-context (status: ${HTTP_STATUS})"
  fi
else
  echo -e "   ${YELLOW}⏭️${NC}  ferni-context - Not deployed (Phase 4)"
fi

# ============================================================================
# SERVICE ACCOUNT
# ============================================================================

echo ""
echo "👤 Service Account:"
SA_EMAIL="ferni-worker@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "${SA_EMAIL}" --project="${PROJECT_ID}" &>/dev/null; then
  echo -e "   ${GREEN}✅${NC} ${SA_EMAIL}"
else
  echo -e "   ${YELLOW}⏭️${NC}  ${SA_EMAIL} - Not created yet"
fi

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "============================================"
if [ ${OVERALL_STATUS} -eq 0 ]; then
  echo -e "${GREEN}✅ Core infrastructure is healthy!${NC}"
else
  echo -e "${RED}❌ Some infrastructure components are missing${NC}"
fi
echo "============================================"

echo ""
echo "Scaling Phase Status:"
echo "  Phase 1 (Code Splitting): ✅ Implemented"
echo "  Phase 2 (In-Process Workers): ✅ Implemented"

# Check Phase 3
if gcloud run services describe ferni-trust-worker --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
  echo "  Phase 3 (Separate Workers): ✅ Deployed"
else
  echo "  Phase 3 (Separate Workers): ⏳ Ready to deploy"
fi

# Check Phase 4
if gcloud run services describe ferni-context --region="${REGION}" --project="${PROJECT_ID}" &>/dev/null 2>&1; then
  echo "  Phase 4 (Context Service): ✅ Deployed"
else
  echo "  Phase 4 (Context Service): ⏳ Ready to deploy"
fi

echo ""
echo "Next steps to activate Phase 3:"
echo "  1. npm run infra:setup-pubsub"
echo "  2. npm run deploy:workers"
echo ""
echo "To activate Phase 4:"
echo "  npm run deploy:context"

exit ${OVERALL_STATUS}

