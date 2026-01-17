# Telephony: On-Behalf Calls

This document covers the architecture and configuration for Ferni's "Call On Behalf" feature - where Ferni autonomously calls third parties (doctors, restaurants, businesses) on behalf of users.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER'S CONVERSATION                                │
│  User: "Call my doctor to reschedule my appointment"                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CALL-ON-BEHALF TOOL                                  │
│  src/tools/domains/telephony/call-on-behalf.ts                              │
│  - Resolves contact from user's contacts                                     │
│  - Infers call type (healthcare, restaurant, business, personal)             │
│  - Checks compliance (AI disclosure, recording consent, HIPAA)              │
│  - Initiates call via orchestrator                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ON-BEHALF CALL ORCHESTRATOR                           │
│  src/services/outreach/on-behalf-call-orchestrator.ts                       │
│  - Creates LiveKit room for outbound call                                   │
│  - Spawns Ferni agent into room                                             │
│  - Initiates Twilio call via SIP bridge                                     │
│  - Tracks call status                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼                                           ▼
┌──────────────────────────┐            ┌──────────────────────────────────────┐
│     LIVEKIT ROOM         │            │            TWILIO                    │
│  - Ferni agent joins     │◄──SIP──────│  - Dials external number             │
│  - External party audio  │            │  - Status callbacks                  │
│  - Script/context        │            │  - Machine detection                 │
└──────────────────────────┘            └──────────────────────────────────────┘
                                                        │
                                                        ▼ (webhooks)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       TWILIO WEBHOOK HANDLER                                 │
│  src/servers/api/routes/twilio-call-status.ts                               │
│  POST /api/webhooks/call-status                                             │
│  - Receives call status updates (ringing, answered, completed, busy, etc.)  │
│  - Links Twilio CallSid to our call context                                 │
│  - Triggers result capture                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       CALL RESULT CAPTURE                                    │
│  src/services/outreach/call-result-capture.ts                               │
│  - Stores result in Firestore                                               │
│  - Injects into active session (if user still connected)                    │
│  - Sends push notification (if user disconnected)                           │
│  - Creates follow-up actions                                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Required Configuration

### Environment Variables

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# LiveKit Configuration (use dev project for local development!)
LIVEKIT_URL=wss://dev-8sm1ba0z.livekit.cloud  # Dev project
LIVEKIT_API_KEY=your-api-key
LIVEKIT_API_SECRET=your-api-secret

# SIP Trunk (for production)
SIP_TRUNK_ID=ST_xxxxxxxx  # Optional - uses WebSocket fallback if not set

# Webhook Base URL (must be publicly accessible)
WEBHOOK_BASE_URL=https://your-domain.com  # or ngrok URL for local dev
```

### LiveKit SIP Trunk Setup

For production with full SIP integration:

1. **Create a SIP Trunk in LiveKit Cloud Dashboard**
   - Go to: https://cloud.livekit.io → Your Project → Settings → SIP
   - Create a new outbound trunk
   - Note the trunk ID (starts with `ST_`)

2. **Configure Twilio as SIP Provider**
   - In Twilio Console, create an Elastic SIP Trunk
   - Add your LiveKit SIP endpoint as a termination URI
   - Configure authentication credentials

3. **Set the `SIP_TRUNK_ID` environment variable**

If SIP trunk is not configured, the system falls back to WebSocket audio streaming (lower quality but works).

### Local Development with ngrok

For webhook callbacks during local development:

```bash
# Start ngrok tunnel
ngrok http 8080

# Set the ngrok URL as webhook base
export WEBHOOK_BASE_URL=https://abc123.ngrok.io

# Start the dev server
pnpm dev
```

## Compliance Framework

All on-behalf calls include mandatory compliance:

| Requirement | Implementation |
|-------------|----------------|
| AI Disclosure | Ferni identifies as AI in opening |
| Recording Consent | Asks for consent before proceeding |
| Two-Party Consent States | Extra caution in CA, FL, etc. |
| HIPAA (Healthcare) | Limited information, PHI protection |

See: `src/tools/domains/telephony/compliance.ts`

## Call Scripts

Scripts are selected based on call type:

| Type | Script Location | Features |
|------|-----------------|----------|
| Healthcare | `scripts/healthcare.ts` | HIPAA awareness, appointment handling |
| Restaurant | `scripts/restaurant.ts` | Reservation management, dietary requests |
| Business | `scripts/business.ts` | General business inquiries |
| Personal | `scripts/personal.ts` | Family/friend check-ins |

See: `src/tools/domains/telephony/scripts/`

## Notification Flow

When a call completes, the user is notified through multiple channels:

1. **Active Session Injection** (if still connected)
   - LiveKit data channel message: `on_behalf_call_complete`
   - Ferni can verbally report the result

2. **Push Notification** (always sent)
   - FCM notification to user's devices
   - Clickable action to view details

3. **Stored Notification** (fallback)
   - Persisted in Firestore
   - Shown when user next opens app

## Testing

```bash
# Unit tests
pnpm vitest run src/tools/domains/telephony/__tests__/

# Test voice trigger locally
# Say: "Call my doctor to reschedule my appointment"
```

## Semantic Router Integration

The tool is registered in the semantic router:

```typescript
// src/tools/semantic-router/tool-definitions/telephony.semantic.ts
export const callOnBehalfTool: SemanticToolDefinition = {
  id: 'telephony_call_on_behalf',
  triggers: {
    phrases: [
      'call on my behalf',
      'call to reschedule',
      'call to schedule',
      'call to book',
      // ... more phrases
    ],
    // ...
  },
};
```

## Troubleshooting

### "Call not tracked as on-behalf call"

The Twilio webhook received a CallSid that wasn't registered. This usually means:
- The call was initiated outside the orchestrator
- The orchestrator crashed before calling `trackOutboundCall()`

### "Session room not found"

The user disconnected before the call completed. The push notification should still work.

### "LiveKit SDK not available"

The `livekit-server-sdk` package failed to load. Check dependencies.

## Key Files

| File | Purpose |
|------|---------|
| `src/tools/domains/telephony/call-on-behalf.ts` | Main tool |
| `src/services/outreach/on-behalf-call-orchestrator.ts` | Orchestration |
| `src/services/outreach/call-result-capture.ts` | Result handling |
| `src/servers/api/routes/twilio-call-status.ts` | Webhook handler |
| `src/tools/domains/telephony/compliance.ts` | Compliance checks |
| `src/tools/domains/telephony/scripts/` | Call scripts |
| `src/intelligence/context-builders/outbound-call-context.ts` | Agent context |
