# Two-Way Outbound Call Fix - Deep Analysis & Plan

> **Status:** In Progress  
> **Date:** December 29, 2024  
> **Problem:** Ferni can make outbound calls and speak, but user responses are not processed

---

## Executive Summary

The two-way calling system has **two separate audio paths** that are conflicting:
1. **TwiML Path** - Twilio plays greeting audio before stream connects
2. **Stream Path** - Local agent tries to speak ANOTHER greeting after stream connects

Additionally, we're not receiving any audio packets from Twilio, suggesting either:
- Twilio isn't sending them (TwiML misconfiguration)
- They're being filtered before reaching our handler
- WebSocket protocol issue

---

## Architecture Overview

### Current Flow (What Happens Today)

```
                                    ┌─────────────────────────────────┐
                                    │     STEP 1: TwiML Greeting      │
                                    │   (Plays BEFORE stream starts)  │
                                    └─────────────┬───────────────────┘
                                                  │
┌───────────┐    Twilio     ┌─────────────────────┴─────────────────────┐
│   User    │◄──────────────│  TwiML: <Say>/<Play> + <Connect><Stream>  │
│   Phone   │    (greeting) └───────────────────────────────────────────┘
└───────────┘                                     
      │                                           
      │                     ┌─────────────────────────────────────────────┐
      │   After <Say> ends  │     STEP 2: Stream Connects                 │
      └────────────────────►│  twilio-stream-bridge.ts receives WebSocket │
                            └────────────────────────────────────────────┬┘
                                                                          │
                            ┌─────────────────────────────────────────────┴┐
                            │     STEP 3: callStarted Event                │
                            │  - Creates phone bridge participant          │
                            │  - Tries GCE dispatch (FAILS)                │
                            │  - Falls back to LOCAL agent                 │
                            └────────────────────────────────────────────┬─┘
                                                                          │
                            ┌─────────────────────────────────────────────┴┐
                            │     STEP 4: Local Agent Starts               │
                            │  - Speaks ANOTHER greeting (PROBLEM!)        │
                            │  - Sets isAgentSpeaking = true               │
                            │  - ALL INBOUND AUDIO FILTERED FOR ~5+ SEC    │
                            │  - Sets isAgentSpeaking = false              │
                            └────────────────────────────────────────────┬─┘
                                                                          │
                            ┌─────────────────────────────────────────────┴┐
                            │     STEP 5: Should Receive User Audio        │
                            │  - Twilio sends 'media' WebSocket messages   │
                            │  - handleMedia() buffers audio               │
                            │  - On silence → transcribe → emit transcript │
                            │                                              │
                            │     ❌ BUT: NO AUDIO PACKETS RECEIVED!       │
                            └─────────────────────────────────────────────┘
```

---

## Identified Issues

### 🔴 CRITICAL Issue 1: No Audio Packets from Twilio

**Symptom:** After Ferni's greeting, logs show ZERO `🎵 Audio packet received` entries.

**Possible Causes:**
1. Twilio stream `track` attribute not set correctly
2. WebSocket connection closed/errored before media flows
3. Media events are arriving but filtered (checked - not this)
4. Twilio only streams during certain phases

**Evidence:**
```
✅ Logs show: "▶️ Stream starting" with callSid  
✅ Logs show: "✅ Local Ferni agent started"
✅ Logs show: "🗣️ Speaking greeting"
❌ NO logs of: "🎵 Audio packet received"
❌ NO logs of: "📝 Transcript received"
```

### 🟡 HIGH Issue 2: Double Greeting Problem

**The user hears TWO greetings:**
1. First: TwiML `<Say>` or `<Play>` (before stream connects)
2. Second: Local agent's `speakToCaller()` (after stream connects)

**Code Evidence:**

`generateStreamTwiml()` in `twilio-stream-bridge.ts`:
```typescript
return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingElement}  <!-- FIRST greeting via Polly/pre-recorded -->
  <Connect>
    <Stream url="...">
```

