# Voice Clone API Research

> Deep research into voice cloning APIs for the "U" Persona feature

**Date:** December 2024  
**Status:** Research Complete  
**Recommendation:** Use Cartesia Instant Voice Cloning (we're already integrated)

---

## Executive Summary

| Provider | Instant Clone | Min Audio | Cost | Latency | We Use? |
|----------|--------------|-----------|------|---------|---------|
| **Cartesia** | ✅ Yes | 3-10 sec | Free create, 1 credit/char | 90ms TTFA | ✅ Current |
| ElevenLabs | ✅ Yes | 30 sec | $5-22/mo | ~300ms | ❌ |
| PlayHT | ✅ Yes | 30 sec | $29/mo | ~200ms | ❌ |
| Resemble.AI | ✅ Yes | 10 sec | $0.006/sec | ~200ms | ❌ |

**Recommendation:** Stick with **Cartesia** - we're already integrated, instant cloning is free, and they have the lowest latency (90ms) which is critical for real-time calls.

---

## Cartesia (Current Provider) - Detailed Analysis

### Voice Cloning Options

#### 1. Instant Voice Cloning ✅ (Recommended for "U" Persona)

| Attribute | Value |
|-----------|-------|
| **Minimum Audio** | 3 seconds |
| **Optimal Audio** | 10 seconds |
| **Maximum Recommended** | 10 seconds (longer doesn't improve quality) |
| **Creation Cost** | FREE |
| **TTS Cost** | 1 credit per character |
| **Time to Create** | Instant (~1-2 seconds) |
| **Quality** | High (captures voice characteristics, accent, style) |

**Best Practices:**
- Use 10-second sample for best similarity/quality balance
- Record in quiet environment (clone captures background noise)
- Maintain natural pacing (no long pauses - they get replicated)
- Read a script with varied phonemes
- Record in target language

**Modes:**
- `similarity` - Maximizes resemblance to original voice
- `stability` - Studio-quality output, may be less similar

#### 2. Pro Voice Cloning (PVC) ❌ (Overkill for our use case)

| Attribute | Value |
|-----------|-------|
| **Minimum Audio** | 30 minutes |
| **Optimal Audio** | 2-3 hours |
| **Creation Cost** | 1,000,000 credits (~$100-500) |
| **TTS Cost** | 1.5 credits per character |
| **Time to Create** | ~1 hour training |
| **Quality** | Highest (captures exact nuances, accent, style) |

**Not recommended for "U" Persona because:**
- Requires hours of audio from users (unrealistic)
- High cost per voice clone
- Overkill for occasional calls

### API Integration

#### Python SDK

```bash
pip install cartesia
```

```python
from cartesia import Cartesia
import os

client = Cartesia(api_key=os.getenv("CARTESIA_API_KEY"))

# Clone a voice from audio file
with open("user_voice_sample.wav", "rb") as audio_file:
    cloned_voice = client.voices.clone(
        clip=audio_file,
        name="user_voice_abc123",
        language="en",
        mode="similarity",  # or "stability"
        enhance=True,       # Clean/denoise audio
        description="Cloned voice for user ABC"
    )
    
voice_id = cloned_voice.id  # Save this!
```

#### REST API (What we'd use in Node.js)

```typescript
// Clone voice
const formData = new FormData();
formData.append('clip', audioBlob, 'voice_sample.wav');
formData.append('name', `ferni_user_${userId}`);
formData.append('language', 'en');
formData.append('mode', 'similarity');
formData.append('enhance', 'true');

const response = await fetch('https://api.cartesia.ai/voices/clone/clip', {
  method: 'POST',
  headers: {
    'X-API-Key': CARTESIA_API_KEY,
    'Cartesia-Version': '2024-06-10',
  },
  body: formData,
});

const { id: voiceId } = await response.json();
```

```typescript
// Use cloned voice for TTS
const ttsResponse = await fetch('https://api.cartesia.ai/tts/bytes', {
  method: 'POST',
  headers: {
    'X-API-Key': CARTESIA_API_KEY,
    'Cartesia-Version': '2024-06-10',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model_id: 'sonic-3-latest',
    voice: {
      mode: 'id',
      id: voiceId,  // User's cloned voice ID
    },
    transcript: "Hi, this is John calling about my appointment...",
    output_format: {
      container: 'mp3',
      sample_rate: 44100,
    },
  }),
});
```

#### Delete Voice Clone

```typescript
await fetch(`https://api.cartesia.ai/voices/${voiceId}`, {
  method: 'DELETE',
  headers: {
    'X-API-Key': CARTESIA_API_KEY,
    'Cartesia-Version': '2024-06-10',
  },
});
```

### Pricing Breakdown

**Current Ferni Pricing Tier:** Pro ($5/month) = 100,000 credits

| Action | Credits | Cost at Pro Tier |
|--------|---------|------------------|
| Create instant clone | 0 | FREE |
| TTS per character | 1 | ~$0.00005 |
| 100-word message (~500 chars) | 500 | ~$0.025 |
| 5-minute call (~3000 chars) | 3000 | ~$0.15 |

**Subscription Tiers:**

| Tier | Monthly | Credits | Instant Clone | Pro Clone |
|------|---------|---------|---------------|-----------|
| Free | $0 | 20,000 | ✅ | ❌ |
| Pro | $5 | 100,000 | ✅ | ❌ |
| Startup | $49 | 1,250,000 | ✅ | ✅ |
| Scale | $299 | 8,000,000 | ✅ | ✅ |

**Recommendation:** Stay on Pro tier initially. 100k credits = ~200 five-minute calls per month.

### Audio Requirements

| Requirement | Value |
|-------------|-------|
| **Format** | WAV, MP3, OGG, FLAC |
| **Sample Rate** | 22,050 Hz minimum (44,100 Hz recommended) |
| **Channels** | Mono preferred |
| **Duration** | 10 seconds optimal |
| **Quality** | Clear speech, minimal background noise |

### Latency Performance

| Model | Time to First Audio | Use Case |
|-------|---------------------|----------|
| Sonic-3 | 90ms | Standard real-time |
| Sonic Turbo | 40ms | Ultra-low latency |

We're already using `sonic-3-latest` which is ideal for calls.

---

## Alternative Providers (For Reference)

### ElevenLabs

**Pros:**
- Excellent voice quality
- Good emotion control
- Wide language support

**Cons:**
- Higher latency (~300ms)
- More expensive
- 30 second minimum for cloning
- API more complex

**Pricing:**
- Starter: $5/mo - 30k characters, instant clone
- Creator: $22/mo - 100k characters, professional clone

### PlayHT

**Pros:**
- Good quality
- Simple API

**Cons:**
- Higher latency (~200ms)
- More expensive
- 30 second minimum

**Pricing:**
- Creator: $29/mo - includes voice cloning

### Resemble.AI

**Pros:**
- High quality cloning
- Good for professional use
- 10 second minimum

**Cons:**
- Higher cost
- More complex workflow
- Less real-time focused

**Pricing:**
- Pay-per-use: $0.006/second of generated audio

---

## Implementation Recommendations

### Phase 1: MVP Voice Cloning

**Use:** Cartesia Instant Voice Cloning

**Flow:**
1. User records 10-second sample in web UI
2. Upload to our backend
3. Call Cartesia clone API
4. Store returned `voice_id` in user profile
5. Use for calls via our existing TTS pipeline

**Code Changes Required:**

1. **New API Route:** `POST /api/voice-clone/create`
   - Accept audio file upload
   - Validate audio (duration, format, quality)
   - Call Cartesia clone API
   - Store voice ID in user profile

2. **New API Route:** `GET /api/voice-clone/status`
   - Return current clone status and voice ID

3. **New API Route:** `DELETE /api/voice-clone`
   - Delete from Cartesia
   - Remove from user profile

4. **Modify voice-call.ts:**
   - Accept optional `voiceId` parameter
   - Use user's cloned voice instead of persona voice

5. **New UI Component:** `VoiceRecorder`
   - MediaRecorder API
   - Waveform visualization
   - 10-second timer
   - Playback for approval

### Phase 2: Quality Improvements

1. **Audio Quality Validation**
   - Check for background noise (Web Audio API)
   - Warn user if quality is poor
   - Suggest re-recording

2. **Voice Preview**
   - Generate short sample with cloned voice
   - Let user hear how they sound
   - Option to re-record

3. **Multiple Samples**
   - Allow recording multiple 10-sec clips
   - Combine for better quality
   - Cartesia supports mixing voice embeddings

---

## Technical Architecture

### Voice Clone Storage

```typescript
// In UserProfile
voiceClone?: {
  cartesiaVoiceId: string;      // From Cartesia API
  createdAt: Date;
  lastUsedAt?: Date;
  status: 'active' | 'disabled';
  
  // Metadata for debugging
  sampleDuration: number;       // Seconds
  sampleQualityScore?: number;  // 0-1 if we compute it
};
```

### API Response Types

```typescript
// Clone creation response from Cartesia
interface CartesiaVoiceCloneResponse {
  id: string;                   // Voice ID to use
  name: string;
  description: string;
  language: string;
  created_at: string;
  is_public: boolean;
}

