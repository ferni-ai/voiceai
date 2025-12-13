#!/bin/bash
# ============================================================================
# SETUP PUB/SUB INFRASTRUCTURE
# Creates topics and subscriptions for async event processing
# ============================================================================

set -e

PROJECT_ID="${PROJECT_ID:-johnb-2025}"

echo "🔧 Setting up Pub/Sub infrastructure"
echo "   Project: ${PROJECT_ID}"
echo ""

# Set project
gcloud config set project "${PROJECT_ID}"

# ============================================================================
# CREATE TOPICS
# ============================================================================

echo "📮 Creating topics..."

# Main event topic
if ! gcloud pubsub topics describe ferni-events &>/dev/null; then
  gcloud pubsub topics create ferni-events \
    --message-retention-duration=7d \
    --labels=service=ferni,component=events
  echo "   ✅ Created ferni-events topic"
else
  echo "   ⏭️  ferni-events topic already exists"
fi

# Dead letter topic
if ! gcloud pubsub topics describe ferni-events-dlq &>/dev/null; then
  gcloud pubsub topics create ferni-events-dlq \
    --labels=service=ferni,component=events-dlq
  echo "   ✅ Created ferni-events-dlq topic"
else
  echo "   ⏭️  ferni-events-dlq topic already exists"
fi

# ============================================================================
# CREATE SUBSCRIPTIONS
# ============================================================================

echo ""
echo "📬 Creating subscriptions..."

# Trust worker subscription
if ! gcloud pubsub subscriptions describe ferni-trust-sub &>/dev/null; then
  gcloud pubsub subscriptions create ferni-trust-sub \
    --topic=ferni-events \
    --ack-deadline=30 \
    --message-retention-duration=7d \
    --dead-letter-topic=ferni-events-dlq \
    --max-delivery-attempts=5 \
    --filter='attributes.type = "trust:update" OR attributes.type = "trust:milestone" OR attributes.type = "relationship:stage-change" OR attributes.type = "conversation:end"' \
    --labels=service=ferni,component=trust-worker
  echo "   ✅ Created ferni-trust-sub subscription"
else
  echo "   ⏭️  ferni-trust-sub subscription already exists"
fi

# Analytics worker subscription
if ! gcloud pubsub subscriptions describe ferni-analytics-sub &>/dev/null; then
  gcloud pubsub subscriptions create ferni-analytics-sub \
    --topic=ferni-events \
    --ack-deadline=30 \
    --message-retention-duration=7d \
    --dead-letter-topic=ferni-events-dlq \
    --max-delivery-attempts=5 \
    --filter='attributes.type = "analytics:interaction" OR attributes.type = "analytics:emotion-detected" OR attributes.type = "learning:pattern-detected" OR attributes.type = "learning:community-insight" OR attributes.type = "conversation:turn"' \
    --labels=service=ferni,component=analytics-worker
  echo "   ✅ Created ferni-analytics-sub subscription"
else
  echo "   ⏭️  ferni-analytics-sub subscription already exists"
fi

# ============================================================================
# CREATE SERVICE ACCOUNT
# ============================================================================

echo ""
echo "👤 Setting up service account..."

SA_EMAIL="ferni-worker@${PROJECT_ID}.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "${SA_EMAIL}" &>/dev/null; then
  gcloud iam service-accounts create ferni-worker \
    --display-name="Ferni Worker Service Account" \
    --description="Service account for Ferni background workers"
  echo "   ✅ Created service account"
else
  echo "   ⏭️  Service account already exists"
fi

# Grant permissions
echo "   📋 Granting permissions..."

# Pub/Sub subscriber
gcloud pubsub subscriptions add-iam-policy-binding ferni-trust-sub \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/pubsub.subscriber" \
  --quiet

gcloud pubsub subscriptions add-iam-policy-binding ferni-analytics-sub \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/pubsub.subscriber" \
  --quiet

# Firestore access
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/datastore.user" \
  --quiet

echo "   ✅ Permissions granted"

# ============================================================================
# GRANT VOICE AGENT PUBLISHER ACCESS
# ============================================================================

echo ""
echo "📤 Granting publisher access to voice agent..."

AGENT_SA="voiceai-agent@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud pubsub topics add-iam-policy-binding ferni-events \
  --member="serviceAccount:${AGENT_SA}" \
  --role="roles/pubsub.publisher" \
  --quiet

echo "   ✅ Voice agent can now publish events"

# ============================================================================
# SUMMARY
# ============================================================================

echo ""
echo "✅ Pub/Sub infrastructure setup complete!"
echo ""
echo "Topics:"
gcloud pubsub topics list --filter="labels.service=ferni" --format="table(name)"
echo ""
echo "Subscriptions:"
gcloud pubsub subscriptions list --filter="labels.service=ferni" --format="table(name,topic)"
echo ""
echo "Next steps:"
echo "  1. Enable Pub/Sub in your app: await AsyncEvents.enablePubSub('${PROJECT_ID}')"
echo "  2. Deploy workers: ./infrastructure/scripts/deploy-workers.sh"