`startOutboundAgent()` in `outbound-call-agent.ts`:
```typescript
// Small delay then speak greeting
await sleep(800);
const greeting = buildDynamicGreeting(context);
await speakToCaller(state, bridge, greeting);  // SECOND greeting!
```

### 🟡 HIGH Issue 3: isAgentSpeaking Blocks Everything

When the local agent speaks, it sets `isAgentSpeaking = true`, which causes ALL inbound audio to be filtered:

```typescript
// twilio-stream-bridge.ts handleMedia()
if (session.isAgentSpeaking) {
  log.debug({ packetNum }, 'Skipping audio - agent speaking');
  return;  // ALL audio dropped!
}
```

This creates a **10+ second window** where user speech is ignored:
- TwiML greeting: ~3-5 seconds
- Agent greeting: ~5-8 seconds
- Total: User's first response likely filtered!

### 🟠 MEDIUM Issue 4: LiveKit Phone Bridge Incomplete

`livekit-phone-bridge.ts` has a TODO for routing agent audio back:

```typescript
room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
  // Note: This requires LiveKit RTC audio sink which is more complex
  // For now, log that we would send audio back
  log.debug({ trackSid: track.sid }, 'Would route agent audio to Twilio');
});
```

**Impact:** If GCE agent dispatch worked, its audio would NOT get back to the caller.  
**Current Impact:** None - we're using local fallback which bypasses this.

### 🟠 MEDIUM Issue 5: GCE Agent Dispatch Failing

Logs show:
```
❌ Failed to dispatch agent, falling back to local
⚠️ Using local fallback agent
```

This should be investigated, but the local fallback SHOULD work for two-way.

---

## Proposed Solutions

### Solution A: Fix TwiML to Remove Pre-Stream Greeting (RECOMMENDED)

**Rationale:** The stream MUST be connected before we can have a two-way conversation. The TwiML greeting plays BEFORE the stream connects, which is wrong.

**Changes Required:**

1. **`generateStreamTwiml()` - Remove greeting before Connect**
```typescript
// BEFORE (broken)
return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${greetingElement}  <!-- This plays BEFORE stream! -->
  <Connect>
    <Stream url="...">

// AFTER (fixed)
return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${escapeXml(websocketUrl)}" track="both_tracks">
      <Parameter name="roomName" value="${escapeXml(roomName)}"/>
    </Stream>
  </Connect>
</Response>`;
```

2. **`conversational-call.service.ts` - Don't generate Cartesia greeting audio for TwiML**
```typescript
// Remove this block:
// let greetingAudioUrl: string | null = null;
// try { ... generate audio ... }

// Just pass empty greeting:
const twiml = generateStreamTwiml({
  websocketUrl: STREAM_WEBHOOK_URL,
  roomName,
  // NO greeting - agent will speak directly through stream
});
```

3. **Keep `outbound-call-agent.ts` greeting** - This is the ONLY greeting

### Solution B: Add `track="both_tracks"` to Stream Element

**Rationale:** Twilio might not be sending audio because track isn't configured.

```xml
<!-- BEFORE -->
<Stream url="wss://...">

