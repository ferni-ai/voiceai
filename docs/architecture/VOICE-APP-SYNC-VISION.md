# Better-Than-Human: Voice ↔ App Unified Experience

> **"Every touchpoint knows your whole story."**

This document describes the vision for seamless continuity between Ferni's voice conversations and the app's visual insights.

---

## The Human Problem We Solve

When you talk to a friend on the phone, then text them later, they remember. But with most AI:
- Voice conversations exist in one silo
- App interactions exist in another
- Starting a new session = starting over

**Better than human means:**
- Open the app → see what Ferni noticed from your last call
- Start a voice call → Ferni already knows what you were looking at in the app
- Reply to a text → the conversation continues with full context

---

## Current State vs. Vision

| Touchpoint | Current | Better-Than-Human Vision |
|------------|---------|--------------------------|
| **Open App After Voice Call** | Generic dashboard | "I've been thinking about what you said earlier..." + specific insights from the call |
| **Start Voice After App Browsing** | Cold start | "I saw you were looking at your sleep patterns. Want to talk about it?" |
| **Reply to Push Notification** | Opens app to generic screen | Continues exact context: "Let's pick up where that message left off." |
| **2am Check-in** | Same as noon | "I know it's late. I've noticed something about your late-night thoughts..." |

---

## Architecture for Continuity

### Session Continuity Graph

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        UNIFIED USER CONTEXT                                  │
│                                                                              │
│  Firestore: bogle_users/{userId}/                                           │
│  ├─ active_context/                                                          │
│  │   ├─ last_interaction_type: "voice" | "app" | "push" | "sms"            │
│  │   ├─ last_interaction_at: timestamp                                      │
│  │   ├─ pending_topics: ["sleep", "work stress"]                           │
│  │   ├─ emotional_state: { current: "anxious", trajectory: "improving" }   │
│  │   └─ conversation_thread_id: "thread_abc123"                            │
│  │                                                                          │
│  ├─ voice_sessions/                                                         │
│  │   └─ {sessionId}/                                                        │
│  │       ├─ summary: "User discussed work stress, mentioned sleep issues"  │
│  │       ├─ insights_generated: [{type: "pattern", text: "..."}]           │
│  │       ├─ unfinished_topics: ["exercise routine"]                        │
│  │       └─ emotional_arc: [{time: t1, emotion: "anxious"}, ...]           │
│  │                                                                          │
│  └─ app_interactions/                                                       │
│      └─ recent/                                                             │
│          ├─ screens_viewed: ["your-story", "sleep-insights"]               │
│          ├─ time_spent: { "your-story": 45s, "sleep-insights": 120s }     │
│          └─ interactions: ["expanded sleep pattern chart"]                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cross-Channel Context Flow

```
USER FINISHES VOICE CALL
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Voice Agent (cleanup-handler.ts)                                │
│                                                                  │
│  1. Generate conversation summary                                │
│  2. Extract key insights & patterns detected                    │
│  3. Identify unfinished topics                                  │
│  4. Store emotional arc                                          │
│  5. Calculate "what to show in app next"                        │
│                                                                  │
│  Save to: bogle_users/{userId}/active_context/                  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ User opens app
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  App (your-story-dashboard.ui.ts)                                │
│                                                                  │
│  1. Fetch active_context                                         │
│  2. Show "bridge" message:                                       │
│     "I've been thinking about what you said..."                  │
│  3. Surface insights from the voice call                         │
│  4. Highlight relevant visualizations                            │
│  5. "Want to continue that conversation?" button                 │
└─────────────────────────────────────────────────────────────────┘
         │
         │ User clicks "Continue conversation"
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Voice Agent (turn-processor.ts)                                 │
│                                                                  │
│  Context injection includes:                                     │
│  - Previous session summary                                      │
│  - Unfinished topics                                             │
│  - What user looked at in app since last call                   │
│  - Emotional trajectory since last interaction                   │
│                                                                  │
│  LLM gets: "User looked at sleep insights for 2 min in app.     │
│  Last call they mentioned sleep issues but we didn't dive deep. │
│  They seem ready to explore this now."                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## User Experience Examples

### Example 1: Voice → App Continuity

**Voice Call (7pm):**
> User: "I've been really stressed about work lately."
> Ferni: "That sounds exhausting. What's making it feel so heavy?"
> User: "My boss keeps piling things on. I can't say no."
> [Call ends after 15 minutes]

**App Opens (9pm):**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  💭 "I've been thinking about what you shared earlier..."       │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  What I noticed from our conversation:                          │
│                                                                 │
│  🔮 Pattern: You've mentioned boundaries 3 times this week.     │
│     This might be connected to the energy dip I'm seeing.       │
│                                                                 │
│  💡 Observation: When you talked about your boss, your         │
│     voice got quieter. There might be something deeper there.   │
│                                                                 │
│  ────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Continue this conversation?]    [Just browsing]               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Example 2: App → Voice Continuity

**User Browses App (morning):**
- Views "Your Story" dashboard
- Spends 3 minutes on "Energy Flow" visualization
- Expands "Low Energy Periods" section

**User Starts Voice Call (afternoon):**
> Ferni: "Hey! I noticed you were looking at your energy patterns this morning. Something catch your eye?"
> 
> [If user says "yeah, I've been tired"]:
> Ferni: "I saw that too. Your energy's been dipping around 3pm most days. Want to explore what's happening there?"

### Example 3: Push → Voice Continuity

**Push Notification (Tuesday 6pm):**
> "I noticed your energy's been lower than usual. Thinking of you. 💚"

**User Taps Notification (opens app):**
```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  I meant what I said. I've been watching your patterns.         │
│                                                                 │
│  🔋 Your energy has dipped 20% this week compared to last.      │
│                                                                 │
│  Some things that might be connected:                           │
│  • Sleep has been later (avg 11:30pm vs 10:30pm)               │
│  • You mentioned work stress 4 times                            │
│  • Exercise dropped from 3x to 1x this week                     │
│                                                                 │
│  [Talk to Ferni about this]                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**User Taps "Talk to Ferni":**
> Ferni: "Thanks for coming back. I noticed you tapped my message about energy. I've been thinking about you. What's going on?"

