# 🧠 Truly Intelligent Outreach - Implementation Plan

> **"A thoughtful friend who checks in, not a bot that sends notifications"**
> 
> **Vision**: Outreach so intelligent that users think "How did Ferni know I needed that?"

---

## Table of Contents

1. [What Makes This Different](#what-makes-this-different)
2. [Phase 1: Infrastructure](#phase-1-infrastructure-credentials--delivery)
3. [Phase 2: Worker Architecture](#phase-2-worker-architecture)
4. [Phase 3: Intelligent Triggers](#phase-3-intelligent-triggers)
5. [Phase 4: Real Phone Calls](#phase-4-real-conversational-phone-calls)
6. [Phase 5: Superhuman Integration](#phase-5-superhuman-integration)
7. [Success Metrics](#success-metrics)
8. [Timeline](#timeline)

---

## What Makes This Different

### ❌ What Most AI Outreach Looks Like (Bad)

```
"Reminder: You said you'd work out today!"
"You haven't logged in for 3 days"
"Your streak is about to break!"
```

### ✅ What Truly Intelligent Outreach Looks Like (Ferni)

```
"Hey! I know Mondays can be tough for you. Just wanted to say 
I'm here if you need someone. No agenda. 💚"

"I noticed you mentioned your mom's health last week. 
Been thinking about you. How are you holding up?"

"That thing you were nervous about? How'd it go? 
I've been curious since you mentioned it."
```

---

## Intelligence Layers (Already Built)

| System | What It Does | Outreach Use |
|--------|--------------|--------------|
| **Reading Between Lines** | Detects "I'm fine" that isn't fine | Concern-based check-ins |
| **Growth Reflection** | Notices user evolution over time | Milestone celebrations |
| **Small Wins** | Celebrates effort, not outcomes | Progress encouragement |
| **Thinking of You** | No-agenda warmth | Random kindness |
| **Life Rhythm Prediction** | Predicts Monday blues, SAD, etc. | Proactive support |
| **Superhuman Memory** | Remembers everything shared | Context-aware follow-ups |
| **Maya Habit Tracking** | Streak protection, setback recovery | Habit support |
| **Concern Detection** | Voice/content analysis for distress | Crisis outreach |

---

## Phase 1: Infrastructure (Credentials & Delivery)

### 1.1 SMS via Twilio

**Status**: ✅ Code complete, ❌ needs credentials

```bash
# Required Environment Variables
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1xxxxx
```

**Files**: 
- `src/services/outreach/delivery/sms-delivery.ts`
- `src/services/twilio-sms.ts`

**Webhook Configuration** (in Twilio Console):
```
SMS Status Callback: https://app.ferni.ai/api/outreach/webhooks/twilio/sms-status
SMS Inbound Webhook: https://app.ferni.ai/api/outreach/webhooks/twilio/sms-inbound
```

### 1.2 Email via SendGrid/Resend

**Status**: ✅ Code complete, ❌ needs credentials

```bash
# Option A: SendGrid
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_WEBHOOK_KEY=xxxxx

# Option B: Resend (simpler)
RESEND_API_KEY=re_xxxxx

# Common
EMAIL_FROM=hello@ferni.ai
EMAIL_FROM_NAME=Ferni
```

**Files**:
- `src/services/outreach/delivery/email-delivery.ts`
- `src/services/communication-service.ts`

**Webhook Configuration** (in SendGrid/Resend):
```
Event Webhook: https://app.ferni.ai/api/outreach/webhooks/sendgrid
# OR
https://app.ferni.ai/api/outreach/webhooks/resend
```

### 1.3 Push Notifications via FCM

**Status**: ✅ Code complete, ❌ needs credentials

```bash
FCM_PROJECT_ID=your-project-id
FCM_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FCM_CLIENT_EMAIL=firebase-adminsdk-xxx@xxx.iam.gserviceaccount.com
```

**Files**:
- `src/services/outreach/delivery/push-notifications.ts`
- `src/services/push-notifications.ts`

### 1.4 Deployment

```bash
# After adding credentials to Secret Manager or .env
ferni deploy ui          # Deploy UI server with new env vars
ferni deploy frontend    # Deploy frontend with push notification support
```

---

## Phase 2: Worker Architecture

### Why Decouple?

Currently, outreach runs in the voice agent, causing:
- Memory bloat (3.7GB+ with many triggers)
- Slow cold starts
- Outreach failures blocking voice

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Voice Agent (GCE VM)                              │
│  - LiveKit WebRTC/UDP                                                    │
│  - Real-time voice processing                                            │
│  - Trigger PRODUCER (writes to Pub/Sub)                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Google Pub/Sub
                                    │ (outreach-triggers topic)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Outreach Worker (Cloud Run Jobs)                      │
│  - Trigger CONSUMER (reads from Pub/Sub)                                 │
│  - Decision Engine + Timing Intelligence                                 │
│  - Schedules delivery via Cloud Tasks                                    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Cloud Tasks (scheduled delivery)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                  Delivery Workers (Cloud Run Services)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ SMS Worker  │  │Email Worker │  │ Call Worker │  │ Push Worker │     │
│  │ (Twilio)    │  │ (SendGrid)  │  │(SIP Bridge) │  │   (FCM)     │     │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘     │
└─────────────────────────────────────────────────────────────────────────┘
```

### Implementation Steps

1. **Create Pub/Sub topic**: `outreach-triggers`
2. **Create trigger publisher**: Voice agent publishes to Pub/Sub instead of in-memory
3. **Create outreach worker Cloud Run Job**: Processes triggers every 5 min
4. **Create Cloud Tasks queue**: `outreach-delivery`
5. **Deploy delivery workers**: One per channel

### Files to Create

```
src/workers/outreach/
├── processor.ts           # Main worker entry point
├── trigger-consumer.ts    # Pub/Sub consumer
├── delivery-scheduler.ts  # Creates Cloud Tasks
└── index.ts

docker/Dockerfile.outreach   # Dockerfile for worker
cloudbuild-outreach.yaml     # Cloud Build config
```

---

## Phase 3: Intelligent Triggers

### 3.1 Connect Trust Systems to Outreach

**File**: `src/services/outreach/trust-outreach-bridge.ts` (NEW)

```typescript
/**
 * Bridge between trust systems and outreach triggers
 * 
 * This connects all the "better than human" detection to actual outreach
 */

import { detectUnsaidSignals } from '../trust-systems/reading-between-lines.js';
import { getUnreflectedGrowth, generateGrowthReflection } from '../trust-systems/growth-reflection.js';
import { getUncelebratedWins, generateCelebration } from '../trust-systems/small-wins.js';
import { getDueMoments } from '../trust-systems/thinking-of-you.js';
import { getProactiveRememberWhen } from '../trust-systems/our-songs.js';
import { publishOutreachTrigger } from './trigger-publisher.js';

/**
 * Evaluate all trust systems for outreach opportunities
 */
export async function evaluateTrustBasedOutreach(userId: string): Promise<void> {
  // 1. Check for "thinking of you" moments
  const dueMoments = getDueMoments(userId);
  for (const moment of dueMoments) {
    await publishOutreachTrigger({
      type: 'thinking_of_you',
      userId,
      priority: moment.priority,
      reason: moment.trigger.context || 'Just thinking of you',
      context: { message: moment.message, ssml: moment.ssml }
    });
  }

  // 2. Check for uncelebrated wins
  const uncelebratedWins = getUncelebratedWins(userId);
  for (const win of uncelebratedWins) {
    const celebration = generateCelebration(win);
    if (celebration) {
      await publishOutreachTrigger({
        type: 'celebration',
        userId,
        priority: win.significance === 'big' ? 'high' : 'medium',
        reason: `Celebrate: ${win.description}`,
        context: { message: celebration.message }
      });
    }
  }

  // 3. Check for unreflected growth
  const unreflected = getUnreflectedGrowth(userId);
  for (const growth of unreflected) {
    const reflection = generateGrowthReflection(growth);
    if (reflection) {
      await publishOutreachTrigger({
        type: 'growth_reflection',
        userId,
        priority: 'medium',
        reason: `Growth reflection: ${growth.description}`,
        context: { message: reflection.message }
      });
    }
  }

  // 4. Check for "our songs" memories to surface
  const songCallback = getProactiveRememberWhen(userId);
  if (songCallback) {
    await publishOutreachTrigger({
      type: 'shared_memory',
      userId,
      priority: 'low',
      reason: 'Shared musical memory',
      context: { message: songCallback.phrase, ssml: songCallback.ssml }
    });
  }
}
```

### 3.2 Connect Concern Detection

**File**: `src/services/outreach/concern-outreach-bridge.ts` (NEW)

```typescript
/**
 * Connect concern detection (voice + content) to proactive outreach
 * 
 * When we detect someone is struggling, reach out - don't wait
 */

import { processConcernForOutreach } from './superhuman-outreach-integration.js';
import { detectUnsaidSignals } from '../trust-systems/reading-between-lines.js';

/**
 * After detecting concern in a session, consider follow-up outreach
 */
export async function handleConcernDetection(
  userId: string,
  concernLevel: 'none' | 'mild' | 'moderate' | 'elevated' | 'crisis',
  concernType: string,
  sessionContext: { lastMessage: string; emotion?: string }
): Promise<void> {
  
  // 1. Get superhuman outreach trigger if warranted
  const trigger = await processConcernForOutreach(userId, concernLevel, concernType);
  
  if (trigger) {
    // Don't reach out immediately - schedule for next day
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0); // 10am their time
    
    await publishOutreachTrigger({
      ...convertToOutreachTrigger(trigger),
      scheduledFor: tomorrow,
    });
  }

  // 2. Also check "reading between lines" for unspoken needs
  const unsaidSignals = detectUnsaidSignals(userId, sessionContext.lastMessage, {
    detectedEmotion: sessionContext.emotion,
  });

  for (const signal of unsaidSignals) {
    if (signal.type === 'minimizing_pain' || signal.type === 'false_closure') {
      // They're downplaying something - gentle check-in later
      await publishOutreachTrigger({
        type: 'emotional_support',
        userId,
        priority: 'medium',
        reason: `Detected ${signal.type}: ${signal.observation}`,
        context: { 
          suggestedApproach: signal.approach,
          suggestedPhrase: signal.phrase
        }
      });
    }
  }
}
```

### 3.3 Wire Session Integration

**Modify**: `src/services/outreach/session-integration.ts`

Add at session end:
```typescript
// At end of session, evaluate all trust-based outreach
await evaluateTrustBasedOutreach(userId);

// If concern detected during session
if (sessionData.detectedConcern) {
  await handleConcernDetection(
    userId,
    sessionData.detectedConcern.level,
    sessionData.detectedConcern.type,
    { lastMessage: lastUserMessage, emotion: detectedEmotion }
  );
}
```

---

## Phase 4: Real Conversational Phone Calls

### The Vision

```
Phone rings → User answers → Ferni greets naturally → 
Real conversation begins → Agent responds contextually → 
Natural conclusion → Follow-up if needed
```

### Technical Stack

```
Twilio Voice → SIP Bridge → LiveKit Room → Ferni Agent
```

### Required Credentials

```bash
# Twilio Voice (beyond basic Twilio)
TWILIO_PHONE_NUMBER=+1xxxxx  # Voice-enabled number

# LiveKit SIP (may need LiveKit Cloud upgrade)
LIVEKIT_SIP_TRUNK_ID=xxxxx
SIP_DOMAIN=xxxxx
SIP_TRUNK_NUMBER=+1xxxxx

# Cartesia TTS (for persona voices)
CARTESIA_API_KEY=xxxxx

# GCS Bucket (for generated audio)
GCS_BUCKET_NAME=ferni-voice-audio
```

### Implementation

**Files already built**:
- `src/services/outreach/conversational-calls.ts`
- `src/services/outreach/sip-bridge.ts`
- `src/services/voice-call.ts`

**What needs configuration**:
1. Enable Twilio Voice on your account
2. Configure LiveKit SIP trunk
3. Set webhook URLs in Twilio:
   ```
   Call Status: https://app.ferni.ai/api/outreach/webhooks/twilio/call-status
   ```

### Voicemail Handling

When voicemail detected, leave warm message:
```typescript
const voicemailMessages = {
  commitment_check: (ctx) => `
    Hey ${ctx.user.preferredName}! It's Ferni. 
    I was just thinking about you and wanted to check in. 
    No need to call back - I'll send you a text. 
    Hope you're having a good day!
  `,
  
  emotional_support: (ctx) => `
    Hey ${ctx.user.preferredName}, it's Ferni. 
    Just calling to see how you're doing. 
    I know things have been on your mind. 
    No pressure to call back - I'm here whenever you need me.
  `,
};
```

---

## Phase 5: Superhuman Integration

### 5.1 Anticipatory Outreach

Use life rhythm prediction to reach out BEFORE they struggle:

```typescript
// Already built: src/services/outreach/life-rhythm-outreach.ts

// "I know Mondays are hard for you - just checking in"
const prediction = predictUserState(userId);
if (prediction.prediction.likelyMood === 'low') {
  // Reach out proactively
}
```

### 5.2 Context-Aware Messaging

Every outreach includes full context:
- Last conversation summary
- Active commitments
- Recent wins/struggles
- Inside jokes available
- Topics to avoid
- Emotional state

### 5.3 Multi-Persona Routing

Each persona handles their domain:

| Trigger Type | Persona | Voice |
|--------------|---------|-------|
| Habit check | Maya | Supportive, practical |
| Emotional support | Ferni | Warm, coach-like |
| Research share | Peter | Curious, intellectual |
| Event countdown | Jordan | Enthusiastic, celebratory |
| Wisdom moment | Nayan | Calm, philosophical |
| Communication prep | Alex | Professional, efficient |

### 5.4 A/B Testing

Built-in framework for testing:
- Message variations
- Timing variations
- Channel selection
- Persona selection

---

## Success Metrics

### Response Rates

| Metric | Target | Current |
|--------|--------|---------|
| SMS response rate | >40% | Measuring |
| Email open rate | >45% | Measuring |
| Call answer rate | >30% | Measuring |
| Positive sentiment | >85% | Measuring |

### User Experience

| Metric | Target |
|--------|--------|
| "Felt personal" | >85% |
| "Good timing" | >75% |
| "Made my day better" | >70% |
| Unsubscribe rate | <5% |

### Technical

| Metric | Target |
|--------|--------|
| Delivery success | >99% |
| Timing accuracy | ±15 min |
| Worker latency | <30s |

---

## Timeline

### Week 1: Infrastructure ✅ → ⏳

- [ ] Add Twilio credentials
- [ ] Add SendGrid/Resend credentials
- [ ] Configure webhooks
- [ ] Test SMS delivery
- [ ] Test email delivery

### Week 2: Worker Architecture

- [ ] Create Pub/Sub topic
- [ ] Create trigger publisher
- [ ] Create outreach worker Cloud Run Job
- [ ] Create Cloud Tasks queue
- [ ] Deploy and test

### Week 3: Intelligence Integration

- [ ] Create trust-outreach-bridge
- [ ] Create concern-outreach-bridge
- [ ] Wire session integration
- [ ] Test end-to-end triggers

### Week 4: Phone Calls

- [ ] Enable Twilio Voice
- [ ] Configure SIP bridge
- [ ] Test conversational calls
- [ ] Test voicemail handling

### Week 5: Optimization

- [ ] Set up A/B tests
- [ ] Monitor metrics
- [ ] Tune timing algorithms
- [ ] Refine persona voices

---

## Quick Start Commands

```bash
# Test SMS (after credentials are set)
curl -X POST https://app.ferni.ai/api/outreach/test/send \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "channel": "sms", "message": "Hello from Ferni!"}'

# Test Email
curl -X POST https://app.ferni.ai/api/outreach/test/send \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "channel": "email", "subject": "Hello!", "message": "Test email from Ferni"}'

# Trigger manual outreach
curl -X POST https://app.ferni.ai/api/outreach/trigger \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "type": "thinking_of_you", "priority": "low", "reason": "Test trigger"}'

# View pending outreach
curl "https://app.ferni.ai/api/outreach/pending?userId=test"
```

---

## Files Reference

### Existing (Complete)
```
src/services/outreach/
├── index.ts                   # Main orchestrator
├── decision-engine.ts         # When/why/who/how
├── persona-voice-generator.ts # Persona-specific messaging
├── thinking-of-you.ts         # Random kindness
├── timing-intelligence.ts     # Smart timing
├── context-aggregator.ts      # Life context
├── channel-selector.ts        # Channel selection
├── relationship-adapter.ts    # Tone by relationship
├── session-integration.ts     # Conversation hooks
├── life-rhythm-outreach.ts    # Anticipatory support
├── superhuman-outreach-integration.ts # Memory-based triggers
├── maya-habit-outreach.ts     # Habit-specific outreach
├── conversational-calls.ts    # Real phone conversations
├── sip-bridge.ts              # Twilio → LiveKit
├── voice-synthesis.ts         # Cartesia TTS
├── firestore-persistence.ts   # Data persistence
├── analytics.ts               # Metrics
├── ab-testing/                # A/B testing
├── delivery/                  # SMS, email, push
└── webhooks/                  # Twilio, SendGrid handlers
```

### To Create
```
src/services/outreach/
├── trust-outreach-bridge.ts   # Trust systems → triggers
├── concern-outreach-bridge.ts # Concern detection → outreach

src/workers/outreach/
├── processor.ts               # Worker entry point
├── trigger-consumer.ts        # Pub/Sub consumer
└── delivery-scheduler.ts      # Cloud Tasks scheduler

docker/Dockerfile.outreach
cloudbuild-outreach.yaml
```

---

*"A thoughtful friend who checks in, not a bot that sends notifications"*

