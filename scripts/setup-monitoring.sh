#!/bin/bash
# ============================================================================
# FERNI MONITORING & AUTOMATION SETUP
# ============================================================================
# Sets up comprehensive monitoring, alerting, and automation for Ferni.
#
# Run: ./scripts/setup-monitoring.sh
# ============================================================================

set -e

PROJECT_ID="${GCP_PROJECT:-johnb-2025}"
REGION="us-central1"
AGENT_URL="voiceai-agent-bmopaivmsq-uc.a.run.app"
UI_URL="john-bogle-ui-bmopaivmsq-uc.a.run.app"
NOTIFICATION_EMAIL="${ALERT_EMAIL:-seth.ford@gmail.com}"
SLACK_WEBHOOK="${SLACK_WEBHOOK_URL:-}"
BUDGET_AMOUNT="${BUDGET_AMOUNT:-50}"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  FERNI MONITORING SETUP                                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Project: $PROJECT_ID"
echo "Agent URL: $AGENT_URL"
echo "UI URL: $UI_URL"
echo "Notification Email: $NOTIFICATION_EMAIL"
echo "Budget: \$$BUDGET_AMOUNT/month"
echo ""

# ============================================================================
# 1. ENABLE REQUIRED APIS
# ============================================================================
echo "━━━ ENABLING APIS ━━━"
gcloud services enable monitoring.googleapis.com --project=$PROJECT_ID --quiet
gcloud services enable logging.googleapis.com --project=$PROJECT_ID --quiet
gcloud services enable cloudbilling.googleapis.com --project=$PROJECT_ID --quiet
gcloud services enable cloudscheduler.googleapis.com --project=$PROJECT_ID --quiet
echo "✓ APIs enabled"

# ============================================================================
# 2. CREATE EMAIL NOTIFICATION CHANNEL
# ============================================================================
echo ""
echo "━━━ CREATING NOTIFICATION CHANNELS ━━━"

# Check if email channel exists
EXISTING_EMAIL=$(gcloud alpha monitoring channels list \
  --project=$PROJECT_ID \
  --filter="type=email AND labels.email_address=$NOTIFICATION_EMAIL" \
  --format="value(name)" 2>/dev/null || echo "")

if [ -z "$EXISTING_EMAIL" ]; then
  cat > /tmp/email-channel.json << EOF
{
  "type": "email",
  "displayName": "Ferni Alerts Email",
  "labels": {
    "email_address": "$NOTIFICATION_EMAIL"
  }
}
EOF
  EMAIL_CHANNEL=$(gcloud alpha monitoring channels create \
    --channel-content-from-file=/tmp/email-channel.json \
    --project=$PROJECT_ID \
    --format="value(name)" 2>/dev/null || echo "")
  echo "✓ Email notification channel created"
else
  EMAIL_CHANNEL=$EXISTING_EMAIL
  echo "✓ Email notification channel exists"
fi

# Create Slack channel if webhook provided
if [ -n "$SLACK_WEBHOOK" ]; then
  cat > /tmp/slack-channel.json << EOF
{
  "type": "slack",
  "displayName": "Ferni Alerts Slack",
  "labels": {
    "channel_name": "#ferni-alerts",
    "auth_token": ""
  }
}
EOF
  echo "✓ Slack channel config created (requires manual setup in GCP Console)"
fi

# ============================================================================
# 3. CREATE UPTIME CHECKS
# ============================================================================
echo ""
echo "━━━ CREATING UPTIME CHECKS ━━━"

# Agent health check
cat > /tmp/uptime-agent.json << EOF
{
  "displayName": "Ferni Voice Agent Health",
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "project_id": "$PROJECT_ID",
      "host": "$AGENT_URL"
    }
  },
  "httpCheck": {
    "path": "/health",
    "port": 443,
    "useSsl": true,
    "validateSsl": true,
    "requestMethod": "GET",
    "acceptedResponseStatusCodes": [
      {"statusClass": "STATUS_CLASS_2XX"}
    ]
  },
  "period": "300s",
  "timeout": "10s",
  "checkerType": "STATIC_IP_CHECKERS"
}
EOF

