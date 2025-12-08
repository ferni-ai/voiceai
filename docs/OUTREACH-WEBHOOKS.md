# Outreach System Webhook Configuration

This document explains how to configure webhooks for the Ferni Proactive Outreach System.

## Webhook URLs

After deploying to production, configure these URLs in your provider dashboards:

### Twilio (SMS & Voice)

| Webhook | URL | Method |
|---------|-----|--------|
| SMS Status Callback | `https://app.ferni.ai/api/outreach/webhooks/twilio/sms-status` | POST |
| SMS Inbound | `https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound` | POST |
| Call Status | `https://app.ferni.ai/api/outreach/webhooks/twilio/call-status` | POST |
| Machine Detection | `https://app.ferni.ai/api/outreach/webhooks/twilio/machine-detection` | POST |

#### Twilio Console Configuration

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers** → Your Number
3. Under **Messaging**:
   - Set "A MESSAGE COMES IN" webhook to the SMS Inbound URL
   - Set "STATUS CALLBACK URL" to the SMS Status URL
4. Under **Voice**:
   - Set "STATUS CALLBACK URL" to the Call Status URL

### SendGrid

| Webhook | URL | Method |
|---------|-----|--------|
| Event Webhook | `https://app.ferni.ai/api/outreach/webhooks/sendgrid` | POST |

#### SendGrid Configuration

1. Go to [SendGrid Settings](https://app.sendgrid.com/settings/mail_settings)
2. Navigate to **Settings** → **Mail Settings** → **Event Webhook**
3. Enable the webhook and set the HTTP POST URL
4. Select events to track:
   - ✅ Delivered
   - ✅ Opened
   - ✅ Clicked
   - ✅ Bounced
   - ✅ Unsubscribed
   - ✅ Spam Reports
5. Copy the **Verification Key** and add it to your `.env`:
   ```
   SENDGRID_WEBHOOK_KEY=your_verification_key
   ```

### Resend (Alternative Email Provider)

| Webhook | URL | Method |
|---------|-----|--------|
| Webhook | `https://app.ferni.ai/api/outreach/webhooks/resend` | POST |

#### Resend Configuration

1. Go to [Resend Dashboard](https://resend.com/webhooks)
2. Create a new webhook with the URL above
3. Select events: `email.sent`, `email.delivered`, `email.opened`, `email.clicked`, `email.bounced`
4. Copy the signing secret to your `.env`:
   ```
   RESEND_WEBHOOK_SECRET=your_signing_secret
   ```

## Environment Variables

Add these to your production `.env`:

```bash
# Twilio
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Email (choose one)
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_WEBHOOK_KEY=xxxxx
# OR
RESEND_API_KEY=re_xxxxx
RESEND_WEBHOOK_SECRET=xxxxx

# Email Settings
EMAIL_FROM=hello@ferni.ai
EMAIL_FROM_NAME=Ferni
EMAIL_REPLY_TO=support@ferni.ai

# Webhook Base URL (for callbacks)
WEBHOOK_BASE_URL=https://app.ferni.ai
```

## Testing Webhooks Locally

Use ngrok or similar to test webhooks locally:

```bash
# Start ngrok
ngrok http 3002

# Update webhook URLs in Twilio/SendGrid to use ngrok URL
# e.g., https://abc123.ngrok.io/api/outreach/webhooks/twilio/sms-status
```

## Webhook Security

### Twilio Signature Validation

Twilio signs all webhook requests. The system validates signatures using your `TWILIO_AUTH_TOKEN`.

### SendGrid Verification

SendGrid webhooks include a verification key. Set `SENDGRID_WEBHOOK_KEY` to enable validation.

### Resend Signatures

Resend signs webhooks with HMAC-SHA256. Set `RESEND_WEBHOOK_SECRET` to enable validation.

## Webhook Payloads

### SMS Status Callback (Twilio)

```json
{
  "MessageSid": "SMxxxxx",
  "MessageStatus": "delivered",
  "To": "+1xxxxxxxxxx",
  "From": "+1xxxxxxxxxx"
}
```

### Inbound SMS (Twilio)

```json
{
  "MessageSid": "SMxxxxx",
  "From": "+1xxxxxxxxxx",
  "To": "+1xxxxxxxxxx",
  "Body": "User's reply message"
}
```

### Email Event (SendGrid)

```json
[
  {
    "email": "user@example.com",
    "event": "open",
    "sg_message_id": "xxxxx",
    "timestamp": 1234567890
  }
]
```

## Troubleshooting

### Webhooks not arriving

1. Check webhook URL is correct and accessible
2. Verify SSL certificate is valid
3. Check firewall rules allow incoming requests
4. Review provider logs for delivery failures

### Invalid signature errors

1. Verify secret/token is correct in `.env`
2. Ensure webhook URL matches exactly (including protocol)
3. Check for URL encoding issues

### Duplicate events

The system deduplicates events by message ID. If you're seeing duplicates, check that the message ID is being parsed correctly from the webhook payload.

