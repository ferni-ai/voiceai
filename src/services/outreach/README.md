# Proactive Outreach System

> **"A thoughtful friend who checks in, not a bot that sends notifications"**

This system enables Ferni's team of AI agents to proactively reach out to users through calls, texts, and emails in ways that feel genuinely human.

## Quick Start

```typescript
import { initializeOutreachSystem, triggerOutreach } from './services/outreach';

// Start the system (do this once at app startup)
initializeOutreachSystem();

// Trigger an outreach
triggerOutreach({
  type: 'commitment_check',
  userId: 'user-123',
  priority: 'medium',
  reason: 'User committed to working out this morning',
  commitment: 'morning workout',
});
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    OUTREACH SYSTEM                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  TRIGGERS         DECISION ENGINE         DELIVERY          │
│  ────────         ───────────────         ────────          │
│  • Commitment  →  • Rate limiting    →   • SMS             │
│  • Emotional   →  • Timing check     →   • Email           │
│  • Milestone   →  • Persona select   →   • Phone Call      │
│  • Thinking    →  • Channel select   →   • Voice Message   │
│                   • Message generate                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Decision Engine (`decision-engine.ts`)

The brain that decides **when**, **why**, **who**, and **how** to reach out.

```typescript
import { getOutreachDecisionEngine } from './services/outreach';

const engine = getOutreachDecisionEngine();

// Add a trigger
engine.addTrigger({
  type: 'commitment_check',
  userId: 'user-123',
  priority: 'medium',
  reason: 'Check on workout',
  commitment: 'morning workout',
});

// Update user preferences
engine.updateUserPreferences('user-123', {
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  maxPerDay: 2,
});
```

### 2. Persona Voice Generator (`persona-voice-generator.ts`)

Each agent has a distinct voice in outreach:

| Persona | Tone | Example |
|---------|------|---------|
| **Ferni** | Warm coach | "Hey! How did it go with your workout? 🌱" |
| **Maya** | Supportive habits | "Morning! ☀️ Quick routine check!" |
| **Peter** | Curious researcher | "Found something fascinating for you..." |
| **Alex** | Professional helper | "Quick heads up about tomorrow" |
| **Jordan** | Enthusiastic planner | "3 days until your anniversary! 🎉" |

```typescript
import { generateOutreach } from './services/outreach';

const message = generateOutreach(
  'ferni',           // persona
  context,           // user context
  'sms',             // channel
  'encouraging'      // tone
);
```

### 3. Thinking of You (`thinking-of-you.ts`)

Random kindness that makes Ferni feel like a real friend:

```typescript
import { triggerThinkingOfYou } from './services/outreach';

// Random "just because" outreach
await triggerThinkingOfYou('user-123');

// Specific trigger
await triggerThinkingOfYou('user-123', 'relationship_anniversary');
```

Triggers include:
- `random_kindness` - Just because
- `relevant_content` - "Saw this and thought of you"
- `relationship_anniversary` - Milestone celebrations
- `seasonal` - "How are you handling winter?"
- `appreciation` - "I'm proud of you"

### 4. Conversational Calls (`conversational-calls.ts`)

Real conversations, not robocalls:

```typescript
import { makeConversationalCall } from './services/outreach';

const call = await makeConversationalCall({
  trigger: { type: 'commitment_check', reason: '...', urgency: 'medium' },
  user: { id: 'user-123', name: 'Sarah', phone: '+15551234567', relationshipStage: 'established' },
  context: { activeCommitments: ['morning workout'] },
  approach: { tone: 'encouraging', primaryGoal: 'Check on workout' },
  persona: 'ferni',
});
```

## Trigger Types

| Type | Description | Default Persona |
|------|-------------|-----------------|
| `commitment_check` | User said they'd do something | Maya |
| `emotional_support` | Detected stress/struggle | Ferni |
| `celebration` | Achievement unlocked | Ferni |
| `habit_check` | Routine check-in | Maya |
| `milestone_approaching` | Event coming up | Jordan |
| `reengagement` | Haven't heard from user | Ferni |
| `thinking_of_you` | Random kindness | Ferni |
| `content_share` | Relevant content found | Peter |

## Relationship-Aware Messaging

Messages adapt to relationship depth:

| Stage | Formality | Example Opening |
|-------|-----------|-----------------|
| **New** | Formal | "Hi! I hope it's okay that I'm reaching out..." |
| **Building** | Friendly | "Hey! Wanted to check in about..." |
| **Established** | Casual | "Hey! Quick question..." |
| **Deep** | Intimate | "Hey friend! Been thinking about you..." |

## API Endpoints

```
# Preferences
GET  /api/outreach/preferences?userId=xxx
POST /api/outreach/preferences  { userId, preferences }
POST /api/outreach/pause        { userId, durationDays? }
POST /api/outreach/resume       { userId }