# UI health check
cat > /tmp/uptime-ui.json << EOF
{
  "displayName": "Ferni UI Server Health",
  "monitoredResource": {
    "type": "uptime_url",
    "labels": {
      "project_id": "$PROJECT_ID",
      "host": "$UI_URL"
    }
  },
  "httpCheck": {
    "path": "/health",
    "port": 443,
    "useSsl": true,
    "validateSsl": true,
    "requestMethod": "GET",
    "acceptedResponseStatusCodes": [
      {"statusClass": "STATUS_CLASS_2XX"}
    ]
  },
  "period": "300s",
  "timeout": "10s",
  "checkerType": "STATIC_IP_CHECKERS"
}
EOF

echo "✓ Uptime check configs created"
echo "  Run these in Cloud Console or with: gcloud alpha monitoring uptime create"

# ============================================================================
# 4. CREATE LOG-BASED ALERT POLICIES
# ============================================================================
echo ""
echo "━━━ CREATING ALERT POLICIES ━━━"

# Alert for initialization timeouts
cat > /tmp/alert-timeout.json << EOF
{
  "displayName": "Ferni Agent Initialization Timeout",
  "documentation": {
    "content": "The voice agent child process timed out during initialization. This usually means cold start is too slow.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Initialization timeout errors",
      "conditionMatchedLog": {
        "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"voiceai-agent\" AND textPayload=~\"runner initialization timed out\""
      }
    }
  ],
  "alertStrategy": {
    "notificationRateLimit": {
      "period": "300s"
    }
  },
  "combiner": "OR"
}
EOF

# Alert for high error rate
cat > /tmp/alert-errors.json << EOF
{
  "displayName": "Ferni High Error Rate",
  "documentation": {
    "content": "Error rate has exceeded 5 errors per minute.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Error rate > 5/min",
      "conditionThreshold": {
        "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/log_entry_count\" AND metric.labels.severity=\"ERROR\"",
        "aggregations": [
          {
            "alignmentPeriod": "60s",
            "perSeriesAligner": "ALIGN_RATE"
          }
        ],
        "comparison": "COMPARISON_GT",
        "thresholdValue": 5,
        "duration": "60s"
      }
    }
  ],
  "combiner": "OR"
}
EOF

# Alert for agent down
cat > /tmp/alert-down.json << EOF
{
  "displayName": "Ferni Agent Unhealthy",
  "documentation": {
    "content": "The voice agent health check is failing.",
    "mimeType": "text/markdown"
  },
  "conditions": [
    {
      "displayName": "Uptime check failing",
      "conditionThreshold": {
        "filter": "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.labels.check_id=~\"ferni-agent.*\"",
        "aggregations": [
          {
            "alignmentPeriod": "300s",
            "perSeriesAligner": "ALIGN_FRACTION_TRUE"
          }
        ],
        "comparison": "COMPARISON_LT",
        "thresholdValue": 0.8,
        "duration": "300s"
      }
    }
  ],
  "combiner": "OR"
}
EOF

echo "✓ Alert policy configs created"

# ============================================================================
# 5. CREATE BUDGET ALERT
# ============================================================================
echo ""
echo "━━━ CREATING BUDGET ALERT ━━━"

BILLING_ACCOUNT=$(gcloud billing projects describe $PROJECT_ID --format="value(billingAccountName)" 2>/dev/null | sed 's/billingAccounts\///')