// Our API response
interface VoiceCloneResult {
  success: boolean;
  voiceId?: string;
  error?: string;
  previewUrl?: string;  // URL to hear sample
}
```

### Error Handling

| Error | Cause | User Message |
|-------|-------|--------------|
| Audio too short | < 3 seconds | "Recording too short. Try for at least 10 seconds." |
| Poor quality | High noise | "Too much background noise. Try a quieter spot." |
| API limit | Rate limited | "Give it a moment and try again." |
| Clone failed | Cartesia error | "Couldn't create your voice. Try re-recording." |

---

## Security & Privacy

### Data Handling

1. **Audio Storage:**
   - Temporary: Store in GCS with 24-hour expiry
   - After cloning: Delete original audio
   - Only store voice ID reference

2. **Voice ID Security:**
   - Voice IDs are user-specific
   - Cannot be transferred between accounts
   - Encrypted at rest in Firestore

3. **Deletion:**
   - User can delete voice clone anytime
   - We call Cartesia DELETE API
   - Remove all references from our DB

### Consent Flow

```
1. User clicks "Create Voice Clone"
2. Show consent dialog:
   "Your voice recording will be used to create a voice 
    clone that can make calls on your behalf. 
    
    - Recording is processed by Cartesia AI
    - Voice clone is linked to your account only
    - You can delete it anytime
    
    [I Understand] [Cancel]"