# Triggers
POST /api/outreach/trigger          { userId, type, priority, reason, ... }
POST /api/outreach/thinking-of-you  { userId, trigger?, reason? }
GET  /api/outreach/pending?userId=xxx
DELETE /api/outreach/pending/:triggerId

# History
GET /api/outreach/history?userId=xxx&limit=20
GET /api/outreach/analytics?userId=xxx

# Registration
POST /api/outreach/register  { userId, relationshipStartDate? }
POST /api/outreach/context   { userId, context }
```

## Configuration

### User Preferences

```typescript
interface UserPreferences {
  quietHoursStart: string;      // "22:00"
  quietHoursEnd: string;        // "08:00"
  timezone: string;             // "America/New_York"
  maxPerDay: number;            // 3
  maxPerWeek: number;           // 10
  preferredChannel?: 'sms' | 'email' | 'call';
  neverDuring?: string[];       // ["morning meditation"]
}
```

### Environment Variables

```bash
# Twilio (for SMS, calls)
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx

# LiveKit (for conversational calls)
LIVEKIT_URL=wss://xxx.livekit.cloud
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
SIP_TRUNK_ID=xxx

# Webhooks
WEBHOOK_BASE_URL=https://your-server.com
```

## Testing

```typescript
// In dev mode, trigger outreach manually
import { triggerOutreach } from './services/outreach';

// Test commitment check
triggerOutreach({
  type: 'commitment_check',
  userId: 'test-user',
  priority: 'high', // High = immediate processing
  reason: 'Test commitment check',
  commitment: 'Test task',
});
```

## What Makes This Human?

1. **Persona-Native Voices**: Each agent sounds like themselves
2. **Relationship Awareness**: Tone adapts to how well we know you
3. **Smart Timing**: Reaches out when you're receptive
4. **Context Awareness**: Knows what's happening in your life
5. **Random Kindness**: Not just task-driven, sometimes just because
6. **Real Conversations**: Calls are actual dialogues, not broadcasts

## Files

```
src/services/outreach/
├── index.ts                   # Main entry point & orchestrator
├── decision-engine.ts         # When/why/who/how decisions
├── persona-voice-generator.ts # Message generation per persona
├── thinking-of-you.ts         # Random kindness engine
├── conversational-calls.ts    # LiveKit call integration
├── timing-intelligence.ts     # Smart timing & pattern learning
├── context-aggregator.ts      # Life context tracking
├── channel-selector.ts        # Channel selection with learning
├── relationship-adapter.ts    # Tone adaptation by relationship
└── README.md                  # This file

src/api/
└── outreach-routes.ts         # REST API endpoints
```

## New Services

### Timing Intelligence (`timing-intelligence.ts`)

Learn when users are most receptive:

```typescript
import { calculateOptimalTime, recordTimingInteraction } from './services/outreach';

// Find best time for an outreach
const decision = calculateOptimalTime('user-123', {
  trigger: { type: 'commitment_check', priority: 'medium' },
  channel: 'sms',
});

// Record interaction for learning
recordTimingInteraction('user-123', {
  channel: 'sms',
  wasOutreach: true,
  gotResponse: true,
  responseTimeMs: 15 * 60 * 1000,
});

// Set user preferences
addNeverDuringRule('user-123', {
  description: 'Morning meditation',
  startTime: '07:00',
  endTime: '08:00',
  isRecurring: true,
});
```

### Context Aggregator (`context-aggregator.ts`)

Track life context for personalized outreach:

```typescript
import { 
  getUserContext, 
  addWin, 
  addStruggle, 
  updateEmotionalState,
  needsSupport 
} from './services/outreach';

// Record emotional state
updateEmotionalState('user-123', 'struggling', 'work stress');

// Add wins and struggles
addWin('user-123', {
  description: 'Finished certification',
  date: new Date(),
  category: 'career',
  celebrated: false,
  significance: 'big',
});

