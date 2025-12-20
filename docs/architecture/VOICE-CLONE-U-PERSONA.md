# "U" Persona - Voice Clone Feature

> **Your voice, your assistant, calling on your behalf.**

## Overview

The "U" Persona lets users clone their own voice and have Ferni make calls AS them. This is powerful for:
- Calling businesses on hold (Ferni waits, you don't)
- Making awkward calls (cancellations, complaints, difficult conversations)
- Delegating routine calls (appointment confirmations, RSVPs)
- Accessibility (for users who have difficulty speaking)

## User Journey

```
1. User opens Voice Settings
2. Records 10-second voice sample
3. System creates Cartesia voice clone
4. User configures "U" persona behavior
5. User can now say: "Call the dentist as me and reschedule my appointment"
```

---

## Phase 1: Voice Recording & Cloning

### 1.1 Voice Recording UI

**Location:** `apps/web/src/ui/voice-clone.ui.ts`

```typescript
// Recording flow
1. Show "Create Your Voice Clone" card
2. User clicks "Start Recording"
3. Show waveform visualization during 10-second recording
4. Play back for approval
5. If approved, upload to backend
6. Show progress: "Creating your voice..."
7. Success: "Your voice is ready! Try it out."
```

**UI Components Needed:**
- `VoiceRecorder` - Handles MediaRecorder API, shows waveform
- `VoicePlayback` - Plays back recording for approval
- `VoiceCloneProgress` - Shows cloning progress with friendly messages
- `VoiceCloneSettings` - Configuration after clone is created

**Recording Requirements:**
- Minimum 10 seconds of speech
- Clear audio (warn if background noise detected)
- Prompt user with text to read (ensures varied phonemes)
- Sample rate: 44.1kHz (Cartesia requirement)
- Format: WAV or MP3

**Sample Script to Read:**
```
"Hi, this is [name]. I'm calling to check on my appointment.
The weather today is beautiful, isn't it? 
I really appreciate you taking the time to help me with this.
Looking forward to speaking with you soon!"
```
(~10 seconds, covers various phonemes and natural speech patterns)

### 1.2 Voice Upload API

**Location:** `src/api/voice-clone-routes.ts`

```typescript
// Endpoints
POST /api/voice-clone/upload
  - Receives audio file (multipart/form-data)
  - Validates audio quality
  - Stores temporarily in GCS
  - Returns upload ID

POST /api/voice-clone/create
  - Takes upload ID
  - Calls Cartesia Voice Clone API
  - Stores voice ID in user profile
  - Returns clone status

GET /api/voice-clone/status/:userId
  - Returns clone status and voice ID

DELETE /api/voice-clone/:userId
  - Deletes voice clone from Cartesia
  - Removes from user profile
```

### 1.3 Cartesia Voice Clone Integration

**Location:** `src/services/voice-clone/cartesia-clone.ts`

```typescript
import { CartesiaClient } from '@cartesia/cartesia-js';

interface VoiceCloneResult {
  voiceId: string;
  name: string;
  status: 'ready' | 'processing' | 'failed';
  createdAt: Date;
}

async function createVoiceClone(params: {
  userId: string;
  userName: string;
  audioUrl: string;
}): Promise<VoiceCloneResult> {
  const client = new CartesiaClient({ apiKey: CARTESIA_API_KEY });
  
  // Cartesia Voice Clone API
  const voice = await client.voices.clone({
    name: `ferni_user_${params.userId}`,
    description: `Cloned voice for ${params.userName}`,
    // Audio file URL or base64
    enhance: true, // Improve audio quality
  });
  
  return {
    voiceId: voice.id,
    name: voice.name,
    status: 'ready',
    createdAt: new Date(),
  };
}
```

**Cartesia API Notes:**
- Voice cloning endpoint: `POST /voices/clone`
- Requires: audio file (10+ seconds recommended)
- Returns: voice ID that can be used with TTS
- Cost: Check Cartesia pricing for voice cloning

### 1.4 Voice Clone Storage

**Location:** `src/types/user-profile.ts` (extend existing)

```typescript
interface UserProfile {
  // ... existing fields
  
  voiceClone?: {
    voiceId: string;
    cartesiaVoiceId: string;
    name: string;
    createdAt: Date;
    lastUsedAt?: Date;
    status: 'active' | 'disabled' | 'expired';
    
    // User preferences for their clone
    preferences: {
      // How formal should the clone sound?
      formality: 'casual' | 'professional' | 'match_context';
      
      // Default greeting style
      greeting: string; // e.g., "Hi, this is Sarah calling"
      
      // Signature phrases to use
      signaturePhrases?: string[];
      
      // Things to never say
      avoidPhrases?: string[];
      
      // Default persona traits when acting as user
      traits: {
        patience: 1-5;      // How patient on hold
        assertiveness: 1-5; // How firm in requests
        friendliness: 1-5;  // How warm/personable
      };
    };
  };
}
```

---

## Phase 2: "U" Persona Configuration

### 2.1 Configuration UI

**Location:** `apps/web/src/ui/u-persona-config.ui.ts`

**Settings Screen Sections:**

```
┌─────────────────────────────────────────────────────┐
│  👤 Your Voice Clone Settings                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  🎙️ Voice Sample                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │  [▶️ Play Sample]  [🔄 Re-record]           │   │
│  │  Created: Dec 20, 2024                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  📝 How Should I Introduce Myself?                 │
│  ┌─────────────────────────────────────────────┐   │
│  │ "Hi, this is Sarah calling about..."        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  🎭 Personality When Acting As You                 │
│  ┌─────────────────────────────────────────────┐   │
│  │ Patience Level     [====|======] Medium     │   │
│  │ Assertiveness      [========|==] High       │   │
│  │ Friendliness       [=======|===] Warm       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  🚫 Things I Never Say (optional)                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ + Add phrase to avoid                       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ✨ Signature Phrases (optional)                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ "I really appreciate your help"             │   │
│  │ "That would be wonderful, thank you"        │   │
│  │ + Add phrase                                │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  📞 Test Your Voice                                │
│  [Call My Phone With a Sample Message]             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 2.2 Configuration API

**Location:** `src/api/u-persona-routes.ts`

```typescript
// Endpoints
GET /api/u-persona/config/:userId
  - Returns current U persona configuration

PUT /api/u-persona/config/:userId
  - Updates configuration
  - Body: { greeting, traits, avoidPhrases, signaturePhrases }

POST /api/u-persona/test-call
  - Makes a test call to user's phone using their cloned voice
  - Good for verification and demos
```

---

## Phase 3: "U" Persona Implementation

### 3.1 Persona Bundle

**Location:** `src/personas/bundles/u-persona/`

```
u-persona/
├── identity/
│   └── system-prompt.md       # Dynamic - loaded with user config
├── content/
│   └── behaviors/
│       ├── call-handling.json # How to handle business calls
│       └── user-context.json  # User's preferences & style
├── voice/
│   └── voice-config.json      # Points to user's Cartesia voice ID
└── persona.manifest.json
```

**System Prompt Template:**
```markdown
# You Are Acting As {userName}

You are making a call ON BEHALF of {userName}. You should speak AS them, 
using their voice and their personality.

## Your Identity for This Call
- Name: {userName}
- Calling about: {callPurpose}
- Phone number to reference: {userPhone}

## How {userName} Speaks
{userStyleNotes}

## {userName}'s Preferences
- Greeting: "{greeting}"
- Patience level: {patienceLevel}/5
- Assertiveness: {assertiveness}/5
- Friendliness: {friendliness}/5

## Signature Phrases to Use
{signaturePhrases}

## Never Say
{avoidPhrases}

## Important Rules
1. You ARE {userName} for this call - use first person
2. If asked to verify identity, use the info provided
3. Stay on task - accomplish the call purpose
4. Be polite but get the job done
5. If on hold, wait patiently and re-engage when someone returns
6. End with a clear confirmation of what was accomplished

## Call Purpose
{callPurpose}

## Context
{additionalContext}
```

### 3.2 Voice Configuration

**Location:** `src/personas/u-persona/voice-config.ts`

```typescript
interface UPersonaVoiceConfig {
  // Dynamically loaded per-user
  cartesiaVoiceId: string;
  
  // Emotion settings (more neutral than Ferni)
  defaultEmotion: 'neutral' | 'friendly' | 'professional';
  
  // Speed (match user's natural pace if known)
  defaultSpeed: number; // 0.9-1.1
}

async function getUPersonaVoiceConfig(userId: string): Promise<UPersonaVoiceConfig> {
  const profile = await getUserProfile(userId);
  
  if (!profile.voiceClone?.cartesiaVoiceId) {
    throw new Error('User has not created a voice clone');
  }
  
  return {
    cartesiaVoiceId: profile.voiceClone.cartesiaVoiceId,
    defaultEmotion: profile.voiceClone.preferences.formality === 'professional' 
      ? 'professional' 
      : 'friendly',
    defaultSpeed: 1.0,
  };
}
```

### 3.3 Call Tool Extension

**Location:** `src/tools/domains/telephony/call-as-user.ts`

```typescript
// New tool: callAsUser
llm.tool({
  description: `Make a phone call AS the user, using their cloned voice. 
Use this when the user asks you to call someone on their behalf.
Examples:
- "Call the dentist and cancel my appointment"
- "Can you call Comcast and complain about my bill?"
- "Wait on hold with the airline for me"`,
  
  parameters: z.object({
    phoneNumber: z.string().describe('Phone number to call'),
    purpose: z.string().describe('What the call is about'),
    specificRequests: z.array(z.string()).optional()
      .describe('Specific things to accomplish'),
    context: z.string().optional()
      .describe('Additional context (account numbers, dates, etc.)'),
  }),
  
  execute: async ({ phoneNumber, purpose, specificRequests, context }) => {
    // 1. Check if user has voice clone
    // 2. Load U persona with user's config
    // 3. Make call using user's cloned voice
    // 4. Report back results
  },
});
```

---

## Phase 4: Call Flow

### 4.1 Outbound Call as User

```
User: "Call my dentist and reschedule my cleaning"

Ferni: "I'll call them as you. What's the number?"

User: "555-123-4567"

Ferni: "Got it. I'll call, introduce myself as you, and reschedule. 
       What dates work for you?"

User: "Anytime next week except Tuesday"

Ferni: "Perfect. I'll call now and text you when I'm done."

[Ferni makes call using user's cloned voice]

"Hi, this is Sarah Johnson calling. I need to reschedule my 
dental cleaning... Yes, anytime next week except Tuesday works... 
Thursday at 2pm? That's perfect. Thank you so much!"

[Call ends]

Ferni: "Done! Rescheduled your cleaning for Thursday at 2pm. 
       I'll add it to your calendar."
```

### 4.2 Hold Handling

**Location:** `src/services/call-handling/hold-handler.ts`

```typescript
// Special logic for when U persona is on hold
interface HoldHandlerConfig {
  maxWaitMinutes: number;      // Default: 30
  checkInIntervalSeconds: 60;  // Notify user every 60 seconds
  abandonAfterMinutes?: number; // Optional auto-hang-up
}

// While on hold:
// 1. Detect hold music/messages
// 2. Periodically check if human returned
// 3. Send status updates to user
// 4. When human returns, re-engage as user
```

### 4.3 Result Reporting

After call completes, report back to user:

```typescript
interface CallAsUserResult {
  success: boolean;
  summary: string;           // What was accomplished
  duration: number;          // How long the call took
  holdTime?: number;         // Time spent on hold
  nextSteps?: string[];      // Follow-up actions needed
  calendarEvent?: {          // If appointment was made
    title: string;
    date: Date;
    location?: string;
  };
}
```

---

## Phase 5: Safety & Privacy

### 5.1 Consent & Disclosure

**Recording Consent:**
- User explicitly consents when recording voice
- Terms explain voice will be used to make calls
- User can delete voice clone at any time

**Call Disclosure (Important!):**
Some jurisdictions require disclosure that a call is AI-generated.
Options:
1. **Opt-in disclosure:** "By the way, I'm using an AI assistant to make this call"
2. **On-request only:** Only disclose if asked "Is this an AI?"
3. **No disclosure:** User preference (with legal disclaimer)

**Recommended approach:** Default to disclosure in opening for business calls.

### 5.2 Abuse Prevention

```typescript
// Rate limiting
const CALL_LIMITS = {
  perHour: 5,
  perDay: 20,
  perMonth: 100,
};

// Blocked number types
const BLOCKED_DESTINATIONS = [
  /^911$/,           // Emergency
  /^988$/,           // Suicide hotline
  /^1-800-/,         // Some toll-free patterns
  // ... other sensitive numbers
];

// Content filtering
// Prevent calls for:
// - Fraud/scam purposes
// - Harassment
// - Impersonation with malicious intent
```

### 5.3 Voice Clone Security

```typescript
// Voice clone storage
- Cartesia stores the voice model (not us)
- We only store the voice ID reference
- Voice ID is tied to user account
- Cannot be transferred or shared
- Auto-expires after 1 year of inactivity
- User can delete at any time
```

---

## Phase 6: Subscription & Pricing

### 6.1 Feature Tiers

| Feature | Free | Friend ($9.99) | Partner ($19.99) |
|---------|------|----------------|------------------|
| Voice Clone | ❌ | ✅ | ✅ |
| Calls/month | 0 | 10 | 50 |
| Hold waiting | ❌ | 15 min max | 60 min max |
| Priority queue | ❌ | ❌ | ✅ |

### 6.2 Usage Tracking

```typescript
interface VoiceCloneUsage {
  userId: string;
  month: string; // "2024-12"
  callsThisMonth: number;
  minutesThisMonth: number;
  holdMinutesThisMonth: number;
}
```

---

## Implementation Roadmap

### Sprint 1: Voice Recording & Cloning (1 week)
- [ ] Voice recording UI component
- [ ] Audio quality validation
- [ ] Cartesia voice clone API integration
- [ ] Voice clone storage in user profile
- [ ] Basic test call functionality

### Sprint 2: U Persona Configuration (1 week)
- [ ] Configuration UI
- [ ] Settings API endpoints
- [ ] U persona bundle structure
- [ ] Dynamic system prompt loading

### Sprint 3: Call Integration (1 week)
- [ ] `callAsUser` tool implementation
- [ ] Voice config loading from user profile
- [ ] Call result reporting
- [ ] Calendar integration for appointments

### Sprint 4: Hold Handling & Polish (1 week)
- [ ] Hold music detection
- [ ] Status updates during hold
- [ ] User notifications
- [ ] Edge cases and error handling

### Sprint 5: Safety & Launch (1 week)
- [ ] Rate limiting
- [ ] Content filtering
- [ ] Legal disclosures
- [ ] Usage tracking
- [ ] Documentation

---

## Technical Requirements

### Cartesia API
- Voice cloning endpoint access (may require special tier)
- Estimated cost: ~$0.10-0.50 per voice clone
- TTS cost: ~$0.01 per 1000 characters

### Frontend
- MediaRecorder API support
- Web Audio API for waveform visualization
- File upload handling

### Backend
- GCS bucket for temporary audio storage
- Firestore for voice clone metadata
- Rate limiting middleware

### Voice Agent
- Dynamic voice loading per-call
- U persona context injection
- Hold state management

---

## Open Questions

1. **Cartesia voice cloning availability** - Need to verify API access and pricing
2. **Legal requirements** - Per-state/country disclosure requirements
3. **Hold detection accuracy** - How reliable is hold music detection?
4. **Voice quality** - How good is 10-second clone vs longer samples?
5. **User expectations** - How close to "perfect" clone do users expect?

---

## Success Metrics

- Voice clone creation rate (% of eligible users)
- Call completion rate
- User satisfaction with voice quality
- Average hold time saved
- NPS for feature
- Retention impact on subscribers

---

## Appendix: Sample Flows

### A. First-Time Setup

```
User: "Can you call people for me?"

Ferni: "I'd love to! First, let me create a voice that sounds like you.
       It takes about 10 seconds - would you like to do that now?"

User: "Sure"

Ferni: "Great! When you're ready, read this sentence clearly:
       'Hi, this is [your name] calling to check on my appointment.
       The weather today is beautiful. Thank you for your help.'
       
       Ready? [Start Recording]"

[User records]

Ferni: "Perfect! Let me create your voice... 
       [Creating voice...]
       Done! Would you like to hear how it sounds?"

User: "Yes"

Ferni: [Plays back sample in user's cloned voice]
       "How's that? If you want to re-record, just let me know."

User: "That's great!"

Ferni: "Awesome! Now I can make calls as you. Just tell me who to call
       and what you need, and I'll handle it."
```

### B. Making a Call

```
User: "Call Comcast and dispute my last bill - it was $50 too high"

Ferni: "I'll call Comcast as you and dispute the $50 overcharge.
       Want me to be firm or friendly about it?"

User: "Be firm but polite"

Ferni: "Got it. Calling now - I'll text you when I'm done."

[Makes call as user, waits on hold, handles dispute]

Ferni: "Done! Good news - they agreed to credit $50 to your next bill.
       I got a confirmation number: ABC123. They said it'll show up
       in 2-3 business days."

User: "Amazing, thank you!"
```

