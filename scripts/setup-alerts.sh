#!/bin/bash
# Setup free Cloud Monitoring alerts for auto-scaling
# Run once: chmod +x scripts/setup-alerts.sh && ./scripts/setup-alerts.sh

PROJECT_ID="${GOOGLE_CLOUD_PROJECT:-$(gcloud config get-value project)}"
EMAIL="${ALERT_EMAIL:-$USER@gmail.com}"

echo "🔔 Setting up free Cloud Monitoring alerts for $PROJECT_ID"
echo "📧 Notifications will go to: $EMAIL"
echo ""

# Create notification channel (email - FREE)
echo "Creating email notification channel..."
CHANNEL_ID=$(gcloud alpha monitoring channels create \
  --display-name="Ferni Alerts" \
  --type=email \
  --channel-labels=email_address="$EMAIL" \
  --format="value(name)" 2>/dev/null || echo "")

if [ -z "$CHANNEL_ID" ]; then
  echo "⚠️  Could not create channel (may already exist). Continuing..."
  CHANNEL_ID=$(gcloud alpha monitoring channels list \
    --filter="displayName='Ferni Alerts'" \
    --format="value(name)" 2>/dev/null | head -1)
fi

echo "Channel ID: $CHANNEL_ID"

# Alert 1: High error rate (>5% of requests failing)
echo "Creating high error rate alert..."
gcloud alpha monitoring policies create \
  --display-name="Ferni: High Error Rate" \
  --condition-display-name="Error rate > 5%" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_count" AND metric.labels.response_code_class!="2xx"' \
  --condition-threshold-value=0.05 \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-duration=300s \
  --condition-threshold-aggregation-alignment-period=60s \
  --condition-threshold-aggregation-per-series-aligner=ALIGN_RATE \
  --notification-channels="$CHANNEL_ID" \
  --documentation="Error rate exceeded 5% - check logs at https://console.cloud.google.com/logs/query;query=resource.type%3D%22cloud_run_revision%22;timeRange=PT1H?project=$PROJECT_ID" \
  2>/dev/null && echo "✅ Error rate alert created" || echo "⚠️  Error alert may already exist"

# Alert 2: High latency (p99 > 5s)
echo "Creating high latency alert..."
gcloud alpha monitoring policies create \
  --display-name="Ferni: High Latency" \
  --condition-display-name="p99 latency > 5s" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/request_latencies"' \
  --condition-threshold-value=5000 \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-duration=300s \
  --condition-threshold-aggregation-alignment-period=60s \
  --condition-threshold-aggregation-per-series-aligner=ALIGN_PERCENTILE_99 \
  --notification-channels="$CHANNEL_ID" \
  --documentation="Response times are slow. Consider scaling up min-instances." \
  2>/dev/null && echo "✅ Latency alert created" || echo "⚠️  Latency alert may already exist"

# Alert 3: Hitting max instances (near capacity)
echo "Creating capacity warning alert..."
gcloud alpha monitoring policies create \
  --display-name="Ferni: Near Capacity" \
  --condition-display-name="Instance count > 80" \
  --condition-filter='resource.type="cloud_run_revision" AND metric.type="run.googleapis.com/container/instance_count"' \
  --condition-threshold-value=80 \
  --condition-threshold-comparison=COMPARISON_GT \
  --condition-threshold-duration=300s \
  --condition-threshold-aggregation-alignment-period=60s \
  --condition-threshold-aggregation-per-series-aligner=ALIGN_MAX \
  --notification-channels="$CHANNEL_ID" \
  --documentation="Running at 80% capacity. Consider increasing max-instances in scripts/deploy.ts." \
  2>/dev/null && echo "✅ Capacity alert created" || echo "⚠️  Capacity alert may already exist"

echo ""
echo "✅ Alert setup complete!"
echo ""
echo "📊 View alerts: https://console.cloud.google.com/monitoring/alerting?project=$PROJECT_ID"
echo "📧 You'll receive emails at: $EMAIL"
echo ""
echo "💡 To change email, run: ALERT_EMAIL=you@example.com ./scripts/setup-alerts.sh"
