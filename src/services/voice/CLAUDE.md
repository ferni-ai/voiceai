# Voice Services

> **Phone calling and voice communication capabilities.**

## Overview

Voice services handle Ferni's phone calling features:
- Inbound call handling
- Outbound call initiation
- Voice verification
- Phone number bridging

---

## Key Components

### Call Services
| File | Purpose |
|------|---------|
| `conversational-call-service.ts` | Main call orchestration |
| `natural-call-service.ts` | Natural conversation flow |
| `call-detection-service.ts` | Detect call state changes |
| `voice-call.ts` | Voice call management |
| `outbound-call-agent.ts` | Outbound call agent |
| `outbound-call-templates.ts` | Outbound call templates |

### Phone Integration
| File | Purpose |
|------|---------|
| `livekit-phone-bridge.ts` | Bridge LiveKit to PSTN |
| `twilio-stream-bridge.ts` | Twilio stream bridge |
| `twilio-audio-enhance.ts` | Twilio audio enhancement |

### Voice Intelligence
| File | Purpose |
|------|---------|
| `inbound-voice-verification.ts` | Verify caller identity |
| `voice-enrollment.ts` | Enroll user voices |
| `voice-identification.ts` | Voice identification |
| `voice-liveness.ts` | Voice liveness detection |
| `voice-antispoofing.ts` | Anti-spoofing checks |
| `voice-speaker-change.ts` | Detect speaker changes |
| `voice-emotion-correlation.ts` | Voice-emotion correlation |
| `voice-humanization-metrics.ts` | Humanization quality metrics |
| `voice-presence-analytics.ts` | Voice presence analytics |
| `dynamic-voice-parameters.ts` | Adjust voice based on context |
| `cartesia-voice-localization.ts` | Localized voice settings |
| `voice-adaptation.ts` | Voice adaptation over time |
| `voice-profile-store.ts` | Voice profile storage |
| `voice-rate-limit.ts` | Voice API rate limiting |
| `voice-audit-log.ts` | Voice operation audit log |

### Voice Content
| File | Purpose |
|------|---------|
| `ferni-message-generator.ts` | Generate voicemail messages |
| `voice-pack-service.ts` | Voice pack management |
| `voice-sketch-builder.ts` | Voice sketch building |
| `voice-household.ts` | Household voice management |

---

## Usage

```typescript
import { initiateCall } from './conversational-call-service.js';

const call = await initiateCall({
  userId,
  targetPhone: '+1234567890',
  purpose: 'check_in',
  personaId: 'ferni',
});
```

---

## Architecture

```
Incoming Call → LiveKit Phone Bridge → Voice Verification → Agent Session
Outgoing Call → Call Service → Phone Bridge → PSTN → Recipient
```

---

## Integration Points

- **LiveKit**: Real-time voice transport
- **Cartesia**: Text-to-speech
- **Identity**: Voice enrollment data
- **Outreach**: Scheduled call triggers

---

*Last updated: January 2026*