if [ -n "$BILLING_ACCOUNT" ]; then
  cat > /tmp/budget.json << EOF
{
  "displayName": "Ferni Monthly Budget",
  "budgetFilter": {
    "projects": ["projects/$PROJECT_ID"]
  },
  "amount": {
    "specifiedAmount": {
      "currencyCode": "USD",
      "units": "$BUDGET_AMOUNT"
    }
  },
  "thresholdRules": [
    {"thresholdPercent": 0.5},
    {"thresholdPercent": 0.8},
    {"thresholdPercent": 1.0}
  ],
  "notificationsRule": {
    "monitoringNotificationChannels": [],
    "pubsubTopic": "",
    "schemaVersion": "1.0"
  }
}
EOF
  echo "✓ Budget config created (\$$BUDGET_AMOUNT/month)"
  echo "  Apply with: gcloud billing budgets create --billing-account=$BILLING_ACCOUNT --budget-filter='{\"projects\":[\"projects/$PROJECT_ID\"]}' --specified-amount=${BUDGET_AMOUNT}USD --threshold-rules-from-file=/tmp/thresholds.json"
else
  echo "⚠ Could not get billing account - budget creation skipped"
fi

# ============================================================================
# 6. CREATE FIRESTORE BACKUP SCHEDULER
# ============================================================================
echo ""
echo "━━━ CREATING BACKUP SCHEDULER ━━━"

# Check if Cloud Scheduler job exists
EXISTING_JOB=$(gcloud scheduler jobs list --location=$REGION --project=$PROJECT_ID --filter="name~firestore-backup" --format="value(name)" 2>/dev/null || echo "")

if [ -z "$EXISTING_JOB" ]; then
  # Create a Cloud Function or use native export
  echo "  Creating daily Firestore backup job..."

  # For now, create a simple scheduler that could trigger a backup function
  cat > /tmp/backup-job.json << EOF
{
  "name": "ferni-firestore-backup",
  "description": "Daily Firestore backup at 3am UTC",
  "schedule": "0 3 * * *",
  "timeZone": "UTC",
  "httpTarget": {
    "uri": "https://$REGION-$PROJECT_ID.cloudfunctions.net/firestore-backup",
    "httpMethod": "POST",
    "oidcToken": {
      "serviceAccountEmail": "$PROJECT_ID@appspot.gserviceaccount.com"
    }
  }
}
EOF
  echo "✓ Backup scheduler config created"
  echo "  Note: Requires Cloud Function 'firestore-backup' to be deployed"
else
  echo "✓ Backup scheduler already exists"
fi

# ============================================================================
# 7. OUTPUT SUMMARY
# ============================================================================
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  SETUP COMPLETE                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "Config files created in /tmp/:"
echo "  - email-channel.json     (notification channel)"
echo "  - uptime-agent.json      (agent health check)"
echo "  - uptime-ui.json         (UI health check)"
echo "  - alert-timeout.json     (initialization timeout alert)"
echo "  - alert-errors.json      (high error rate alert)"
echo "  - alert-down.json        (agent down alert)"
echo "  - budget.json            (monthly budget)"
echo "  - backup-job.json        (daily backup scheduler)"
echo ""
echo "Manual steps needed:"
echo "  1. Go to https://console.cloud.google.com/monitoring/uptime?project=$PROJECT_ID"
echo "     Create uptime checks using the configs above"
echo ""
echo "  2. Go to https://console.cloud.google.com/monitoring/alerting?project=$PROJECT_ID"
echo "     Create alert policies using the configs above"
echo ""
echo "  3. Go to https://console.cloud.google.com/billing/budgets?project=$PROJECT_ID"
echo "     Create budget using the config above"
echo ""
echo "  4. Add Slack webhook to .env as SLACK_WEBHOOK_URL=https://hooks.slack.com/..."
echo "     Then create Slack notification channel in Cloud Console"
echo ""
echo "Quick links:"
echo "  Monitoring: https://console.cloud.google.com/monitoring?project=$PROJECT_ID"
echo "  Logs: https://console.cloud.google.com/logs?project=$PROJECT_ID"
echo "  Budgets: https://console.cloud.google.com/billing/budgets?project=$PROJECT_ID"
