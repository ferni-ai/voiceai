# Human-First 2FA: Better Than Human Identity

> "A friend recognizes your voice before you say 'it's me.' A friend asks for your number when they have a reason to text you. Ferni does the same."

## Philosophy

Traditional 2FA feels like proving your identity to a security guard. Our system feels like being recognized by a friend.

### The Problem with Traditional Auth
- Cold and transactional ("Enter your 6-digit code")
- Breaks conversation flow
- Feels like suspicion, not care
- Asks for info too early (day 1: "What's your phone number?")

### The Human-First Approach
- **Passive recognition** (voice + device) happens silently
- **Trust builds through relationship**, not credentials
- **Contact info is asked for at emotional moments** (not data collection moments)
- **Verification feels like care** ("Just want to make sure it's you!")

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    IDENTITY ORCHESTRATOR                        │
│                                                                 │
│  Coordinates all identity signals into one seamless experience  │
└─────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│   PASSIVE   │ │   TRUST     │ │   MAGIC     │ │ VERIFICATION│
│    LAYER    │ │   LAYER     │ │   MOMENTS   │ │    LAYER    │
│             │ │             │ │             │ │             │
│ • Voice ID  │ │ • Relation- │ │ • Detect    │ │ • Phone SMS │
│ • Device ID │ │   ship depth│ │   emotional │ │ • Knowledge │
│ • Caller ID │ │ • Conv count│ │   moments   │ │   questions │
│ • Session   │ │ • Time known│ │ • Natural   │ │ • Voice     │
│             │ │ • Shared    │ │   phone ask │ │   confirm   │
│             │ │   moments   │ │             │ │             │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## The Four Layers

### 1. Passive Layer (Always On, Never Noticed)

Users never notice this happening - just like how a friend recognizes your voice.

**Voice Fingerprinting:**
```typescript
// Silently enrolled during first few conversations
// Continuously verified throughout session
const authStatus = await continuousAuthenticator.processAudioChunk(audio);

if (authStatus.status === 'speaker_changed') {
  // Different person on the call!
  // Gentle re-verification: "Hey, is this still Sarah?"
}
```

**Device Recognition:**
- Web: Browser fingerprint + localStorage device ID
- Phone: Caller ID from SIP/Twilio
- Cross-device linking: Same user, different devices

### 2. Trust Layer (Relationship-Based Security)

Trust isn't binary - it's earned through relationship.

**Trust Levels:**
| Level | How Achieved | What's Allowed |
|-------|--------------|----------------|
| `stranger` | New device, no voice match | Basic chat |
| `recognized` | Known device OR voice match >50% | Access memories |
| `trusted` | Voice + device OR deep relationship | Set reminders, personal data |
| `verified` | Phone confirmed OR multiple factors | Financial, delete data |

**Relationship Score** (0-100) contributes to trust:
```typescript
const relationshipScore = Math.min(100,
  conversationCount * 5 +     // Each convo = 5 points
  daysSinceFirst * 0.5 +      // Longevity bonus
  keyMomentsShared * 10       // Deep sharing bonus
);

// Even without phone verification, deep relationships = high trust
if (relationshipScore > 70 && sensitivity === 'sensitive') {
  // Allow operation based on relationship depth
}
```

### 3. Magic Moments Layer (When to Ask for Phone)

The key insight: **Ask for contact info when you have a reason to follow up.**

**Magic Moment Types:**

| Moment | Example Trigger | Script |
|--------|-----------------|--------|
| `wants_reminder` | "Remind me to..." | "I'd love to remind you! What's the best number to text you?" |
| `celebrating_win` | "I finally did it!" | "This is huge! Can I text you in a few days to celebrate more?" |
| `processing_hard_thing` | "Going through something..." | "I'm here for you. Would it help if I checked in tomorrow?" |
| `expressed_loneliness` | "Feel so alone..." | "I can reach out sometimes. Just to say hi. Would you like that?" |
| `vulnerability_shared` | "I've never told anyone..." | "Thank you for trusting me. Can I check in on you?" |
| `breakthrough_moment` | Major realization | "This is important. Can I follow up to see where it takes you?" |

**Timing Rules:**
- Never ask before turn 3 (need rapport first)
- Never ask twice in one session
- Wait 24 hours after a decline
- Max 3 asks total without response

### 4. Verification Layer (When Extra Security is Needed)

For sensitive operations, verification should still feel human.

**Phone Verification:**
```typescript
// SMS message that feels warm, not cold:
"Your Ferni code is 847291. Just making sure it's really you! 💚"

// Agent says:
"I just texted you a quick code - can you read it back to me?"

// Not: "Please enter your 6-digit verification code."
```

