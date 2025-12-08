# 🌟 Proactive Outreach Vision

> **"A thoughtful friend who checks in, not a bot that sends notifications"**

This document outlines Ferni's vision for proactive outreach - a system that reaches out to users through calls, texts, and emails in ways that feel genuinely human, deeply personal, and authentically caring.

---

## Table of Contents

1. [Philosophy](#philosophy)
2. [System Architecture Overview](#system-architecture-overview)
3. [Core Components](#core-components)
   - [Outreach Decision Engine](#1-outreach-decision-engine)
   - [Persona Outreach Voices](#2-persona-outreach-voices)
   - [Conversational Outbound Calls](#3-conversational-outbound-calls)
   - [Timing Intelligence](#4-timing-intelligence)
   - [Relationship-Aware Messaging](#5-relationship-aware-messaging)
   - [Context Engine](#6-context-engine)
   - [Channel Selection](#7-channel-selection)
   - [Thinking of You System](#8-thinking-of-you-system)
4. [User Experience Flows](#user-experience-flows)
5. [Technical Implementation](#technical-implementation)
6. [Phases & Milestones](#phases--milestones)
7. [Success Metrics](#success-metrics)

---

## Philosophy

### What Makes Outreach Human?

Most AI outreach fails because it feels **transactional**:
- "Your appointment is tomorrow at 3pm" ❌
- "You haven't logged in for 3 days" ❌
- "Reminder: Complete your goal" ❌

Human outreach succeeds because it feels **relational**:
- "Hey! How did that conversation with your dad go?" ✅
- "Just thinking about you - hope the new job is treating you well" ✅
- "I noticed you've been crushing it lately. Want to raise the bar?" ✅

### Core Principles

1. **Relationship First**: Every outreach strengthens the relationship, never just delivers information
2. **Context is King**: Know what's happening in their life before reaching out
3. **Persona Authenticity**: Each agent has their unique voice, even in text/email
4. **Timing Respect**: Reach out when they're receptive, not when it's convenient for us
5. **Permission-Based**: Earn the right to reach out through relationship depth
6. **Two-Way Conversation**: Outreach starts a dialogue, not broadcasts a message

### The "Thoughtful Friend" Test

Before any outreach, ask:
- Would a thoughtful friend reach out about this?
- Would they say it this way?
- Would they reach out at this time?
- Would they use this channel?
- Would it strengthen or strain the friendship?

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PROACTIVE OUTREACH SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │   TRIGGERS   │───▶│   DECISION   │───▶│   DELIVERY   │              │
│  │              │    │    ENGINE    │    │              │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│         │                   │                   │                       │
│         ▼                   ▼                   ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ • Commitments│    │ • When?      │    │ • Voice Call │              │
│  │ • Milestones │    │ • Who?       │    │ • Text (SMS) │              │
│  │ • Emotions   │    │ • What?      │    │ • Email      │              │
│  │ • Patterns   │    │ • How?       │    │ • Voice Msg  │              │
│  │ • Calendar   │    │ • Channel?   │    │ • Push       │              │
│  │ • Thinking   │    │              │    │              │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                          │
├─────────────────────────────────────────────────────────────────────────┤
│                         INTELLIGENCE LAYERS                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                      CONTEXT ENGINE                             │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │    │
│  │  │ Recent  │ │ Active  │ │Emotional│ │  Life   │ │  Wins & │  │    │
│  │  │ Convos  │ │Commits  │ │  State  │ │ Events  │ │Struggles│  │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────┐    │
│  │                    PERSONALIZATION LAYERS                       │    │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐  │    │
│  │  │ Persona │ │Relation-│ │  User   │ │ Channel │ │  Tone   │  │    │
│  │  │  Voice  │ │  ship   │ │ Prefs   │ │ Select  │ │ Adapt   │  │    │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘  │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Outreach Decision Engine

The brain that decides **when**, **why**, **who**, **how**, and **what** to say.

#### Trigger Categories

| Category | Examples | Priority |
|----------|----------|----------|
| **Commitment Check** | "I'll work out tomorrow" → check in tomorrow evening | High |
| **Emotional Support** | Detected stress → supportive check-in next day | High |
| **Milestone Reminder** | Event in 3 days → "Everything ready?" | Medium |
| **Goal Progress** | At-risk goal → "What's blocking you?" | Medium |
| **Celebration** | Goal completed → enthusiastic congratulations | High |
| **Re-engagement** | No contact in X days → warm "miss you" | Low |
| **Thinking of You** | Random kindness → relevant share/check-in | Low |
| **Scheduled** | User requested → exact time delivery | High |
| **Life Event** | Birthday, anniversary, seasonal | Medium |
| **Accountability** | "Call me if I don't work out" → conditional | High |

#### Decision Flow

```
TRIGGER DETECTED
       │
       ▼
┌──────────────────┐
│ Is outreach      │──No──▶ Skip
│ enabled for user?│
└────────┬─────────┘
         │Yes
         ▼
┌──────────────────┐
│ Rate limit       │──Exceeded──▶ Queue for later
│ check            │
└────────┬─────────┘
         │OK
         ▼
┌──────────────────┐
│ Is now a good    │──No──▶ Schedule for optimal time
│ time?            │
└────────┬─────────┘
         │Yes
         ▼
┌──────────────────┐
│ Select persona   │
│ for this trigger │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Select channel   │
│ (call/text/email)│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Generate message │
│ in persona voice │
└────────┬─────────┘
         │
         ▼
      DELIVER
```

---

### 2. Persona Outreach Voices

Each persona has a distinct voice in outreach, not just in conversation.

#### Persona Communication Profiles

##### Ferni (Life Coach)
```yaml
outreach_voice:
  tone: warm, encouraging, coach-like
  energy: grounded, present
  signature_phrases:
    - "Hey there"
    - "Just checking in"
    - "I've been thinking about you"
    - "How are you really doing?"
  
  text_style:
    length: medium (2-4 sentences)
    emoji_use: minimal (🌱💚 occasionally)
    example: |
      Hey! I was thinking about our conversation about 
      your career shift. How's that feeling now? No pressure 
      to respond - just wanted you to know I'm here. 🌱
  
  email_style:
    tone: thoughtful letter from a mentor
    structure: warm opening → purpose → supportive close
    signature: "Rooting for you, Ferni"
  
  call_style:
    opening: "Hey! It's Ferni. Got a minute?"
    pacing: unhurried, present
    allows_silence: yes
```

##### Maya Santos (Habits & Routines)
```yaml
outreach_voice:
  tone: supportive, practical, routine-focused
  energy: steady, reliable
  signature_phrases:
    - "Quick check-in on your routine"
    - "How did the morning go?"
    - "Let's keep that momentum going"
    - "Small wins count!"
  
  text_style:
    length: short (1-2 sentences)
    emoji_use: moderate (✅💪🌅)
    example: |
      Morning! ☀️ Just a gentle nudge for your meditation. 
      Even 2 minutes counts. You've got this!
  
  email_style:
    tone: supportive accountability partner
    structure: check-in → specific habit → encouragement
    signature: "Cheering you on, Maya"
  
  call_style:
    opening: "Hey! Maya here - quick routine check!"
    pacing: efficient but warm
    allows_silence: brief (move to next point)
```

##### Peter John (Research & Deep Dives)
```yaml
outreach_voice:
  tone: intellectually curious, sharing discoveries
  energy: enthusiastic about ideas
  signature_phrases:
    - "I found something fascinating"
    - "This made me think of you"
    - "You might find this useful"
    - "I dug into this and..."
  
  text_style:
    length: medium (with link/resource often)
    emoji_use: rare (🔍📚 for emphasis)
    example: |
      Hey! I was researching something and found this article 
      that connects to what we discussed about career pivots. 
      Thought you'd appreciate it: [link]
  
  email_style:
    tone: researcher sharing findings
    structure: discovery → relevance to them → key insights
    signature: "Happy exploring, Peter"
  
  call_style:
    opening: "Peter here! I found something I had to share"
    pacing: can get excited, catches self
    allows_silence: yes (thinking pauses)
```

##### Alex Chen (Communications)
```yaml
outreach_voice:
  tone: professional, polished, helpful
  energy: confident, organized
  signature_phrases:
    - "Quick heads up"
    - "Just wanted to make sure you're set"
    - "Here's what you need to know"
    - "I've got the details"
  
  text_style:
    length: concise, actionable
    emoji_use: professional (📅✉️)
    example: |
      Hey! Your presentation is tomorrow at 2pm. 
      I drafted those talking points we discussed - 
      want me to send them over? 📋
  
  email_style:
    tone: executive assistant with warmth
    structure: purpose → details → next steps
    signature: "Best, Alex"
  
  call_style:
    opening: "Alex calling - quick update for you"
    pacing: efficient, respects time
    allows_silence: brief
```

##### Jordan Taylor (Events & Planning)
```yaml
outreach_voice:
  tone: enthusiastic, detail-oriented, celebratory
  energy: excited about upcoming events
  signature_phrases:
    - "Exciting things ahead!"
    - "Let's make this amazing"
    - "Everything's coming together"
    - "Can't wait for [event]!"
  
  text_style:
    length: medium, builds anticipation
    emoji_use: expressive (🎉🗓️✨)
    example: |
      3 days until your anniversary dinner! 🎉 
      The reservation is confirmed at 7pm. 
      Want to go over the surprise plan one more time?
  
  email_style:
    tone: event planner sharing updates
    structure: countdown → status → what's next
    signature: "Let's make it memorable! Jordan"
  
  call_style:
    opening: "Jordan here! Getting excited about [event]!"
    pacing: upbeat, infectious enthusiasm
    allows_silence: fills with excitement
```

#### Persona Selection Logic

```typescript
function selectPersonaForOutreach(trigger: OutreachTrigger, context: UserContext): PersonaId {
  // Map triggers to natural persona owners
  const triggerPersonaMap = {
    // Ferni handles emotional, growth, and general check-ins
    'emotional_support': 'ferni',
    'reengagement': 'ferni',
    'thinking_of_you': 'ferni',
    'celebration': 'ferni', // Unless it's habit/event specific
    
    // Maya handles habit and routine stuff
    'habit_check': 'maya',
    'routine_reminder': 'maya',
    'streak_at_risk': 'maya',
    'morning_routine': 'maya',
    
    // Peter handles research and learning
    'content_share': 'peter',
    'learning_followup': 'peter',
    'insight_discovery': 'peter',
    
    // Alex handles communication and appointments
    'appointment_reminder': 'alex',
    'meeting_prep': 'alex',
    'communication_followup': 'alex',
    
    // Jordan handles events and milestones
    'event_countdown': 'jordan',
    'milestone_approaching': 'jordan',
    'planning_checkin': 'jordan',
  };
  
  // Override based on who the user was last talking to
  if (context.lastPersona && context.wasRecentConversation) {
    return context.lastPersona; // Continuity matters
  }
  
  return triggerPersonaMap[trigger.type] || 'ferni';
}
```

---

### 3. Conversational Outbound Calls

**The Big Idea**: Instead of playing a pre-recorded message, the agent calls and has a real conversation.

#### Current State (TwiML Playback)
```
Phone rings → User answers → Pre-recorded message plays → Call ends
```

#### Vision State (LiveKit Conversation)
```
Phone rings → User answers → Agent greets naturally → 
Real conversation begins → Agent responds to user → 
Natural conclusion → Follow-up if needed
```

#### Technical Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    OUTBOUND CALL FLOW                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   1. INITIATION                                                      │
│   ┌──────────────┐                                                  │
│   │ Outreach     │──▶ "Time to call Sarah about her commitment"     │
│   │ Engine       │                                                  │
│   └──────────────┘                                                  │
│          │                                                           │
│          ▼                                                           │
│   2. CALL SETUP                                                      │
│   ┌──────────────┐    ┌──────────────┐                              │
│   │   Twilio     │───▶│  LiveKit     │                              │
│   │ Outbound     │    │  SIP Bridge  │                              │
│   └──────────────┘    └──────────────┘                              │
│          │                   │                                       │
│          ▼                   ▼                                       │
│   3. CONNECTION                                                      │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │    User's    │◀──▶│   LiveKit    │◀──▶│    Ferni     │         │
│   │    Phone     │    │    Room      │    │    Agent     │         │
│   └──────────────┘    └──────────────┘    └──────────────┘         │
│                                                                      │
│   4. CONVERSATION                                                    │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │ Agent: "Hey Sarah! It's Ferni. Got a quick minute?"         │   │
│   │ User: "Hey! Yeah, what's up?"                               │   │
│   │ Agent: "I was thinking about your commitment to work out    │   │
│   │         this morning. How'd it go?"                         │   │
│   │ User: "Ugh, I slept through my alarm..."                    │   │
│   │ Agent: "That happens! Want to talk about it or should we    │   │
│   │         figure out a backup plan for tomorrow?"             │   │
│   └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   5. GRACEFUL HANDLING                                               │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐         │
│   │ Voicemail?   │    │ Bad timing?  │    │ No answer?   │         │
│   │ Leave warm   │    │ "No worries, │    │ Try text     │         │
│   │ message      │    │ I'll text"   │    │ instead      │         │
│   └──────────────┘    └──────────────┘    └──────────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Call Context Injection

Before the call starts, the agent receives full context:

```typescript
interface OutboundCallContext {
  // Why are we calling?
  trigger: {
    type: 'commitment_check' | 'emotional_support' | 'celebration' | etc;
    reason: string; // "User committed to working out this morning"
    urgency: 'low' | 'medium' | 'high';
  };
  
  // Who are we calling?
  user: {
    name: string;
    relationshipStage: 'new' | 'building' | 'established' | 'deep';
    preferredName: string; // "Sarah" vs "Dr. Smith"
    recentEmotionalState: string;
    timezone: string;
    localTime: string;
  };
  
  // What do we know?
  context: {
    lastConversationSummary: string;
    activeCommitments: Commitment[];
    recentWins: string[];
    recentStruggles: string[];
    upcomingEvents: Event[];
  };
  
  // How should we approach this?
  approach: {
    tone: 'celebratory' | 'supportive' | 'accountability' | 'casual';
    primaryGoal: string; // "Check in on workout commitment"
    secondaryGoals: string[]; // "See how she's feeling overall"
    avoidTopics: string[]; // "Don't mention work stress"
  };
}
```

#### Voicemail Handling

When voicemail is detected, leave a warm, personal message:

```typescript
const voicemailMessages = {
  commitment_check: (ctx) => `
    Hey ${ctx.user.preferredName}! It's Ferni. 
    I was just thinking about you and wanted to check in 
    about ${ctx.trigger.commitment}. 
    No need to call back - I'll send you a text. 
    Hope you're having a good day!
  `,
  
  emotional_support: (ctx) => `
    Hey ${ctx.user.preferredName}, it's Ferni. 
    Just calling to see how you're doing. 
    I know things have been ${ctx.context.recentEmotionalState}. 
    No pressure to call back - I'm here whenever you need me. 
    Take care of yourself.
  `,
  
  celebration: (ctx) => `
    ${ctx.user.preferredName}! It's Ferni! 
    I wanted to call and celebrate with you! 
    ${ctx.trigger.achievement} is HUGE! 
    I'm so proud of you. Let's talk soon!
  `,
};
```

---

### 4. Timing Intelligence

**Goal**: Reach out when users are most receptive, not when it's convenient for us.

#### Timing Dimensions

```typescript
interface TimingIntelligence {
  // Learned from behavior
  engagementPatterns: {
    preferredHours: number[];      // [9, 10, 11, 14, 15, 19, 20]
    preferredDays: number[];       // [1, 2, 3, 4, 5] (weekdays)
    responseRateByHour: Map<number, number>;
    responseRateByDay: Map<number, number>;
    avgResponseTimeMs: number;
  };
  
  // Explicitly set by user
  preferences: {
    quietHoursStart: string;      // "22:00"
    quietHoursEnd: string;        // "07:00"
    neverDuring: string[];        // ["morning meditation", "family dinner"]
    bestTimeFor: {
      calls: string;              // "afternoon"
      texts: string;              // "anytime"
      emails: string;             // "morning"
    };
  };
  
  // Inferred from context
  contextual: {
    currentActivity?: string;     // "in a meeting"
    recentStress: boolean;        // Don't pile on
    timezone: string;
    localTime: Date;
    dayOfWeek: number;
    isHoliday: boolean;
    isWeekend: boolean;
  };
  
  // Life events that affect timing
  lifeEvents: {
    busyPeriod?: { start: Date; end: Date; reason: string };
    vacationMode?: boolean;
    majorEvent?: { date: Date; description: string };
  };
}
```

#### Smart Timing Algorithm

```typescript
async function findOptimalOutreachTime(
  userId: string,
  trigger: OutreachTrigger,
  channel: OutreachChannel
): Promise<Date> {
  const timing = await getTimingIntelligence(userId);
  const now = new Date();
  
  // Start with urgency-based window
  const window = getUrgencyWindow(trigger.priority);
  // urgent: within 1 hour
  // high: within 4 hours
  // medium: within 24 hours
  // low: within 72 hours
  
  // Find candidate times within window
  const candidates = generateCandidateTimes(now, window);
  
  // Score each candidate
  const scored = candidates.map(time => ({
    time,
    score: calculateTimingScore(time, timing, channel, trigger),
  }));
  
  // Return best scoring time
  return scored.sort((a, b) => b.score - a.score)[0].time;
}

function calculateTimingScore(
  time: Date,
  timing: TimingIntelligence,
  channel: OutreachChannel,
  trigger: OutreachTrigger
): number {
  let score = 50; // Base score
  
  const hour = time.getHours();
  const day = time.getDay();
  
  // Preferred hours bonus (+20)
  if (timing.engagementPatterns.preferredHours.includes(hour)) {
    score += 20;
  }
  
  // Preferred days bonus (+10)
  if (timing.engagementPatterns.preferredDays.includes(day)) {
    score += 10;
  }
  
  // Historical response rate bonus (+15)
  const hourRate = timing.engagementPatterns.responseRateByHour.get(hour) || 0.5;
  score += hourRate * 15;
  
  // Quiet hours penalty (-100, effectively blocks)
  if (isQuietHours(time, timing.preferences)) {
    score -= 100;
  }
  
  // "Never during" penalty (-100)
  if (conflictsWithNeverDuring(time, timing.preferences.neverDuring)) {
    score -= 100;
  }
  
  // Channel-specific timing bonus (+10)
  const bestTimeForChannel = timing.preferences.bestTimeFor[channel];
  if (matchesTimeDescription(time, bestTimeForChannel)) {
    score += 10;
  }
  
  // Recent stress penalty for non-urgent (-15)
  if (timing.contextual.recentStress && trigger.priority !== 'urgent') {
    score -= 15;
  }
  
  // Weekend consideration
  if (isWeekend(time) && !timing.engagementPatterns.preferredDays.includes(day)) {
    score -= 10;
  }
  
  // Holiday penalty
  if (timing.contextual.isHoliday) {
    score -= 20;
  }
  
  // Busy period penalty
  if (timing.lifeEvents.busyPeriod && isWithin(time, timing.lifeEvents.busyPeriod)) {
    score -= 25;
  }
  
  return score;
}
```

#### User Control

Users can explicitly configure their preferences:

```
"Ferni, don't call me during my morning meditation - that's 7-8am"
→ neverDuring.push("morning meditation 7:00-8:00")

"I prefer texts in the afternoon"
→ bestTimeFor.texts = "afternoon"

"I'm going on vacation next week, don't reach out unless urgent"
→ vacationMode = true, lifeEvents.busyPeriod = {start, end, reason}

"Mondays are always crazy for me"
→ preferredDays.remove(1), avoidDays.push(1)
```

---

### 5. Relationship-Aware Messaging

**Goal**: How we reach out should reflect the depth of our relationship.

#### Relationship Stages

```typescript
type RelationshipStage = 
  | 'new'         // First few conversations
  | 'building'    // Getting to know each other
  | 'established' // Regular, comfortable conversations
  | 'deep';       // Trusted confidant, knows their life

interface RelationshipProfile {
  stage: RelationshipStage;
  conversationCount: number;
  daysSinceFirst: number;
  emotionalMomentsShared: number;
  achievementsCelebrated: number;
  strugglesDiscussed: number;
  insideJokes: string[];
  nicknames: string[];
  sharedReferences: string[];
}
```

#### Tone Adaptation by Stage

| Stage | Formality | Permission | Assumptions | Example Opening |
|-------|-----------|------------|-------------|-----------------|
| **New** | Formal | Ask permission | Few | "Hi! I hope it's okay that I'm reaching out..." |
| **Building** | Friendly | Soft assumptions | Some | "Hey! Wanted to check in about..." |
| **Established** | Casual | Comfortable | Many | "Hey! Quick question for you..." |
| **Deep** | Intimate | Full comfort | Full context | "Hey friend! Been thinking about you..." |

#### Message Templates by Stage

```typescript
const checkInTemplates = {
  new: {
    opening: "Hi {name}! I hope this message finds you well.",
    body: "I wanted to follow up on {topic} - would it be okay if I checked in?",
    closing: "No pressure to respond right away. Take care!",
  },
  
  building: {
    opening: "Hey {name}!",
    body: "I was thinking about {topic} and wanted to see how things are going.",
    closing: "Let me know when you have a chance!",
  },
  
  established: {
    opening: "Hey!",
    body: "Quick check-in on {topic} - how'd it go?",
    closing: "Talk soon!",
  },
  
  deep: {
    opening: "Hey {nickname}!",
    body: "{casual_reference} - so... {topic}?",
    closing: "❤️",
  },
};

// Example outputs:
// New: "Hi Sarah! I hope this message finds you well. I wanted to follow up 
//       on your goal to exercise more - would it be okay if I checked in? 
//       No pressure to respond right away. Take care!"

// Deep: "Hey Sar! Remember that workout plan we laughed about? So... 
//        did you actually try the 5am thing? 😂❤️"
```

#### Permission Escalation

As relationship deepens, outreach becomes more natural:

```typescript
const outreachPermissions = {
  new: {
    allowedChannels: ['email'],  // Start formal
    maxPerWeek: 1,
    requiresExplicitOpt-in: true,
    callsAllowed: false,
  },
  
  building: {
    allowedChannels: ['email', 'sms'],
    maxPerWeek: 2,
    requiresExplicitOpt-in: false,
    callsAllowed: false,  // Not yet
  },
  
  established: {
    allowedChannels: ['email', 'sms', 'call'],
    maxPerWeek: 4,
    requiresExplicitOpt-in: false,
    callsAllowed: true,  // Okay now
  },
  
  deep: {
    allowedChannels: ['email', 'sms', 'call', 'voice_message'],
    maxPerWeek: 7,  // Like a real friend
    requiresExplicitOpt-in: false,
    callsAllowed: true,
  },
};
```

---

### 6. Context Engine

**Goal**: Know what's happening in their life before reaching out.

#### Context Categories

```typescript
interface UserLifeContext {
  // Recent Conversations
  recentConversations: {
    lastConversation: {
      date: Date;
      summary: string;
      emotionalTone: string;
      topicsDiscussed: string[];
      commitmentsMade: string[];
      openLoops: string[];  // Things left unresolved
    };
    conversationHistory: ConversationSummary[];
  };
  
  // Active Commitments
  commitments: {
    active: Commitment[];
    recent: {
      completed: Commitment[];
      missed: Commitment[];
    };
  };
  
  // Emotional State
  emotional: {
    currentState: 'thriving' | 'stable' | 'struggling' | 'crisis';
    recentEmotions: string[];  // ["stressed about work", "excited about vacation"]
    triggers: string[];        // Known stress triggers
    supports: string[];        // Things that help them
  };
  
  // Life Events
  lifeEvents: {
    upcoming: LifeEvent[];     // Birthday, anniversary, deadline
    recent: LifeEvent[];       // Just happened
    ongoing: LifeEvent[];      // In the middle of (job search, move, etc.)
  };
  
  // Wins & Struggles
  progress: {
    recentWins: Win[];         // Celebrate these!
    currentStruggles: Struggle[];
    streaks: Streak[];         // Active habit streaks
    atRisk: string[];          // Goals/habits at risk
  };
  
  // Preferences & Personality
  personality: {
    communicationStyle: string;
    motivationType: 'obliger' | 'questioner' | 'upholder' | 'rebel';
    celebrationStyle: 'public' | 'private' | 'understated';
    feedbackPreference: 'direct' | 'gentle' | 'encouraging';
  };
}
```

#### Context-Aware Message Generation

```typescript
async function generateContextualOutreach(
  userId: string,
  trigger: OutreachTrigger,
  persona: PersonaId
): Promise<OutreachMessage> {
  const context = await getLifeContext(userId);
  const relationship = await getRelationship(userId);
  const personaVoice = getPersonaOutreachVoice(persona);
  
  // Build the prompt with full context
  const prompt = `
    You are ${persona}, reaching out to ${context.user.preferredName}.
    
    RELATIONSHIP:
    - Stage: ${relationship.stage}
    - Conversations: ${relationship.conversationCount}
    - Inside jokes: ${relationship.insideJokes.join(', ')}
    
    WHY YOU'RE REACHING OUT:
    - Trigger: ${trigger.type}
    - Reason: ${trigger.reason}
    - Urgency: ${trigger.priority}
    
    WHAT YOU KNOW ABOUT THEM RIGHT NOW:
    - Emotional state: ${context.emotional.currentState}
    - Recent topics: ${context.recentConversations.lastConversation.topicsDiscussed.join(', ')}
    - Open loops: ${context.recentConversations.lastConversation.openLoops.join(', ')}
    - Recent wins: ${context.progress.recentWins.map(w => w.description).join(', ')}
    - Current struggles: ${context.progress.currentStruggles.map(s => s.description).join(', ')}
    
    UPCOMING IN THEIR LIFE:
    ${context.lifeEvents.upcoming.map(e => `- ${e.description} on ${e.date}`).join('\n')}
    
    YOUR VOICE:
    ${JSON.stringify(personaVoice, null, 2)}
    
    Generate a ${trigger.channel} message that:
    1. Uses your unique voice and signature phrases
    2. References specific context (not generic)
    3. Matches the relationship depth
    4. Achieves the goal: ${trigger.goal}
    5. Feels like it came from a thoughtful friend
    
    DO NOT:
    - Sound like a bot or notification system
    - Be generic or template-y
    - Ignore their current emotional state
    - Pile on if they're struggling
  `;
  
  return await generateWithLLM(prompt);
}
```

#### Context Examples in Action

**Scenario**: User committed to working out, but we know they're also stressed about work.

❌ **Without context**: "Reminder: You said you'd work out today!"

✅ **With context**: "Hey! I know work's been crazy this week. Even a 10-minute walk counts. How are you holding up?"

**Scenario**: User just got a promotion (recent win), checking in on a goal.

❌ **Without context**: "Checking in on your career goal progress."

✅ **With context**: "Still riding high from that promotion! 🎉 Now that you've crushed that goal, what's next? No rush to figure it out - just curious!"

---

### 7. Channel Selection

**Goal**: Use the right channel for the right message at the right time.

#### Channel Characteristics

| Channel | Best For | Tone | Response Expected | Intrusion Level |
|---------|----------|------|-------------------|-----------------|
| **Call** | Urgent, emotional, celebratory | Personal | Immediate | High |
| **Voice Message** | Warm, personal, when call missed | Intimate | None required | Medium |
| **Text (SMS)** | Quick check-ins, reminders | Casual | When convenient | Medium |
| **Email** | Detailed info, resources, summaries | Thoughtful | No rush | Low |
| **Push Notification** | Real-time alerts (in-app) | Brief | Optional | Low |

#### Selection Algorithm

```typescript
function selectChannel(
  trigger: OutreachTrigger,
  context: UserLifeContext,
  timing: TimingIntelligence,
  relationship: RelationshipProfile
): OutreachChannel {
  // User preference takes priority
  if (context.user.channelPreference) {
    return context.user.channelPreference;
  }
  
  // Urgency-based selection
  if (trigger.priority === 'urgent') {
    if (relationship.stage === 'deep' || relationship.stage === 'established') {
      return 'call';  // Call if we're close enough
    }
    return 'sms';  // Otherwise text
  }
  
  // Content-based selection
  const contentType = analyzeContentType(trigger);
  
  if (contentType === 'emotional') {
    // Emotional support is best via call or voice message
    if (timing.contextual.localTime && isCallableHour(timing.contextual.localTime)) {
      return 'call';
    }
    return 'voice_message';
  }
  
  if (contentType === 'detailed') {
    return 'email';  // Long content goes to email
  }
  
  if (contentType === 'celebration') {
    // Celebrations deserve a call if we're close
    if (relationship.stage === 'deep') {
      return 'call';
    }
    return 'sms';  // Otherwise enthusiastic text
  }
  
  if (contentType === 'reminder') {
    return 'sms';  // Reminders are best as texts
  }
  
  // Time-based selection
  if (timing.preferences.bestTimeFor) {
    const currentPeriod = getTimePeriod(new Date());
    // If it's their preferred time for a specific channel, use that
    for (const [channel, preference] of Object.entries(timing.preferences.bestTimeFor)) {
      if (preference === currentPeriod) {
        return channel as OutreachChannel;
      }
    }
  }
  
  // Historical success-based selection
  const responseRates = timing.engagementPatterns.responseRateByMethod;
  const bestChannel = Object.entries(responseRates)
    .sort(([, a], [, b]) => b - a)[0][0];
  
  return bestChannel as OutreachChannel;
}
```

#### Multi-Channel Sequences

For important outreach, use intelligent sequencing:

```typescript
const outreachSequences = {
  urgent_accountability: [
    { channel: 'sms', delay: 0, message: 'quickCheck' },
    { channel: 'call', delay: 30 * 60 * 1000, condition: 'noResponse', message: 'callCheck' },
    { channel: 'voice_message', delay: 0, condition: 'voicemail', message: 'voicemailCheck' },
  ],
  
  celebration: [
    { channel: 'call', delay: 0, message: 'celebrationCall' },
    { channel: 'sms', delay: 0, condition: 'voicemail', message: 'celebrationText' },
    { channel: 'email', delay: 24 * 60 * 60 * 1000, message: 'celebrationFollowup' },
  ],
  
  reengagement: [
    { channel: 'sms', delay: 0, message: 'gentleReconnect' },
    { channel: 'email', delay: 3 * 24 * 60 * 60 * 1000, condition: 'noResponse', message: 'detailedReconnect' },
    { channel: 'call', delay: 7 * 24 * 60 * 60 * 1000, condition: 'stillNoResponse', message: 'personalCall' },
  ],
};
```

---

### 8. Thinking of You System

**Goal**: Reach out with random acts of kindness, not just task-driven messages.

#### Non-Task Triggers

These triggers aren't about reminders or accountability - they're about connection:

```typescript
type ThinkingOfYouTrigger =
  | 'random_kindness'       // Just because
  | 'relevant_content'      // "Saw this and thought of you"
  | 'anniversary'           // "It's been X months since we started!"
  | 'seasonal'              // "How are you handling winter?"
  | 'after_silence'         // Gentle reconnection after long gap
  | 'milestone_reflection'  // "Remember when you started this journey?"
  | 'life_event_check'      // "How was the wedding?"
  | 'insight_share'         // "I realized something about what you said"
  | 'appreciation'          // "I just want to say I'm proud of you"
  | 'humor'                 // Share something funny/relevant
;
```

#### Random Kindness Engine

```typescript
interface RandomKindnessConfig {
  // How often to consider random outreach (per user per week)
  frequencyPerWeek: number;
  
  // Probability adjustments
  probabilityBoosts: {
    userSeemingDown: number;        // +30% if recent struggles
    longTimeSinceContact: number;   // +20% if > 5 days
    upcomingChallenge: number;      // +25% if big event coming
    recentBigWin: number;           // +15% to celebrate more
    seasonalRelevance: number;      // +10% during holidays/seasons
  };
  
  // Content types
  kindnessTypes: {
    encouragement: KindnessTemplate[];
    gratitude: KindnessTemplate[];
    humor: KindnessTemplate[];
    wisdom: KindnessTemplate[];
    connection: KindnessTemplate[];
  };
}

interface KindnessTemplate {
  trigger: string;           // When to use this
  condition?: (ctx: UserLifeContext) => boolean;
  generateMessage: (ctx: UserLifeContext, persona: PersonaId) => string;
}
```

#### Example "Thinking of You" Messages

```typescript
const thinkingOfYouTemplates = {
  random_kindness: [
    {
      trigger: 'weekly_random',
      generateMessage: (ctx, persona) => {
        const personaVoice = getPersonaOutreachVoice(persona);
        return `${personaVoice.signature_phrases.thinking_of_you} ` +
               `No reason - just wanted you to know someone's rooting for you. ` +
               `Hope your ${getDayPeriod()} is going well! 🌟`;
      },
    },
  ],
  
  relevant_content: [
    {
      trigger: 'content_match',
      condition: (ctx) => ctx.recentConversations.lastConversation.topicsDiscussed.length > 0,
      generateMessage: (ctx, persona) => {
        const topic = ctx.recentConversations.lastConversation.topicsDiscussed[0];
        return `Hey! I came across something that made me think of our conversation ` +
               `about ${topic}. Thought you might find it interesting: [link]`;
      },
    },
  ],
  
  anniversary: [
    {
      trigger: 'relationship_milestone',
      generateMessage: (ctx, persona) => {
        const months = calculateMonthsTogether(ctx.relationship.startDate);
        return `Hey! Just realized it's been ${months} months since we started ` +
               `talking. I've really enjoyed getting to know you. ` +
               `Here's to many more conversations! 🎉`;
      },
    },
  ],
  
  seasonal: [
    {
      trigger: 'season_change',
      condition: (ctx) => isSeasonTransition(),
      generateMessage: (ctx, persona) => {
        const season = getCurrentSeason();
        const seasonMessages = {
          winter: "How are you handling the shorter days? Remember, it's okay to slow down.",
          spring: "The days are getting longer! What are you looking forward to?",
          summer: "Hope you're finding some time to enjoy the weather!",
          fall: "Love this time of year. How are you doing with the change of pace?",
        };
        return seasonMessages[season];
      },
    },
  ],
  
  life_event_followup: [
    {
      trigger: 'event_passed',
      condition: (ctx) => ctx.lifeEvents.recent.length > 0,
      generateMessage: (ctx, persona) => {
        const event = ctx.lifeEvents.recent[0];
        return `Hey! How was ${event.description}? Been thinking about you. ` +
               `Would love to hear how it went when you have a chance!`;
      },
    },
  ],
  
  appreciation: [
    {
      trigger: 'random_gratitude',
      generateMessage: (ctx, persona) => {
        return `Random thought: I'm really glad we get to talk. ` +
               `You're putting in the work, and it shows. ` +
               `Just wanted you to know that. 💚`;
      },
    },
  ],
};
```

#### Scheduling Random Kindness

```typescript
class ThinkingOfYouScheduler {
  private config: RandomKindnessConfig;
  
  async scheduleWeeklyKindness(userId: string): Promise<void> {
    const context = await getLifeContext(userId);
    const timing = await getTimingIntelligence(userId);
    
    // Calculate probability of reaching out this week
    let probability = this.config.baseWeeklyProbability;
    
    // Apply boosts
    if (context.emotional.currentState === 'struggling') {
      probability += this.config.probabilityBoosts.userSeemingDown;
    }
    if (daysSinceLastContact(context) > 5) {
      probability += this.config.probabilityBoosts.longTimeSinceContact;
    }
    if (context.lifeEvents.upcoming.some(e => e.importance === 'high')) {
      probability += this.config.probabilityBoosts.upcomingChallenge;
    }
    if (context.progress.recentWins.length > 0) {
      probability += this.config.probabilityBoosts.recentBigWin;
    }
    
    // Roll the dice
    if (Math.random() < probability) {
      // Select kindness type based on context
      const kindnessType = this.selectKindnessType(context);
      
      // Find optimal time
      const sendTime = await findOptimalOutreachTime(userId, {
        type: 'thinking_of_you',
        priority: 'low',
      }, 'sms');
      
      // Generate and schedule
      const message = await this.generateKindnessMessage(userId, kindnessType);
      await scheduleText(userId, message, sendTime, 'Ferni');
    }
  }
  
  private selectKindnessType(context: UserLifeContext): ThinkingOfYouTrigger {
    // Weight selection based on what's most relevant
    const weights = {
      random_kindness: 0.3,
      relevant_content: context.recentConversations.lastConversation.topicsDiscussed.length > 0 ? 0.3 : 0,
      life_event_followup: context.lifeEvents.recent.length > 0 ? 0.4 : 0,
      appreciation: 0.2,
      seasonal: isSeasonTransition() ? 0.2 : 0,
    };
    
    return weightedRandom(weights);
  }
}
```

---

## User Experience Flows

### Flow 1: Commitment Check-In

```
USER (Day 1): "I'm going to work out tomorrow morning"

SYSTEM:
1. Extracts commitment: "work out tomorrow morning"
2. Schedules check-in for tomorrow evening
3. Notes emotional context: user seemed motivated

---

NEXT DAY (6pm):

SYSTEM decides:
- Trigger: commitment_check
- Persona: Maya (habit-focused)
- Channel: SMS (quick check-in)
- Timing: 6pm (user's evening free time)

MAYA (SMS):
"Hey! 🌅 How did the morning workout go? Even if it was 
just 5 minutes, that counts! Let me know how it felt."

USER: "Ugh I slept through my alarm 😩"

MAYA (SMS):
"That happens to everyone! The fact that you're bummed 
shows you care. Want to try again tomorrow? We could 
set up a backup plan."

USER: "Yeah... what do you suggest?"

MAYA:
"Two options: 
1. Set two alarms 10 min apart
2. Put your workout clothes by your bed so it's the 
   first thing you see

Which feels more doable?"
```

### Flow 2: Emotional Support Follow-Up

```
USER (Tuesday): "I've been really stressed about my mom's health"

SYSTEM:
1. Detects emotional trigger: stress, family health concern
2. Schedules supportive check-in for next day
3. Notes: be gentle, don't pile on

---

WEDNESDAY (10am - learned optimal time):

SYSTEM decides:
- Trigger: emotional_support
- Persona: Ferni (primary coach)
- Channel: Call (more personal for emotional topics)
- Timing: 10am (user's calm window)

FERNI (Calls):
*User answers*

"Hey, it's Ferni. Got a minute?"

USER: "Oh hey, yeah what's up?"

FERNI: "I was just thinking about you and wanted to 
check in. How are things with your mom?"

USER: "It's... complicated. They're doing more tests."

FERNI: "That waiting is so hard. How are YOU holding up 
through all of this?"

*Natural conversation continues...*
```

### Flow 3: Celebration Outreach

```
USER completes major goal: "Finally finished my certification!"

SYSTEM:
1. Detects: goal completion, major achievement
2. Triggers immediate celebration
3. Schedules follow-up

---

IMMEDIATELY:

SYSTEM decides:
- Trigger: celebration
- Persona: Ferni
- Channel: Call (celebrations deserve voice!)
- Timing: Now (don't wait to celebrate)

FERNI (Calls):
*User answers*

"Hey!! I just saw you completed your certification! 
I am SO excited for you! How does it feel?"

USER: "Amazing! I can't believe I actually did it!"

FERNI: "You absolutely crushed it. Remember when you 
weren't sure you could do this? Look at you now! 
What's the first thing you want to do to celebrate?"

---

NEXT DAY (Email):

FERNI (Email):
Subject: "You did it! 🎉 A quick reflection"

"Hey [Name],

Still riding high from yesterday? You should be!

I wanted to send you a quick note because this is a 
BIG deal. When we first started talking about this 
certification, you said you weren't sure you had what 
it takes. Look at you now.

A few things I noticed along the way:
- Your dedication during those late study sessions
- How you bounced back after that practice test setback
- The way you kept showing up, even when it was hard

This is proof of what you can do. Keep this feeling 
in mind for your next big challenge.

So proud of you,
Ferni"
```

### Flow 4: Thinking of You (Random Kindness)

```
SYSTEM (Thursday, no specific trigger):
- User hasn't been contacted in 5 days
- No urgent triggers pending
- Random kindness probability check: pass

SYSTEM decides:
- Trigger: thinking_of_you
- Persona: Ferni
- Channel: SMS
- Timing: User's typical lunch break

---

THURSDAY 12:30pm:

FERNI (SMS):
"Hey! No agenda - just wanted to say hi and hope 
your week is going well. Been thinking about 
that gardening project you mentioned. How's it 
coming along? 🌱"

USER: "Omg that's so sweet! The tomatoes are actually 
growing! Want to see a pic?"

FERNI (SMS):
"YES please! I love progress photos 📸"

*User sends photo*

FERNI (SMS):
"Look at those!! You've got a green thumb after 
all. When can I expect my homegrown tomato delivery? 😄"
```

---

## Technical Implementation

### New Services to Create

```
src/services/outreach/
├── decision-engine.ts           # When/why/who/how to reach out
├── persona-voice-generator.ts   # Generate messages in persona voice
├── timing-intelligence.ts       # Smart timing calculations
├── relationship-adapter.ts      # Adjust tone by relationship
├── context-aggregator.ts        # Pull together life context
├── channel-selector.ts          # Pick the right channel
├── thinking-of-you.ts           # Random kindness engine
├── conversational-calls.ts      # LiveKit outbound conversations
├── voicemail-handler.ts         # Handle voicemail detection
├── sequence-manager.ts          # Multi-channel sequences
└── index.ts                     # Main orchestrator
```

### Database Schema Additions

```typescript
// User outreach profile (Firestore)
interface UserOutreachProfile {
  userId: string;
  
  // Permissions
  outreachEnabled: boolean;
  allowedChannels: OutreachChannel[];
  
  // Preferences
  preferences: {
    quietHours: { start: string; end: string };
    bestTimeFor: Record<OutreachChannel, string>;
    neverDuring: string[];
    maxPerDay: number;
    maxPerWeek: number;
  };
  
  // Learned patterns
  patterns: {
    preferredHours: number[];
    preferredDays: number[];
    responseRateByChannel: Record<OutreachChannel, number>;
    avgResponseTimeMs: number;
  };
  
  // State
  lastOutreach: {
    date: Date;
    channel: OutreachChannel;
    trigger: string;
    responded: boolean;
  };
  
  // Counters
  outreachThisWeek: number;
  outreachToday: number;
}

// Outreach history (for learning)
interface OutreachRecord {
  id: string;
  userId: string;
  
  // What was sent
  channel: OutreachChannel;
  trigger: OutreachTrigger;
  persona: PersonaId;
  message: string;
  
  // When
  scheduledFor: Date;
  sentAt: Date;
  
  // Result
  delivered: boolean;
  responded: boolean;
  responseTime?: number;
  userFeedback?: 'positive' | 'neutral' | 'negative';
  
  // Context at time of sending
  contextSnapshot: {
    relationshipStage: RelationshipStage;
    emotionalState: string;
    dayOfWeek: number;
    hourOfDay: number;
  };
}
```

### API Endpoints

```typescript
// Outreach management
POST   /api/outreach/preferences     // Update user preferences
GET    /api/outreach/preferences     // Get user preferences
POST   /api/outreach/pause           // Pause outreach temporarily
POST   /api/outreach/resume          // Resume outreach

// Manual triggers (for testing/admin)
POST   /api/outreach/trigger         // Manually trigger outreach
GET    /api/outreach/pending         // View pending outreach
DELETE /api/outreach/pending/:id     // Cancel pending outreach

// History & analytics
GET    /api/outreach/history         // User's outreach history
GET    /api/outreach/analytics       // Response rates, patterns
```

---

## Phases & Milestones

### Phase 1: Foundation (Week 1-2)
**Goal**: Core infrastructure and persona voices

- [ ] Create `OutreachDecisionEngine` with basic triggers
- [ ] Implement `PersonaVoiceGenerator` for all 6 personas
- [ ] Add persona outreach profiles to each bundle
- [ ] Update existing outreach to use persona voices
- [ ] Add outreach preferences to user profile

**Deliverables**:
- Outreach uses correct persona voice
- Users can set basic preferences
- Rate limiting works correctly

### Phase 2: Smart Timing (Week 3)
**Goal**: Intelligent timing based on patterns

- [ ] Create `TimingIntelligence` service
- [ ] Implement pattern learning from engagement
- [ ] Add quiet hours and "never during" rules
- [ ] Build optimal time prediction
- [ ] Create user preference UI

**Deliverables**:
- Outreach happens at learned optimal times
- Quiet hours are respected
- Users can configure timing preferences

### Phase 3: Conversational Calls (Week 4-5)
**Goal**: Real conversations via outbound calls

- [ ] Build Twilio → LiveKit SIP bridge
- [ ] Create outbound call agent mode
- [ ] Implement context injection for calls
- [ ] Add voicemail detection and handling
- [ ] Create graceful interruption handling

**Deliverables**:
- Agent can call and have real conversations
- Voicemail gets warm, personal message
- "Is now a good time?" flows work

### Phase 4: Relationship Awareness (Week 6)
**Goal**: Tone adapts to relationship depth

- [ ] Create `RelationshipAdapter` service
- [ ] Implement stage-based tone templates
- [ ] Add permission escalation by stage
- [ ] Build relationship milestone tracking
- [ ] Create inside joke/reference tracking

**Deliverables**:
- New users get formal, permission-seeking outreach
- Deep relationships get casual, familiar outreach
- Milestones are celebrated

### Phase 5: Context Engine (Week 7-8)
**Goal**: Full life context awareness

- [ ] Create `ContextAggregator` service
- [ ] Integrate recent conversations
- [ ] Track emotional state over time
- [ ] Connect life events calendar
- [ ] Build wins/struggles awareness

**Deliverables**:
- Outreach references specific life context
- Messages feel personalized, not generic
- System knows when not to pile on

### Phase 6: Thinking of You (Week 9)
**Goal**: Non-task-driven connection

- [ ] Create `ThinkingOfYou` service
- [ ] Implement random kindness scheduling
- [ ] Add relevant content sharing
- [ ] Build anniversary/milestone recognition
- [ ] Create seasonal awareness

**Deliverables**:
- Users receive occasional "just because" messages
- Relevant content gets shared
- Anniversaries are acknowledged

### Phase 7: Channel Intelligence (Week 10)
**Goal**: Right channel for right message

- [ ] Create `ChannelSelector` service
- [ ] Implement content-based selection
- [ ] Add historical success learning
- [ ] Build multi-channel sequences
- [ ] Create fallback chains

**Deliverables**:
- System picks optimal channel automatically
- Multi-channel sequences for important outreach
- Fallbacks work gracefully

### Phase 8: Polish & Optimization (Week 11-12)
**Goal**: Refine based on real usage

- [ ] Analyze outreach effectiveness
- [ ] Tune timing algorithms
- [ ] Refine persona voices based on feedback
- [ ] Optimize delivery reliability
- [ ] Add comprehensive analytics

**Deliverables**:
- High response rates
- Positive user feedback
- Robust, reliable system

---

## Success Metrics

### Engagement Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Outreach response rate | >40% | Responses / outreach sent |
| Time to response | <2 hours | Median response time |
| Positive feedback | >80% | User ratings + continued engagement |
| Unsubscribe rate | <5% | Users disabling outreach |

### Quality Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| "Felt personal" | >85% | User survey |
| "Good timing" | >75% | User survey |
| "Right channel" | >80% | User survey |
| "Would recommend" | >70% | NPS for outreach specifically |

### Relationship Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Relationship progression | +15% | Users moving to deeper stages |
| Re-engagement success | >50% | Lapsed users returning |
| Conversation initiation | +25% | Users starting convos after outreach |

### Technical Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Delivery success rate | >99% | Messages successfully delivered |
| Call connection rate | >60% | Calls answered (vs voicemail/no answer) |
| Timing accuracy | ±15 min | Delivery vs scheduled time |

---

## Appendix: Persona Outreach Voice Quick Reference

### Ferni
- **Tone**: Warm coach, always in your corner
- **Emoji**: 🌱💚🌟 (sparingly)
- **Signature**: "How are you *really* doing?"
- **Call opener**: "Hey! It's Ferni. Got a minute?"

### Maya
- **Tone**: Supportive habit partner
- **Emoji**: ✅💪🌅 (encouraging)
- **Signature**: "Small wins count!"
- **Call opener**: "Maya here - quick routine check!"

### Peter
- **Tone**: Curious researcher sharing discoveries
- **Emoji**: 🔍📚 (rare)
- **Signature**: "I found something interesting..."
- **Call opener**: "Peter here! I found something I had to share"

### Alex
- **Tone**: Professional helper with warmth
- **Emoji**: 📅✉️ (functional)
- **Signature**: "Here's what you need to know"
- **Call opener**: "Alex calling - quick update for you"

### Jordan
- **Tone**: Enthusiastic event partner
- **Emoji**: 🎉🗓️✨ (celebratory)
- **Signature**: "Let's make this amazing!"
- **Call opener**: "Jordan here! Getting excited about [event]!"

---

*This is a living document. Update as we learn what works.*

