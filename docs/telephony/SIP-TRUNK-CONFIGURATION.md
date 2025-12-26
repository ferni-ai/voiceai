# SIP Trunk Configuration for Call-On-Behalf

This document describes the Twilio SIP trunk configuration required for Ferni's "Call On Behalf" feature to work.

## Overview

The Call-On-Behalf feature allows Ferni to make phone calls on behalf of users. This requires:
1. **Twilio Account** with voice capabilities
2. **Twilio Phone Number** for outbound caller ID
3. **Webhook Configuration** for call status updates
4. **Environment Variables** properly configured

## Architecture

```
┌──────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│   Ferni Agent    │──────▶│     Twilio      │──────▶│  Contact Phone   │
│                  │      │   Voice API     │      │                  │
└──────────────────┘      └─────────────────┘      └──────────────────┘
         │                         │                        │
         │                         ▼                        │
         │                ┌─────────────────┐               │
         │                │   SIP Trunk     │               │
         │                │  (PSTN Bridge)  │               │
         │                └─────────────────┘               │
         │                         │                        │
         │                         ▼                        │
         │                ┌─────────────────┐               │
         └◀───────────────│ Status Webhook  │◀──────────────┘
                          │/api/webhooks/   │
                          │  call-status    │
                          └─────────────────┘
```

## Twilio Configuration

### 1. Get a Twilio Phone Number

1. Log into [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers → Buy a Number**
3. Choose a number with **Voice** capability
4. Save the number in E.164 format (e.g., `+14155551234`)

### 2. Configure Voice Settings

In the Twilio Console, configure your phone number's voice settings:

| Setting | Value |
|---------|-------|
| **Accept Incoming Voice Calls** | Yes (if you want callbacks) |
| **Configure With** | Webhooks |
| **A Call Comes In** | `https://your-domain.com/api/voice/incoming` |
| **Call Status Changes** | `https://your-domain.com/api/webhooks/call-status` |

### 3. Webhook Configuration

The call status webhook receives status updates for all outbound calls:

**Endpoint:** `/api/webhooks/call-status`
**Method:** POST
**Content-Type:** `application/x-www-form-urlencoded`

#### Expected Webhook Parameters

| Parameter | Description |
|-----------|-------------|
| `CallSid` | Unique Twilio call identifier |
| `AccountSid` | Your Twilio account ID |
| `From` | The from phone number |
| `To` | The to phone number |
| `CallStatus` | Call status (see below) |
| `CallDuration` | Duration in seconds (if completed) |
| `Direction` | `outbound-api` for on-behalf calls |
| `AnsweredBy` | `human`, `machine`, or `unknown` |
| `ErrorCode` | Error code if failed |
| `ErrorMessage` | Error message if failed |

#### Call Status Values

| Status | When | Terminal? |
|--------|------|-----------|
| `initiated` | Call is being placed | No |
| `ringing` | Phone is ringing | No |
| `in-progress` | Call connected | No |
| `completed` | Call ended normally | Yes |
| `busy` | Line was busy | Yes |
| `no-answer` | No one picked up | Yes |
| `failed` | Call failed to connect | Yes |
| `canceled` | Call was canceled | Yes |

## Environment Variables

Add these to your `.env` file:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_FROM_NUMBER=+14155551234

# Webhook Base URL (your server's public URL)
WEBHOOK_BASE_URL=https://your-domain.com

# Optional: Recording Configuration
TWILIO_RECORDING_ENABLED=true
```

### Environment Variable Details

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Your Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | Yes | E.164 format phone number |
| `WEBHOOK_BASE_URL` | Yes | Public URL for webhooks |
| `TWILIO_RECORDING_ENABLED` | No | Enable call recording (default: false) |

## Security Considerations

### 1. Validate Webhook Requests

Twilio signs webhook requests. Validate signatures in production:

```typescript
import twilio from 'twilio';

function validateTwilioRequest(req: Request): boolean {
  const signature = req.headers['x-twilio-signature'];
  const url = `${WEBHOOK_BASE_URL}${req.path}`;
  const params = req.body;

  return twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    url,
    params
  );
}
```

### 2. Rate Limiting

Implement rate limiting to prevent abuse:

- Per-user: Max 10 calls per hour
- Global: Max 100 concurrent calls
- Blocked numbers: Maintain a blocklist

### 3. Compliance

For call recording, ensure:

- User consent is obtained (`recordingConsent` in request)
- Two-party consent states are handled (see `compliance.ts`)
- Recordings are securely stored and retained per policy

## Testing

### Local Development

Use [ngrok](https://ngrok.com) to expose your local server:

```bash
# Terminal 1: Start your server
pnpm dev

# Terminal 2: Start ngrok
ngrok http 8080

# Update .env with ngrok URL
WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

### Test Calls

Use Twilio's [verified caller IDs](https://www.twilio.com/console/phone-numbers/verified) for testing:

1. Add your personal phone as a verified number
2. Make a test call through Ferni
3. Monitor webhook logs

### Webhook Testing

Send test webhooks with curl:

```bash
curl -X POST https://your-domain.com/api/webhooks/call-status \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "CallSid=CA123test&CallStatus=completed&CallDuration=60"
```

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Call Success Rate | Completed / Total | < 80% |
| Average Duration | Mean call duration | N/A |
| Error Rate | Failed / Total | > 5% |
| Webhook Latency | Time to process webhook | > 2s |

### Logs

Relevant log tags:

```bash
# Filter call initiation logs
pnpm ops:logs | grep "on-behalf-call-orchestrator"

# Filter webhook processing logs
pnpm ops:logs | grep "twilio-call-status"

# Filter result capture logs
pnpm ops:logs | grep "call-result-capture"
```

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| Calls not connecting | Invalid from number | Verify E.164 format |
| Webhooks not received | Wrong URL | Check `WEBHOOK_BASE_URL` |
| "Invalid phone number" | Bad to number format | Ensure E.164 with country code |
| "Geographic permission" | Region not enabled | Enable in Twilio Console |

### Debug Mode

Enable debug logging:

```bash
DEBUG=telephony:* pnpm dev
```

## Related Files

| File | Purpose |
|------|---------|
| `src/tools/domains/telephony/call-on-behalf.ts` | Main tool implementation |
| `src/services/outreach/on-behalf-call-orchestrator.ts` | Call orchestration |
| `src/servers/api/routes/twilio-call-status.ts` | Webhook handler |
| `src/services/outreach/call-result-capture.ts` | Result processing |
| `src/tools/domains/telephony/compliance.ts` | Compliance checks |
| `src/tools/domains/telephony/scripts/` | Call scripts |

## Reference Links

- [Twilio Voice API](https://www.twilio.com/docs/voice/api)
- [Twilio Status Callbacks](https://www.twilio.com/docs/voice/api/call-resource#status-callback)
- [Twilio Request Validation](https://www.twilio.com/docs/usage/security#validating-requests)
- [E.164 Number Format](https://en.wikipedia.org/wiki/E.164)

---

*Last updated: December 2024*
