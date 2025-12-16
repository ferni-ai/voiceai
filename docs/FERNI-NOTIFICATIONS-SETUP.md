# Ferni Runtime Notifications Setup

> Enable Slack, Email, and SMS alerts for `ferni runtime watch`

---

## Overview

The Ferni CLI can send notifications when it detects issues in your voice agent:

| Channel | Use Case | Severity Trigger |
|---------|----------|------------------|
| **Slack** | Team visibility | All (warning, critical, resolved) |
| **Email** | Detailed alerts with HTML formatting | All |
| **SMS** | Wake-up calls | **Critical only** (to avoid spam) |

All channels are **optional** - configure what you need.

---

## Quick Start

```bash
# 1. Add secrets to Google Secret Manager (see below)
# 2. Deploy
ferni deploy gce

# 3. Test notifications
gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a
docker exec -it voiceai-agent ferni runtime watch 1
```

---

## Secret Manager Setup

### Slack Notifications

```bash
# Create the secret
echo "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | \
  gcloud secrets create slack-webhook-url --data-file=-

# Or update existing
echo "https://hooks.slack.com/services/YOUR/WEBHOOK/URL" | \
  gcloud secrets versions add slack-webhook-url --data-file=-
```

**Get a Slack webhook:** [api.slack.com/messaging/webhooks](https://api.slack.com/messaging/webhooks)

---

### Email Notifications (SendGrid)

```bash
# SendGrid API key
echo "SG.xxxxxxxxxxxx" | \
  gcloud secrets create sendgrid-api-key --data-file=-

# Email to send alerts to
echo "you@example.com" | \
  gcloud secrets create ferni-alert-email --data-file=-
```

**Get SendGrid API key:** [app.sendgrid.com/settings/api_keys](https://app.sendgrid.com/settings/api_keys)

**Alternative: Mailgun**
```bash
echo "key-xxxxxxxx" | gcloud secrets create mailgun-api-key --data-file=-
echo "mg.yourdomain.com" | gcloud secrets create mailgun-domain --data-file=-
echo "you@example.com" | gcloud secrets create ferni-alert-email --data-file=-
```

---

### SMS Notifications (Twilio)

> SMS only triggers for **critical** alerts to avoid notification fatigue.

```bash
# Twilio credentials
echo "ACxxxxxxxxxxxxxxxx" | \
  gcloud secrets create twilio-account-sid --data-file=-

echo "your_auth_token" | \
  gcloud secrets create twilio-auth-token --data-file=-

# Your Twilio phone number (with country code)
echo "+15551234567" | \
  gcloud secrets create twilio-from-number --data-file=-

# Your phone number to receive alerts
echo "+15559876543" | \
  gcloud secrets create ferni-alert-phone --data-file=-
```

**Get Twilio credentials:** [console.twilio.com](https://console.twilio.com)

---

## Environment Variables Reference

The deploy script automatically converts secret names to environment variables:

| Secret Name | Environment Variable |
|-------------|---------------------|
| `slack-webhook-url` | `SLACK_WEBHOOK_URL` |
| `sendgrid-api-key` | `SENDGRID_API_KEY` |
| `mailgun-api-key` | `MAILGUN_API_KEY` |
| `mailgun-domain` | `MAILGUN_DOMAIN` |
| `twilio-account-sid` | `TWILIO_ACCOUNT_SID` |
| `twilio-auth-token` | `TWILIO_AUTH_TOKEN` |
| `twilio-from-number` | `TWILIO_FROM_NUMBER` |
| `ferni-alert-email` | `FERNI_ALERT_EMAIL` |
| `ferni-alert-phone` | `FERNI_ALERT_PHONE` |

---

## Testing Locally

You can test notifications locally before deploying:

```bash
# Set env vars temporarily
export SLACK_WEBHOOK_URL="https://hooks.slack.com/..."
export SENDGRID_API_KEY="SG.xxx"
export FERNI_ALERT_EMAIL="you@example.com"

# Run watch (will send test notifications if issues detected)
ferni runtime watch 1
```

---

## Verifying in Container

After deployment:

```bash
# SSH to GCE
gcloud compute ssh sethford@voiceai-agent-gce --zone=us-central1-a

# Check which channels are configured
docker exec -it voiceai-agent ferni runtime watch 1
# Look for: "Notifications: Terminal + Slack + Email + SMS (critical only)"

# Check env vars are set (masked)
docker exec -it voiceai-agent ferni runtime env
```

---

## Alert Examples

### Slack Alert
```
🚨 Runtime Alert

🌿 Hey, I noticed something needs attention - the health endpoint
isn't responding. This might be a hiccup, but worth checking on
when you get a moment!

Environment: Container | Time: 12/15/2024, 3:45:00 PM
```

### Email Alert
Beautiful HTML email with Ferni branding, severity color-coded header, and full details.

### SMS Alert (Critical Only)
```
🚨 Ferni Alert: Hey, this needs attention soon - health endpoint
is unreachable. I'm here to help!
```

---

## Troubleshooting

### "Email skipped: No email provider configured"
- Ensure `SENDGRID_API_KEY` or `MAILGUN_API_KEY` secret exists
- Ensure `FERNI_ALERT_EMAIL` secret exists
- Redeploy: `ferni deploy gce`

### "SMS skipped: Twilio not configured"
- All four Twilio secrets required: account SID, auth token, from number, alert phone
- Redeploy after adding secrets

### Notifications not sending
```bash
# Check secrets are accessible
gcloud secrets versions access latest --secret=slack-webhook-url

# Check container has the env var
docker exec voiceai-agent env | grep SLACK
```

---

## Cost Considerations

| Service | Free Tier | Notes |
|---------|-----------|-------|
| **Slack** | Free | Unlimited webhooks |
| **SendGrid** | 100 emails/day | More than enough for alerts |
| **Twilio** | ~$0.0079/SMS | Only critical alerts trigger SMS |

---

## Files Modified

- `apps/cli/src/index.ts` - Notification handlers (`sendEmailAlert`, `sendSMSAlert`, `sendAllNotifications`)
- `apps/cli/src/commands/deploy/deploy-gce.ts` - Added notification secrets to deployment

---

*Last updated: December 2024*