// Check if support needed
const { needsSupport: needs, reason, priority } = needsSupport('user-123');
```

### Channel Selector (`channel-selector.ts`)

Smart channel selection with learning:

```typescript
import { selectChannel, recordOutreachOutcome } from './services/outreach';

// Select best channel
const decision = selectChannel('user-123', {
  triggerType: 'emotional_support',
  priority: 'high',
  contentType: 'emotional',
  timeOfDay: 'evening',
  isWorkHours: false,
});

// Record outcome for learning
recordOutreachOutcome('user-123', {
  channel: 'call',
  gotResponse: true,
  responseTimeMs: 0,
  userSatisfaction: 'positive',
});
```

### Relationship Adapter (`relationship-adapter.ts`)

Adapt tone based on relationship depth:

```typescript
import { 
  getRelationshipProfile, 
  getToneAdjustment, 
  adaptMessage,
  canDoAction 
} from './services/outreach';

// Get tone for relationship
const tone = getToneAdjustment('user-123');
// { formality: 'casual', canUseNickname: true, ... }

// Check permissions
if (canDoAction('user-123', 'use_humor')) {
  // Add playful element
}

// Adapt message for relationship
const adapted = adaptMessage('user-123', 'Hey! How did it go?', {
  userName: 'Sarah',
  preferredName: 'Sar',
  isGreeting: true,
});
```

## New Services (Phase 9-15)

### Session Integration (`session-integration.ts`)

Automatically analyze conversations for outreach opportunities:

```typescript
import { analyzeSessionForOutreach } from './services/outreach';

// Called automatically at session end
const result = await analyzeSessionForOutreach({
  userId: 'user-123',
  sessionId: 'session-abc',
  personaId: 'ferni',
  turns: conversationTurns,
  summary: { mainTopics, keyPoints, emotionalArc },
  durationMinutes: 15,
  satisfaction: 'positive',
});

// Result: { commitmentsFound: 2, triggersCreated: 3, contextUpdated: true }
```

### Analytics & Learning (`analytics.ts`)

Track outreach effectiveness and learn optimal patterns:

```typescript
import { 
  calculateUserAnalytics, 
  getRecommendations, 
  predictResponseLikelihood 
} from './services/outreach';

// Get user analytics
const analytics = calculateUserAnalytics('user-123');
// { responseRate: 0.73, preferredChannel: 'sms', bestTimeSlots: [...] }

// Get AI recommendations
const recommendations = getRecommendations('user-123');
// { suggestedChannel: 'sms', suggestedTime: { hour: 10, dayOfWeek: 2 }, ... }

// Predict response likelihood
const prediction = predictResponseLikelihood({
  userId: 'user-123',
  channel: 'sms',
  triggerType: 'commitment_check',
  personaId: 'maya',
  time: new Date(),
});
// Returns 0.68 (68% likely to respond)
```

### Voice Synthesis (`voice-synthesis.ts`)

Generate voice messages with Cartesia TTS:

```typescript
import { generateVoicemail, generateCallGreeting } from './services/outreach';

// Generate a voicemail
const voicemail = await generateVoicemail({
  personaId: 'ferni',
  userId: 'user-123',
  userName: 'Sarah',
  context: 'morning workout',
  originalMessage: 'Just wanted to check in...',
});
// { audioUrl: 'https://...', duration: 12, transcript: '...' }

// Generate call greeting
const greeting = await generateCallGreeting({
  personaId: 'maya',
  userId: 'user-123',
  userName: 'Sarah',
  context: 'habit check-in',
});
```

### SIP Bridge (`sip-bridge.ts`)

Real conversational calls via Twilio → LiveKit:

```typescript
import { initiateConversationalCall, handleCallStatus } from './services/outreach';

// Initiate a real conversation
const call = await initiateConversationalCall({
  userId: 'user-123',
  toPhone: '+15551234567',
  personaId: 'ferni',
  context: 'commitment check',
  message: 'Just wanted to check in about your workout...',
  webhookBaseUrl: 'https://app.ferni.ai',
});
// { success: true, callSid: 'CA...', roomName: 'outreach-user-123-...' }

