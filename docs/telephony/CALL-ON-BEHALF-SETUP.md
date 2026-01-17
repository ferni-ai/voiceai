# Call On Behalf - Setup & Configuration Guide

> Ferni can make phone calls on behalf of users to accomplish tasks like scheduling appointments, making reservations, and resolving issues.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   User Session  │    │  On-Behalf Call │    │   Third Party   │
│   (LiveKit)     │    │    (LiveKit)    │    │   (Twilio SIP)  │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ User says:      │ -> │ Agent spawns in │ -> │ Phone rings at  │
│ "Call my doctor │    │ new room with   │    │ Dr. Smith's     │
│  to reschedule" │    │ call context    │    │ office          │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                      │                      │
        │                      │                      │
        v                      v                      v
    (continues)           (handles call)         (picks up)
                               │                      │
                               │<─────────────────────│
                               │   SIP audio bridge   │
                               │                      │
                               v                      v
                          Agent: "Hi, I'm Ferni calling on behalf of..."
```

## Prerequisites

### 1. LiveKit Cloud (Required)

- Active LiveKit Cloud account
- WebRTC/SIP trunk enabled
- API credentials

### 2. Twilio (Required)

- Twilio account with voice capability
- Phone number for caller ID
- SIP trunk or Elastic SIP Trunking

### 3. Cartesia (Required)

- API key for TTS
- Persona voice IDs configured

---

## Environment Variables

Add these to your `.env` file:

```bash
# Twilio Configuration
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567

# LiveKit Configuration
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret

# SIP Trunk (Optional - enhances audio quality)
SIP_TRUNK_ID=your_sip_trunk_id

# Webhook Base URL (for Twilio callbacks)
WEBHOOK_BASE_URL=https://your-domain.com
```

---

## Twilio Setup

### Option A: Elastic SIP Trunking (Recommended)

1. **Create a SIP Trunk**
   - Twilio Console → Elastic SIP Trunking → Create Trunk
   - Name it `ferni-outbound` or similar

2. **Configure Origination**
   - Add origination URI pointing to LiveKit SIP endpoint
   - Format: `sip:{room}@{livekit-host}:5060`

3. **Note the Trunk SID**
   - Set as `SIP_TRUNK_ID` in environment

### Option B: TwiML without SIP Trunk

If no SIP trunk configured, the system falls back to WebSocket streaming:

```xml
<Response>
  <Connect>
    <Stream url="wss://{livekit-host}/twilio/{roomName}" />
  </Connect>
</Response>
```

This works but may have slightly higher latency.

---

## LiveKit SIP Configuration

### Enable SIP in LiveKit Cloud

1. Go to LiveKit Cloud Console
2. Enable SIP feature for your project
3. Configure inbound SIP trunk for Twilio origination

### SIP Trunk Setup

The orchestrator generates SIP URIs in this format:
```
sip:onbehalf-{callId}@{livekit-host}
```

---

## Webhook Configuration

The system expects Twilio to send call status updates to:

```
POST /api/webhooks/call-status
```

### Status Events

| Status | When | Action |
|--------|------|--------|
| `initiated` | Call placed | Track call start |
| `ringing` | Phone ringing | Update UI |
| `in-progress` | Call connected | Agent begins |
| `completed` | Call ended | Capture result |
| `busy` | Line busy | Schedule retry |
| `no-answer` | No pickup | Schedule retry |
| `failed` | Call failed | Log error |

---

## Compliance Configuration

### Recording Consent States

Two-party consent states (recording requires explicit permission):

- California
- Connecticut
- Delaware
- Florida
- Illinois
- Maryland
- Massachusetts
- Michigan
- Montana
- Nevada
- New Hampshire
- Oregon
- Pennsylvania
- Vermont
- Washington

### AI Disclosure

The agent always identifies as AI per FTC guidelines:

> "Hi, I'm Ferni, an AI assistant calling on behalf of [User Name]..."

---

## Testing

### Local Testing

1. Start the dev servers:
   ```bash
   pnpm dev
   ```

2. Ensure ngrok or similar is running for webhooks:
   ```bash
   ngrok http 3001
   ```

3. Set `WEBHOOK_BASE_URL` to your ngrok URL

4. Test with:
   - "Call my doctor to reschedule my appointment"
   - "Call the restaurant to make a reservation for tonight"

### Verify Setup

```bash
# Check if configuration is valid
curl http://localhost:3001/api/health

# Verify Twilio connectivity
curl -X POST http://localhost:3001/api/telephony/verify
```

---

## Monitoring

### Logs to Watch

```bash
# Call initiation
grep "Initiating on-behalf call" logs/*

# Twilio webhook receipts
grep "Twilio call status webhook" logs/*

# Call results
grep "Call result captured" logs/*
```

### Metrics

The system tracks:
- Call success rate
- Average call duration
- Voicemail hit rate
- Retry frequency

---

## Troubleshooting

### "No SIP trunk configured"

Either:
1. Set `SIP_TRUNK_ID` in environment
2. System will fallback to WebSocket streaming

### "Call failed: Invalid phone number"

Ensure phone numbers are in E.164 format:
- ✓ `+15551234567`
- ✗ `555-123-4567`

### "Webhook not receiving callbacks"

1. Check `WEBHOOK_BASE_URL` is publicly accessible
2. Verify Twilio webhook URL is correct in call params
3. Check for firewall/SSL issues

### "Agent not joining room"

1. Verify LiveKit credentials
2. Check agent spawn logs
3. Ensure room was created successfully

---

## Security Considerations

1. **Never log phone numbers** - Use masking
2. **Store recordings securely** - Encrypt at rest
3. **Validate caller ID** - Prevent spoofing
4. **Rate limit calls** - Prevent abuse
5. **Audit trail** - Log all calls for compliance

---

## Flow Diagram

```
User Request → Contact Resolution → Compliance Check → Script Selection
     │                                                        │
     v                                                        v
Create LiveKit Room ← Build Context ← Generate Script ← Load Templates
     │
     v
Spawn On-Behalf Agent → Dial via Twilio → SIP Bridge → Phone Call
     │                        │                              │
     v                        v                              v
Agent Joins Room       Status Webhooks              Recipient Answers
     │                        │                              │
     v                        v                              v
Listen for Answer  ←  Track Progress  ←  Agent Converses
     │
     v
Call Complete → Capture Result → Push Notification → Session Notification
```

---

*Last updated: December 2024*