3. Only proceed if user consents
4. Store consent timestamp
```

### Legal Considerations

1. **Recording Consent:**
   - User explicitly opts in
   - Clear explanation of use
   - Easy deletion option

2. **Call Disclosure:**
   - Some jurisdictions require disclosure
   - Consider: "This call is being made by an AI assistant on behalf of [name]"
   - Make disclosure configurable per user

3. **Terms of Service:**
   - Update ToS to cover voice cloning
   - Prohibit impersonation/fraud
   - Right to revoke for abuse

---

## Testing Plan

### Unit Tests

```typescript
describe('Voice Clone Service', () => {
  it('should create voice clone from valid audio', async () => {
    const audio = loadTestAudio('10sec_clear_speech.wav');
    const result = await createVoiceClone(userId, audio);
    expect(result.success).toBe(true);
    expect(result.voiceId).toBeDefined();
  });

  it('should reject audio shorter than 3 seconds', async () => {
    const audio = loadTestAudio('2sec_speech.wav');
    const result = await createVoiceClone(userId, audio);
    expect(result.success).toBe(false);
    expect(result.error).toContain('too short');
  });

  it('should use cloned voice for TTS', async () => {
    const audio = await synthesizeWithVoice(voiceId, 'Hello world');
    expect(audio.length).toBeGreaterThan(0);
  });
});
```

### Integration Tests

1. Full recording → cloning → TTS flow
2. Voice deletion and cleanup
3. Rate limiting behavior
4. Error recovery

### Manual Testing

1. Record voice in quiet room → clone → verify similarity
2. Record voice with background noise → verify warning
3. Make test call with cloned voice → verify naturalness
4. Delete clone → verify removed from Cartesia

---

## Timeline Estimate

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **Research** | ✅ Complete | This document |
| **Backend API** | 3 days | Clone routes, storage, Cartesia integration |
| **Frontend UI** | 4 days | Recording component, settings panel |
| **Integration** | 2 days | Wire up to existing call system |
| **Testing** | 2 days | Unit tests, integration tests, manual QA |
| **Polish** | 2 days | Error handling, edge cases, UX refinements |
| **Total** | ~2 weeks | MVP voice clone feature |

---

## Open Questions

1. **Should we require voice verification?**
   - Play back clone and ask "Does this sound like you?"
   - Could prevent accidental bad clones

2. **How to handle failed clones?**
   - Auto-retry with enhanced=true?
   - Suggest re-recording?

3. **Should clones expire?**
   - Auto-delete after X months of inactivity?
   - Or keep forever until user deletes?

4. **Multiple voice clones?**
   - One per user? Or allow multiple?
   - Use case: "professional" vs "casual" voice

---

## References

- [Cartesia Voice Cloning Docs](https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices)
- [Cartesia Pro Voice Cloning](https://docs.cartesia.ai/build-with-cartesia/capability-guides/clone-voices-pro)
- [Cartesia Python SDK](https://github.com/cartesia-ai/cartesia-python)
- [Cartesia API Reference](https://docs.cartesia.ai/)
- [Our Voice IDs Config](../src/config/voice-ids.ts)
- [Our Voice Registry](../src/personas/voice-registry.ts)