// Handle Twilio webhooks
handleCallStatus(callSid, 'answered');
handleMachineDetection(callSid, 'human');
```

### Firestore Persistence (`firestore-persistence.ts`)

Persist outreach data across restarts:

```typescript
import { 
  isFirestoreAvailable,
  saveOutreachProfile,
  loadOutreachProfile,
  getOutreachStats 
} from './services/outreach';

// Check if persistence available
if (isFirestoreAvailable()) {
  // Save profile
  await saveOutreachProfile('user-123', {
    state: userState,
    timing: timingProfile,
    channel: channelProfile,
    relationship: relationshipProfile,
  });
  
  // Get stats
  const stats = await getOutreachStats('user-123', 30);
  // { totalSent: 45, byChannel: { sms: 30, email: 15 }, ... }
}
```

### User Preferences UI (`outreach-settings.ui.ts`)

Frontend settings panel for users:

```typescript
import { outreachSettings } from './ui/outreach-settings.ui';

// Open settings modal
await outreachSettings.open();

// Get current preferences
const prefs = outreachSettings.getPreferences();
// { enabled: true, channels: { sms: true, email: true, call: false }, ... }
```

## Persona Outreach Profiles

Each persona now has an `outreach-voice.json` in their bundle:

```
src/personas/bundles/
├── ferni/content/behaviors/outreach-voice.json       # Warm, coach-like
├── maya-santos/content/behaviors/outreach-voice.json # Supportive, brief
├── peter-john/content/behaviors/outreach-voice.json  # Curious, intellectual
├── alex-chen/content/behaviors/outreach-voice.json   # Professional, efficient
├── jordan-taylor/content/behaviors/outreach-voice.json # Enthusiastic, celebratory
└── nayan-patel/content/behaviors/outreach-voice.json   # Wise, calm
```

## Environment Variables

```bash
# ============================================================================
# REQUIRED - Core Twilio (for calls and SMS)
# ============================================================================
TWILIO_ACCOUNT_SID=xxx
TWILIO_AUTH_TOKEN=xxx
TWILIO_PHONE_NUMBER=+1xxx

# ============================================================================
# EMAIL DELIVERY (choose one)
# ============================================================================
# SendGrid
SENDGRID_API_KEY=xxx
SENDGRID_WEBHOOK_KEY=xxx          # For webhook signature validation

# OR Resend
RESEND_API_KEY=xxx
RESEND_WEBHOOK_SECRET=xxx         # For webhook signature validation

# Email Settings
EMAIL_FROM=hello@ferni.ai
EMAIL_FROM_NAME=Ferni
EMAIL_REPLY_TO=support@ferni.ai

# ============================================================================
# PUSH NOTIFICATIONS (Firebase Cloud Messaging)
# ============================================================================
FCM_PROJECT_ID=xxx
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FCM_CLIENT_EMAIL=firebase-adminsdk-xxx@xxx.iam.gserviceaccount.com

# ============================================================================
# VOICE SYNTHESIS (Cartesia TTS)
# ============================================================================
CARTESIA_API_KEY=xxx
GCS_BUCKET_NAME=xxx               # For storing generated audio
GCP_PROJECT_ID=xxx

# ============================================================================
# SIP BRIDGE (Twilio → LiveKit for conversational calls)
# ============================================================================
LIVEKIT_HOST=xxx.livekit.cloud
LIVEKIT_API_KEY=xxx
LIVEKIT_API_SECRET=xxx
SIP_DOMAIN=xxx
SIP_TRUNK_NUMBER=+1xxx

# ============================================================================
# WEBHOOKS
# ============================================================================
WEBHOOK_BASE_URL=https://app.ferni.ai   # Your production URL