<!-- AFTER -->
<Stream url="wss://..." track="both_tracks">
```

From Twilio docs:
- `inbound_track` - Only caller's voice (default)
- `outbound_track` - Only Twilio's voice
- `both_tracks` - Bidirectional

### Solution C: Fix Silence-Based Filtering

**Rationale:** Even with `isAgentSpeaking`, we should at least SEE the packets coming in.

```typescript
// twilio-stream-bridge.ts handleMedia()
private async handleMedia(session, media): Promise<void> {
  // ALWAYS log packets, even if we're going to filter
  if (!session.audioPacketCount) {
    session.audioPacketCount = 0;
  }
  session.audioPacketCount++;
  
  // Log FIRST, filter SECOND
  if (session.audioPacketCount <= 10 || session.audioPacketCount % 100 === 0) {
    log.info({ 
      callSid: session.callSid, 
      packetNum: session.audioPacketCount,
      track: media.track,
      isAgentSpeaking: session.isAgentSpeaking 
    }, '📦 Media packet');
  }
  
  // NOW filter
  if (media.track !== 'inbound') return;
  if (session.isAgentSpeaking) return;
  
  // Process audio...
}
```

### Solution D: Implement Audio Sink for LiveKit Phone Bridge

**For when GCE agent works:**

```typescript
// livekit-phone-bridge.ts
room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
  if (track.kind !== TrackKind.KIND_AUDIO || participant.identity === participantIdentity) {
    return;
  }
  
  log.info({ participant: participant.identity }, '🔊 Subscribed to agent audio');
  
  // Create audio sink to receive frames
  const audioTrack = track as RemoteAudioTrack;
  
  // Set up frame handler
  audioTrack.on('audioFrame', (frame: AudioFrame) => {
    // Convert frame to buffer
    const samples = new Int16Array(frame.data);
    const buffer = Buffer.from(samples.buffer);
    
    // Send to Twilio via bridge
    twiliobridge.sendAudioToCaller(callSid, buffer);
  });
});
```

---

## Implementation Plan

### Phase 1: Diagnostic (DONE)
✅ Add debug logging to `twilio-stream-bridge.ts`
✅ Deploy to production
⏳ Make test call and analyze logs

### Phase 2: Quick Fix (TRY FIRST)
1. Add `track="both_tracks"` to TwiML Stream element
2. Remove TwiML greeting (let agent speak through stream only)
3. Verify audio packets arrive
4. Deploy and test

### Phase 3: Architecture Fix (IF NEEDED)
1. Consolidate greeting logic (ONE greeting, through stream)
2. Improve `isAgentSpeaking` to not block logging
3. Add explicit track configuration

### Phase 4: Complete LiveKit Integration (FUTURE)
1. Implement proper audio sink in `livekit-phone-bridge.ts`
2. Fix GCE agent dispatch
3. Test full LiveKit path

---

## Test Checklist

After each deployment:

- [ ] Call initiated successfully
- [ ] Stream WebSocket connects
- [ ] `🎧 Stream tracks configured` log shows tracks
- [ ] `📦 Media packet` logs appear when user speaks
- [ ] `🎵 Audio packet received` logs appear (inbound track)
- [ ] `📝 Transcript received` appears after user silence
- [ ] Agent responds to transcript
- [ ] User hears ONLY ONE greeting (not two)
- [ ] Full conversation works

---

## Debug Commands

```bash
# Watch production logs for media events
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="john-bogle-ui" AND textPayload=~"Media packet|Audio packet|Stream tracks|transcript"' --limit=100 --format='table(timestamp,textPayload)' --freshness=30m

# Check for WebSocket errors
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="john-bogle-ui" AND severity>=WARNING AND textPayload=~"WebSocket|stream|twilio"' --limit=50

# Full call flow
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="john-bogle-ui" AND textPayload=~"call|agent|stream"' --limit=200 --format='table(timestamp,textPayload)' --freshness=30m
```

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/services/voice/twilio-stream-bridge.ts` | Add `track="both_tracks"`, improve logging | HIGH |
| `src/services/voice/conversational-call.service.ts` | Remove TwiML greeting | HIGH |
| `src/services/voice/outbound-call-agent.ts` | Keep as single greeting source | - |
| `src/services/voice/livekit-phone-bridge.ts` | Implement audio sink | MEDIUM |
| `src/api/twilio-routes.ts` | No changes needed | - |

---

## Root Cause Summary

The most likely root cause is **TwiML misconfiguration**:

1. The `<Stream>` element doesn't explicitly set `track="both_tracks"`
2. Twilio's default might not be sending inbound audio after the greeting plays
3. The `<Say>` happening BEFORE `<Connect><Stream>` might be putting Twilio in a weird state

Secondary issues:
- Double greeting confuses the call flow
- `isAgentSpeaking` window too aggressive

---

*Last updated: December 29, 2024*
