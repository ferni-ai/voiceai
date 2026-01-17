# Phone Identity System Setup Guide

This guide walks you through setting up the Phone Identity System, which allows family members to call Ferni via phone and be recognized.

## Overview

The Phone Identity System enables:
- **Sponsored Identities**: Users can add family members who call Ferni by phone
- **Phone Number Recognition**: Callers are identified by their phone number
- **Voice Enrollment** (optional): Callers can enroll their voice for additional security
- **Self-Registration**: Unknown callers can request to be remembered

## Architecture

```
┌─────────────┐     ┌─────────┐     ┌──────────────┐     ┌─────────────┐
│   Caller    │────▶│  Twilio │────▶│  Ferni API   │────▶│  LiveKit    │
│  (Phone)    │     │  (PSTN) │     │  (Webhook)   │     │  (SIP)      │
└─────────────┘     └─────────┘     └──────────────┘     └─────────────┘
                                            │
                                            ▼
                                    ┌──────────────┐
                                    │  Voice Agent │
                                    │  (Context)   │
                                    └──────────────┘
```

## Prerequisites

1. **Twilio Account** with a phone number
2. **LiveKit Account** with SIP trunk configured
3. **Ferni Backend** deployed and accessible

## Step 1: Configure Environment Variables

Add these to your `.env` file:

```bash
# Required - LiveKit
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# Required - Twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token

# Optional but Recommended - SIP
SIP_TRUNK_ID=ST_xxxxxxxxxx           # For outbound calls
SIP_INBOUND_TRUNK_ID=ST_yyyyyyyyyy   # For inbound calls (if different)
```

## Step 2: Configure LiveKit SIP Trunk

### 2.1 Create Inbound SIP Trunk

1. Go to [LiveKit Cloud Console](https://cloud.livekit.io)
2. Navigate to **SIP** → **Inbound Trunks**
3. Click **Create Trunk**
4. Configure:
   - **Name**: `Ferni Inbound`
   - **Allowed Phone Numbers**: Your Twilio number(s)
   - **Authentication**: IP allowlist (add Twilio's IP ranges)
5. Copy the **SIP URI** (e.g., `sip:inbound@your-project.livekit.cloud`)

### 2.2 Note the Trunk ID

After creation, note the trunk ID (starts with `ST_`). Add it to your environment:

```bash
SIP_INBOUND_TRUNK_ID=ST_your_trunk_id
```

## Step 3: Configure Twilio Webhook

### 3.1 Via Twilio Console

1. Go to [Twilio Console](https://console.twilio.com)
2. Navigate to **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your phone number
4. Configure:

   **Voice & Fax**
   - **Configure With**: Webhooks, TwiML Bins, Functions, etc.
   - **A Call Comes In**: Webhook
   - **URL**: `https://app.ferni.ai/api/voice/inbound`
   - **HTTP Method**: POST
   - **Status Callback URL**: `https://app.ferni.ai/api/voice/inbound/status`
   - **Status Callback Method**: POST

5. Click **Save**

### 3.2 Via Twilio CLI

```bash
# Install Twilio CLI if needed
npm install -g twilio-cli

# Configure
twilio login

# Update phone number webhook
twilio phone-numbers:update +15551234567 \
  --voice-url="https://app.ferni.ai/api/voice/inbound" \
  --voice-method="POST" \
  --status-callback="https://app.ferni.ai/api/voice/inbound/status" \
  --status-callback-method="POST"
```

## Step 4: Verify Configuration

Run the validation script:

```bash
pnpm tsx scripts/validate-phone-identity-system.ts
```

All checks should pass. If not, review the error messages and fix any issues.

## Step 5: Test the System

### 5.1 Add a Sponsored Identity (via API)

```bash
curl -X POST https://app.ferni.ai/api/sponsored-identities \
  -H "Content-Type: application/json" \
  -H "X-Firebase-UID: your-firebase-uid" \
  -d '{
    "displayName": "Mom",
    "phoneNumber": "+15551234567",
    "relationship": "mother"
  }'
```

### 5.2 Test an Inbound Call

1. Call your Twilio number from the registered phone
2. Ferni should greet the caller by name
3. Check logs for successful identification

### 5.3 Test Unknown Caller

1. Call from an unregistered phone number
2. Ferni should greet generically and offer to remember the caller

## API Endpoints

### Twilio Webhooks

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/voice/inbound` | POST | Twilio sends incoming call data here |
| `/api/voice/inbound/status` | POST | Twilio sends call status updates |

### Sponsored Identity Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sponsored-identities` | GET | List all sponsored identities |
| `/api/sponsored-identities` | POST | Create new sponsored identity |
| `/api/sponsored-identities/:id` | GET | Get identity details |
| `/api/sponsored-identities/:id` | PUT | Update identity |
| `/api/sponsored-identities/:id` | DELETE | Delete identity |
| `/api/sponsored-identities/pending` | GET | List pending self-registrations |
| `/api/sponsored-identities/:id/approve` | POST | Approve pending identity |
| `/api/sponsored-identities/:id/revoke` | POST | Revoke identity access |

## Frontend Access

Users can manage family phone callers from:

**Settings Menu → Your People → Family Phone Access**

This opens the Family Identities management panel where users can:
- Add family members with their phone numbers
- View call history and statistics
- Approve or decline pending self-registrations
- Set access levels (full, limited, supervised)

## Troubleshooting

### Calls Not Routing to Ferni

1. **Check Twilio webhook URL** - Must be `https://app.ferni.ai/api/voice/inbound`
2. **Check TwiML response** - Look at Twilio debugger for errors
3. **Check LiveKit SIP trunk** - Ensure trunk is active and configured

### Caller Not Recognized

1. **Check phone number format** - Must be E.164 (e.g., `+15551234567`)
2. **Check identity status** - Must be `active`, not `pending` or `revoked`
3. **Check logs** - Look for `identifyInboundCaller` in logs

### TwiML Errors

Check the Twilio Debugger:
1. Go to Twilio Console → **Monitor** → **Errors**
2. Look for webhook errors
3. Verify HTTPS certificate is valid

### SIP Connection Errors

1. **Check LiveKit status** - Is the SIP trunk healthy?
2. **Check firewall** - SIP traffic must be allowed
3. **Check Twilio IP allowlist** - LiveKit must allow Twilio IPs

## Security Considerations

1. **Webhook Signature Verification** - Consider adding Twilio signature verification
2. **Phone Number Privacy** - Phone numbers are masked in logs and responses
3. **Access Levels** - Use `limited` or `supervised` for sensitive situations
4. **Voice Enrollment** - Enable for additional caller verification

## Related Documentation

- [Voice Agent Entry](/src/agents/voice-agent-entry.ts) - Main agent entry point
- [Inbound Call Context](/src/intelligence/context-builders/external/inbound-call-context.ts) - Context builder
- [Sponsored Identity Service](/src/services/identity/sponsored-identity.ts) - Identity management
- [LiveKit SIP Docs](https://docs.livekit.io/sip/) - LiveKit SIP configuration
- [Twilio Voice Webhooks](https://www.twilio.com/docs/voice/webhooks) - Twilio webhook reference