# ============================================================================
# PERSISTENCE (Firestore)
# ============================================================================
FIREBASE_PROJECT_ID=xxx
# Note: Uses Application Default Credentials in GCP, or GOOGLE_APPLICATION_CREDENTIALS locally
```

### Webhook URLs to Configure

After deployment, configure these URLs in your provider dashboards:

**Twilio (SMS/Voice):**
```
SMS Status:    https://app.ferni.ai/api/outreach/webhooks/twilio/sms-status
SMS Inbound:   https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound
Call Status:   https://app.ferni.ai/api/outreach/webhooks/twilio/call-status
```

**SendGrid:**
```
Event Webhook: https://app.ferni.ai/api/outreach/webhooks/sendgrid
```

**Resend:**
```
Webhook URL:   https://app.ferni.ai/api/outreach/webhooks/resend
```

## Files

```
src/services/outreach/
├── index.ts                   # Main entry point & orchestrator
├── decision-engine.ts         # When/why/who/how decisions
├── persona-voice-generator.ts # Message generation per persona
├── thinking-of-you.ts         # Random kindness engine
├── conversational-calls.ts    # LiveKit call integration
├── timing-intelligence.ts     # Smart timing & pattern learning
├── context-aggregator.ts      # Life context tracking
├── channel-selector.ts        # Channel selection with learning
├── relationship-adapter.ts    # Tone adaptation by relationship
├── session-integration.ts     # Session analysis for outreach
├── analytics.ts               # Analytics & learning system
├── voice-synthesis.ts         # Cartesia TTS for voice messages
├── sip-bridge.ts              # Twilio → LiveKit SIP bridge
├── firestore-persistence.ts   # Firestore database persistence
├── maintenance.ts             # Cron jobs for cleanup
│
├── delivery/                  # Channel delivery services
│   ├── index.ts               # Delivery exports
│   ├── sms-delivery.ts        # Twilio SMS sending
│   ├── email-delivery.ts      # SendGrid/Resend email sending
│   ├── push-notifications.ts  # Firebase Cloud Messaging
│   └── delivery-tracker.ts    # Unified delivery tracking
│
├── webhooks/                  # Webhook handlers
│   ├── index.ts               # Webhook exports
│   ├── twilio-webhooks.ts     # SMS/call status & inbound
│   └── email-webhooks.ts      # Open/click/bounce tracking
│
├── ab-testing/                # A/B testing framework
│   ├── index.ts               # A/B testing exports
│   └── ab-testing.ts          # Tests & statistical analysis
│
└── README.md                  # This file

src/api/
├── outreach-handler.ts        # REST API endpoints
└── outreach-webhook-routes.ts # Webhook HTTP handlers

apps/web/src/ui/
├── outreach-settings.ui.ts    # User preferences modal
└── outreach-schedule.ui.ts    # Upcoming outreach viewer
```

## Roadmap

### Core (Complete)
- [x] Decision Engine with triggers
- [x] Persona Voice Generator  
- [x] Thinking of You engine
- [x] Conversational calls foundation
- [x] Timing Intelligence with learning
- [x] Context Aggregator for life events
- [x] Channel Selection with learning
- [x] Relationship Adapter for tone
- [x] Session Integration (analyze conversations)
- [x] Persona Outreach Profiles in bundles
- [x] User Preferences UI
- [x] Firestore Persistence
- [x] Twilio → LiveKit SIP Bridge
- [x] Cartesia TTS Voice Synthesis
- [x] Analytics & Learning System
- [x] Maintenance & Cleanup Jobs

### Phase 16-20 (Complete)
- [x] Real SMS delivery via Twilio
- [x] Email delivery via SendGrid/Resend with beautiful templates
- [x] Delivery tracking & retry logic
- [x] Twilio SMS/call webhook handlers
- [x] Email tracking webhooks (opens/clicks)
- [x] Inbound SMS reply handling
- [x] A/B testing framework with statistical significance
- [x] Firebase Cloud Messaging push notifications
- [x] Scheduling UI for upcoming outreach
- [x] Reschedule/cancel/preview capabilities

## Related Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| **Vision** | `docs/features/PROACTIVE-OUTREACH-VISION.md` | Philosophy and long-term goals |
| **Architecture** | `docs/architecture/OUTREACH-WORKER-ARCHITECTURE.md` | Scaling proposal (worker separation) |
| **Implementation Plan** | `docs/plans/INTELLIGENT-OUTREACH-PLAN.md` | Phased implementation roadmap |
| **Production Plan** | `docs/plans/OUTREACH-PRODUCTION-PLAN.md` | Deployment checklist and status |
| **System Audit** | `docs/audits/OUTREACH-SYSTEM-AUDIT.md` | Current state findings |
| **Webhook Setup** | `docs/features/OUTREACH-WEBHOOKS.md` | Provider webhook configuration |

---

## Production Deployment

The outreach system initializes automatically when the app starts. To deploy:

```bash
# Build
npm run build

# Deploy to Cloud Run
npm run deploy:ui

# Verify
curl https://app.ferni.ai/api/outreach/health
```