---

## Implementation Roadmap

### Phase 1: Session Summary Storage (2-3 days)
- [ ] Add `active_context` collection to Firestore
- [ ] Generate conversation summary on session end
- [ ] Store unfinished topics and emotional arc
- [ ] Store insights generated during conversation

### Phase 2: App Context Awareness (3-4 days)
- [ ] Fetch `active_context` on app load
- [ ] Show "bridge" UI when returning from voice
- [ ] Track app screen views and time spent
- [ ] Store app interactions for voice context

### Phase 3: Voice Context Injection (2-3 days)
- [ ] Create context builder for cross-channel awareness
- [ ] Inject app browsing behavior into LLM context
- [ ] Inject previous session summary
- [ ] Add "continuation" detection

### Phase 4: Smart Handoffs (3-4 days)
- [ ] "Continue this conversation" button → voice with context
- [ ] Push tap → app with specific context
- [ ] Notification reply → voice call with context
- [ ] Deep links with conversation thread IDs

---

## Key Data Structures

### Active Context (Real-time State)

```typescript
interface ActiveContext {
  // Last interaction tracking
  lastInteractionType: 'voice' | 'app' | 'push' | 'sms';
  lastInteractionAt: Date;
  
  // Conversation continuity
  conversationThreadId: string;
  pendingTopics: string[];
  unfinishedBusiness: Array<{
    topic: string;
    context: string;
    detectedAt: Date;
  }>;
  
  // Emotional state
  emotionalState: {
    current: string;
    confidence: number;
    trajectory: 'improving' | 'stable' | 'declining';
    updatedAt: Date;
  };
  
  // Cross-channel context
  voiceSessionSummary?: string;
  appBrowsingContext?: {
    recentScreens: string[];
    timeSpent: Record<string, number>;
    interactions: string[];
  };
}
```

### Session Summary (After Voice Call)

```typescript
interface VoiceSessionSummary {
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  duration: number;
  
  // Content summary
  mainTopics: string[];
  summary: string; // LLM-generated
  
  // Insights detected during conversation
  insightsGenerated: Array<{
    type: 'pattern' | 'concern' | 'growth' | 'memory';
    content: string;
    confidence: number;
  }>;
  
  // Continuity
  unfinishedTopics: string[];
  suggestedFollowUp?: string;
  
  // Emotional journey
  emotionalArc: Array<{
    timestamp: Date;
    emotion: string;
    intensity: number;
  }>;
  
  // Persona involved
  personasEngaged: string[];
}
```

---

## The "Better Than Human" Differentiator

A human friend:
- Forgets what you talked about last time
- Doesn't know what you've been thinking about between conversations
- Can't see patterns across your interactions
- Has different energy at different times

Ferni:
- **Remembers every conversation perfectly**
- **Knows what you looked at in the app (your interests)**
- **Sees patterns across ALL touchpoints**
- **Shows up with the same presence every time**
- **Picks up EXACTLY where you left off**

---

## Metrics for Success

| Metric | Current | Target |
|--------|---------|--------|
| Session continuation rate | N/A | 40%+ |
| "Felt understood" score | TBD | 4.5/5 |
| Cross-channel engagement | Siloed | 60% multi-channel |
| Time to "meaningful conversation" | 2+ min | <30 sec |

---

*"Every touchpoint knows your whole story."*