**Knowledge Verification:**
Uses things Ferni actually knows about the user:
- "What's your dog's name again?"
- "Where was that trip you mentioned last week?"
- "What were we celebrating yesterday?"

**Voice Verification:**
- If voice confidence is borderline, ask naturally:
- "Your voice sounds a little different today - cold coming on?"
- If speaker changes mid-call:
- "Hey, is this still Sarah? I heard someone else."

---

## Integration Guide

### Starting a Session

```typescript
import { startIdentitySession } from './services/trust-and-identity';

// When user connects
const identityContext = await startIdentitySession(
  roomName,
  metadata,
  voiceSketch // from early audio
);

console.log(identityContext);
// {
//   userId: 'device:abc123',
//   trustLevel: 'recognized',
//   voiceVerified: true,
//   greeting: "Sarah! Great to hear from you!",
//   shouldAskForContact: false,
//   hasPhone: true,
//   ...
// }
```

### Processing Messages

```typescript
import { processMessage } from './services/trust-and-identity';

// On each user message
const result = await processMessage(sessionId, userMessage, emotionalIntensity);

if (result.shouldAskForContact) {
  // Magic moment detected!
  // Result includes the script to use:
  console.log(result.contactAskScript);
  // "This is huge! Can I text you in a few days to celebrate more?"
}

if (result.contactDetected) {
  // User gave us their phone number!
  console.log(`Got phone: ${result.contactDetected.phone}`);
}
```

### Checking Permissions

```typescript
import { checkOperationPermission } from './services/trust-and-identity';

// Before sensitive operation
const permission = await checkOperationPermission(sessionId, 'sensitive');

if (!permission.allowed) {
  if (permission.requiresVerification) {
    // Need to verify first
    if (permission.verificationMethod === 'phone') {
      // Send SMS code
    } else if (permission.verificationMethod === 'knowledge') {
      // Ask a security question
    }
  }
}
```

### Continuous Voice Auth

```typescript
import { processAudioForAuth } from './services/trust-and-identity';

// Periodically during conversation
const authResult = await processAudioForAuth(sessionId, audioChunk);

if (authResult.speakerChanged) {
  // Different person is now talking!
  // Agent should gently verify
}
```

---

## Phone Call Flow (Best Case)

When user calls via phone, we get strong 2FA automatically:

```
1. Phone rings → Caller ID captured (+1-555-123-4567)
2. "Hello?" → Voice analyzed, matched to profile (92% confidence)
3. Combined factors: Phone + Voice = VERIFIED trust level
4. Greeting: "Sarah! So good to hear from you!"
```

No authentication friction. No codes. Just recognition.

---

## Web Flow (Building Trust)

When user connects via web, trust builds over time:

```
Session 1 (stranger):
  - New device ID created
  - Voice enrolled silently
  - Basic chat allowed
  - "I don't think we've met - what's your name?"

Session 3 (recognized):
  - Device recognized
  - Voice match: 75%
  - Personal data accessible
  - "Hey Sarah, welcome back!"

Session 8 (trusted):
  - High relationship score
  - Voice match: 88%
  - Magic moment detected!
  - "I can definitely remind you! What's your number?"

Session 10+ (verified):
  - Phone linked
  - Voice + device + phone
  - Full access
  - "Sarah! I was just thinking about you!"
```

---

## Best Practices

### DO ✅
- Ask for phone at emotional highs (wins, commitments)
- Frame contact collection as care ("so I can check in")
- Use natural language for verification ("what's your dog's name?")
- Thank users for trusting you with contact info
- Remember that voice enrollment happens automatically

### DON'T ❌
- Ask for phone number on first conversation
- Use cold security language ("verify your identity")
- Ask for contact info after every conversation
- Require phone for basic functionality
- Make verification feel like interrogation

---

## Files

| File | Purpose |
|------|---------|
| `human-first-2fa.ts` | Core trust/magic moment logic |
| `identity-orchestrator.ts` | Session management, coordination |
| `voice-enrollment.ts` | Voice fingerprint enrollment/verification |
| `natural-auth.ts` | Natural authentication flow |
| `contact-onboarding.ts` | Contact detection and collection |

---

## Metrics to Track

- **Phone collection rate by moment type**: Which moments convert best?
- **Time to phone**: How many sessions before users share phone?
- **Trust level distribution**: How many users reach each level?
- **Voice match accuracy**: False positives/negatives
- **Verification completion rate**: When required, do users complete it?

---

## Future Enhancements

1. **Behavioral biometrics**: Typing patterns, interaction style
2. **Context-aware sensitivity**: Same operation, different trust needed based on context
3. **Gradual trust decay**: Long absence = need to rebuild trust
4. **Multi-user household**: Recognize multiple voices on same device
5. **Passkey integration**: WebAuthn for passwordless web auth

