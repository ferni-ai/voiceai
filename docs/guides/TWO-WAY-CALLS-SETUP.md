# Two-Way Conversational Calls Setup

> Ferni can make two-way phone calls where she has real-time conversations with the person on the other end.

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
│   Twilio    │────▶│  WebSocket   │────▶│   LiveKit    │────▶│ Intelligent │
│  (Call +    │◀────│   Bridge     │◀────│    Room      │◀────│   Agent     │
│   Stream)   │     │ (μ-law↔PCM)  │     │              │     │ (Gemini+TTS)│
└─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
       │                   │                    │                    │
       │  Outbound call    │  Audio conversion  │  Real-time audio   │  AI responses
       │  to recipient     │  and bridging      │  distribution      │  with Cartesia
```

## Components

| Component | File | Description |
|-----------|------|-------------|
| Stream Bridge | `src/services/voice/twilio-stream-bridge.ts` | WebSocket server that bridges Twilio ↔ LiveKit |
| Call Service | `src/services/voice/conversational-call.service.ts` | Initiates calls and manages sessions |
| Detection | `src/services/voice/call-detection.service.ts` | Human vs Machine detection |
| Agent | `src/agents/outbound/intelligent-outbound-agent.ts` | AI agent for conversations |
| Routes | `src/api/twilio-routes.ts` | Twilio webhook handlers |

## Local Development Setup

### 1. Install ngrok

```bash
# macOS
brew install ngrok

# Or download from https://ngrok.com/download
```

### 2. Start the UI Server

```bash
# Terminal 1: Start the UI server with Twilio Stream bridge
PORT=3002 TWILIO_STREAM_PORT=8765 npm run ui-server
```

### 3. Expose WebSocket with ngrok

```bash
# Terminal 2: Expose the WebSocket port
ngrok http 8765
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)

### 4. Set Environment Variable

Add to your `.env`:

```bash
# For WebSocket stream (convert https to wss)
TWILIO_STREAM_WEBHOOK_URL=wss://abc123.ngrok-free.app/stream
```

### 5. Run the Test

```bash
# Terminal 3: Test a two-way call
npm run test:call:twoway -- 8012017497 --test-type=checkin
```

## Production Deployment

For production, the WebSocket bridge should run on the GCE instance:

### Option A: Add to Voice Agent Container

Add the stream bridge to the voice agent Docker container:

```dockerfile
# In Dockerfile.agent
EXPOSE 8080 8765
```

Update cloud firewall:

```bash
gcloud compute firewall-rules create allow-twilio-stream \
  --allow tcp:8765 \
  --target-tags=voiceai-agent \
  --description="Allow Twilio WebSocket streams"
```

Then set:
```bash
TWILIO_STREAM_WEBHOOK_URL=wss://34.134.186.63:8765/stream
```

### Option B: Dedicated Stream Server

Deploy a separate container just for the stream bridge. This provides better isolation.

## Test Scenarios

```bash
# Simple test
npm run test:call:twoway -- 8012017497 --test-type=simple

# Check-in call
npm run test:call:twoway -- 8012017497 --test-type=checkin

# Appointment scheduling (for testing with businesses)
npm run test:call:twoway -- 8012017497 --test-type=appointment

# Follow-up call
npm run test:call:twoway -- 8012017497 --test-type=followup
```

## Debugging

### Check Bridge Status

```bash
# In the server logs, look for:
✅ Twilio Stream Bridge initialized
📞 Stream call started
🤖 Dispatching intelligent outbound agent
```

### Common Issues

1. **"WebSocket connection failed"**
   - Ensure ngrok is running and URL is correct
   - Check firewall rules

2. **"No phone participant joined"**
   - Twilio couldn't connect to the room
   - Check LiveKit credentials

3. **"Call failed"**
   - Verify Twilio credentials
   - Check phone number format (E.164: +1XXXXXXXXXX)

## One-Way vs Two-Way Calls

| Feature | One-Way | Two-Way |
|---------|---------|---------|
| Use Case | Messages, reminders, notifications | Conversations, appointments |
| Complexity | Simple | Complex |
| Latency | Pre-recorded | Real-time |
| Cost | Lower | Higher |
| Script | `test-natural-calls.ts` | `test-two-way-call.ts` |

### When to Use Each

**One-Way:**
- "Call my mom and wish her happy birthday"
- "Remind me about the meeting tomorrow"
- "Let my friend know I'm running late"

**Two-Way:**
- "Call my doctor and schedule an appointment"
- "Call the restaurant and make a reservation"
- "Have a conversation with my grandmother"

## Environment Variables

```bash
# Required for both
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Required for two-way calls
TWILIO_STREAM_WEBHOOK_URL=wss://your-server/stream
TWILIO_STREAM_PORT=8765

# LiveKit (for agent rooms)
LIVEKIT_URL=wss://...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

## Next Steps

1. **Set up ngrok** for local testing
2. **Test simple scenario** with your phone
3. **Test appointment scenario** with a real business
4. **Deploy to GCE** for production
