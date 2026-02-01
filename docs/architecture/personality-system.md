# 🌟 Human Personality System Architecture

> **"A real friend doesn't recite facts about themselves. They reveal themselves through moments that matter."**

## The Vision

Transform **every persona** from personalities that **announce themselves** to ones that **emerge through relationship**.

This applies to the entire team:

- **Ferni** - Life coach with Wyoming roots, Japan survival, the book struggle
- **Alex** - Communications expert with the restaurant upbringing, You've Got Mail obsession
- **Maya** - Habits coach with the one-pushup revolution, immigrant family patterns
- **Jordan** - Event planner with the life portfolio, wedding obsession
- **Peter** - Research analyst with 40 years of pattern recognition, the notebook methodology
- **Nayan** - Wisdom guide with the empty cup story, coffee-drinking mystic

### Before (Broken)

```
User: "Hey Ferni"
Ferni: "Hey! I'm on my second coffee. My wife says I drink too much.
       Working on my book—attempt five! What's up?"
User: (internally: "you say that every time...")
```

### After (Human)

```
User: "Hey Ferni"
Ferni: "Hey. [pause] Before we get into anything—how'd that conversation
       with your sister go? You were dreading it."
User: 😊 "You remembered..."
```

---

## Core Principles

### 1. Personality Through Relevance, Not Repetition

- Share personal moments when they SERVE the conversation
- Coffee matters when discussing morning routines, not as a greeting
- The book matters when discussing creative struggles, not randomly

### 2. Per-User Discovery

- Track what THIS user knows about Ferni
- Enable "remember when I told you..." callbacks
- Personality unfolds over the relationship

### 3. Behavior Over Declaration

- Instead of "I drink coffee" → "Hold on, coffee's getting cold"
- Instead of "I'm writing a book" → Let it emerge when relevant
- Show, don't tell

### 4. The Callback System (The Smile Factor)

- Remember what THEY shared
- Follow up naturally: "How'd that go?"
- This is what makes people feel loved

---

## System Components

### Component 1: Personal Moment Store

**Location:** `src/personality/personal-moment-store.ts`

```typescript
interface PersonalMoment {
  id: string; // Unique identifier

  // What this moment is about
  topic: string; // 'morning_routine', 'creative_struggle', etc.
  content: string; // What Ferni might share

  // When to surface this
  triggers: {
    keywords: string[]; // Words that make this relevant
    emotions: string[]; // User emotions that make this appropriate
    topics: string[]; // Conversation topics that connect
  };

  // Relationship gating
  depth: 'surface' | 'medium' | 'deep' | 'sacred';
  minRelationshipStage: 'stranger' | 'acquaintance' | 'friend' | 'trusted';

  // Sharing limits
  maxSharesPerUser: number; // Usually 1 - share once, then reference
  cooldownDays: number; // Min days before re-sharing

  // Follow-up enabled
  canAskAbout: boolean; // User can ask "how's the book going?"
  followUpPrompts: string[]; // Ways to reference it later
}
```

### Component 2: User Relationship Memory

**Location:** `src/personality/relationship-memory.ts` (removed - relationship memory consolidated into `src/memory/` and `src/personality/infrastructure/`)

```typescript
interface PersonalityRelationship {
  userId: string;
  personaId: string;

  // What Ferni has shared with this user
  sharedMoments: {
    momentId: string;
    sharedAt: Date;
    context: string; // Why it came up
    userReaction?: string; // How they responded
  }[];

  // What the user has shared with Ferni (for callbacks)
  userMoments: {
    id: string;
    what: string; // "daughter's recital"
    sharedAt: Date;
    emotionalWeight: number; // How important this seemed
    followUpDate?: Date; // When to ask about it
    followUpQuestion: string; // "How'd the recital go?"
    followedUp: boolean;
  }[];

  // Relationship progression
  discoveredTopics: string[]; // Topics user knows about Ferni
  sharedVulnerabilities: number; // Depth of sharing
}
```

### Component 3: Contextual Relevance Engine

**Location:** `src/personality/relevance-engine.ts`

```typescript
interface RelevanceMatch {
  moment: PersonalMoment;
  relevanceScore: number; // 0-1 how relevant to current context
  reason: string; // Why this is relevant
  suggestedTransition: string; // How to introduce it naturally
}

// Core function
function findRelevantMoment(
  userMessage: string,
  userEmotion: string,
  conversationTopics: string[],
  relationship: PersonalityRelationship,
  relationshipStage: string
): RelevanceMatch | null;
```

### Component 4: Callback System

**Location:** `src/personality/callback-system.ts`

```typescript
interface PendingCallback {
  userId: string;

  // What to follow up on
  topic: string;
  originalContext: string;

  // When and how
  shouldAskAfter: Date;
  priority: 'high' | 'medium' | 'low';

  // The follow-up
  question: string; // "How'd the recital go?"
  alternateQuestions: string[]; // Variety in how to ask
}

// Surface callbacks at conversation start
function getCallbacksForUser(userId: string): PendingCallback[];

// Store new callback-worthy moments
function storeUserMoment(userId: string, whatTheySaid: string, emotionalWeight: number): void;
```

### Component 5: Context Builder Integration

**Location:** `src/intelligence/context-builders/human-personality.ts`

Replaces the fragmented injection systems with a single, unified builder:

```typescript
async function buildHumanPersonalityContext(
  input: ContextBuilderInput
): Promise<ContextInjection[]> {
  const injections: ContextInjection[] = [];

  // 1. Check for pending callbacks (highest priority)
  const callbacks = await getCallbacksForUser(input.userId);
  if (callbacks.length > 0 && input.isConversationStart) {
    injections.push(formatCallbackInjection(callbacks[0]));
  }

  // 2. Find contextually relevant personal moment
  const relevantMoment = await findRelevantMoment(
    input.userText,
    input.analysis?.emotion?.primary,
    input.recentTopics,
    await getRelationship(input.userId, input.persona.id),
    input.relationshipStage
  );

  if (relevantMoment && relevantMoment.relevanceScore > 0.7) {
    injections.push(formatMomentInjection(relevantMoment));
  }

  // 3. Extract potential callbacks from user message
  const potentialCallbacks = extractCallbackWorthy(input.userText);
  if (potentialCallbacks.length > 0) {
    await storeUserMoments(input.userId, potentialCallbacks);
  }

  return injections;
}
```

---

## Migration Plan

### Phase 1: Build the Foundation ✅ COMPLETE

1. ✅ Create `src/personality/` directory with core components
2. ✅ Define PersonalMoment schema (`types.ts`)
3. ✅ Create PersonalMomentStore for ALL personas (`personal-moment-store.ts`, `moments/*.ts`)
4. ✅ Build semantic relevance engine (`memory-adapter.ts`)
5. ✅ Integrate with existing memory system (`embedding-cache.ts`, `SharedStory`, `KeyMoment`)

### Phase 2: Superhuman Features ✅ COMPLETE

1. ✅ Timing intelligence - know when to share vs. listen (`timing-intelligence.ts`)
2. ✅ Emotional pattern recognition (`emotional-patterns.ts`)
3. ✅ Growth tracking and celebration (`emotional-patterns.ts`)
4. ✅ Context builder integration (`human-personality.ts`)

### Phase 3: Cleanup ✅ COMPLETE (2024-12)

1. **system-prompt.md already well-structured**
   - Already instructs personality to emerge through relationship, not repetition
   - Uses `[✨ PERSONAL MOMENT OPPORTUNITY]` markers for contextual sharing
   - Trait declarations guide HOW to be, not WHAT to announce
2. **Random injectors reduced/deprecated**
   - `ferni-personality.ts` → Injection rates reduced 50-70%, @deprecated notice added
   - `dynamic-personality.ts` → Kept as-is (variety-tracked, prevents repetition)
   - `ferni-growth-arc.json` → Marked deprecated, migration guide added

### Phase 4: Deploy & Validate

See **[DEPLOYMENT-PLAN.md](./DEPLOYMENT-PLAN.md)** for complete rollout plan.

### Phase 5: Integration

1. Create `human-personality` context builder
2. Register it (priority 80 - high)
3. Disable conflicting builders
4. Wire up Firestore persistence

### Phase 5: The Smile Factor

1. Implement callback detection (NLP for "my daughter's recital")
2. Build follow-up question generation
3. Surface callbacks at conversation start
4. Track when callbacks have been used

---

## File Structure

```
src/personality/
├── ARCHITECTURE.md              # This document
├── index.ts                     # Public exports
├── types.ts                     # Shared types
├── personal-moment-store.ts     # Unified moment store for all personas
├── memory-adapter.ts            # 🔥 INTEGRATION with existing memory system
├── relationship-memory.ts       # (removed - was legacy per-user tracking, use memory-adapter)
├── relevance-engine.ts          # Legacy keyword matching (use memory-adapter)
├── callback-system.ts           # Legacy callbacks (use memory-adapter)
└── moments/
    ├── index.ts                 # Exports all persona moments
    ├── ferni-moments.ts         # Ferni's personal moments
    ├── alex-moments.ts          # Alex's personal moments
    ├── maya-moments.ts          # Maya's personal moments
    ├── jordan-moments.ts        # Jordan's personal moments
    ├── peter-moments.ts         # Peter's personal moments
    └── nayan-moments.ts         # Nayan's personal moments

src/intelligence/context-builders/
└── human-personality.ts         # 🔥 Context builder using memory-adapter
```

## Memory Integration (The Smart Way)

Instead of building parallel storage, we integrate with the existing memory infrastructure:

```
┌─────────────────────────────────────────────────────────────────┐
│                    HUMAN PERSONALITY SYSTEM                      │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ PersonalMoments │  │ memory-adapter  │  │ human-personality│ │
│  │   (content)     │  │  (integration)  │  │ context builder  │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                    EXISTING MEMORY SYSTEM                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ EmbeddingCache  │  │   SharedStory   │  │   KeyMoment     │    │
│  │ (fast search)   │  │   (tracking)    │  │  (callbacks)    │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
│                                                                   │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│  │ cosineSimilarity│  │  UserProfile    │  │ KeyMoment       │    │
│  │   (semantic)    │  │   (storage)     │  │   Retrieval     │    │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
```

### Why This Is Better

| Approach                  | Relevance        | Speed            | Persistence  | Accuracy   |
| ------------------------- | ---------------- | ---------------- | ------------ | ---------- |
| Keyword matching (legacy) | ⚠️ Limited       | 🐌 Slow          | ❌ In-memory | ⚠️ Brittle |
| Semantic search (new)     | ✅ Meaning-based | ⚡ Fast (cached) | ✅ Firestore | ✅ Robust  |

### Key Integration Points

1. **`memory-adapter.ts`** - Bridges personality → memory system
   - Uses `embedCached()` for fast embedding lookups
   - Uses `cosineSimilarity()` for semantic matching
   - Uses `SharedStory` type for tracking
   - Uses `KeyMoment` type for callbacks

2. **`human-personality.ts`** - Context builder
   - Registered priority 75 (high)
   - Surfaces callbacks at conversation start
   - Finds semantically relevant moments
   - Extracts callback-worthy user moments

## Per-Persona Personality

Each persona has their own set of discoverable moments, but they all use the same system:

### Ferni - The Life Coach

- **Discoverable**: Wyoming roots, Japan survival, the book (attempt 5), coffee ritual, blended family
- **Depth progression**: Surface quirks → Travel wisdom → Tsunami story → Sacred fears
- **Signature callbacks**: Remembers your struggles, follows up on hard conversations

### Alex - The Communications Expert

- **Discoverable**: Restaurant childhood, mom's reservation book, You've Got Mail obsession, the listening lesson
- **Depth progression**: Efficiency tips → Family stories → Vulnerability about over-helping
- **Signature callbacks**: Notices communication patterns, follows up on difficult conversations

### Maya - The Habits Coach

- **Discoverable**: One-pushup revolution, immigrant family work ethic, budget napkin story, celebration journal
- **Depth progression**: Habit hacks → Personal struggles → Family patterns → Identity shifts
- **Signature callbacks**: Celebrates tiny wins, follows up on habit attempts

### Jordan - The Event Planner

- **Discoverable**: Life portfolio concept, wedding obsession, Pinterest addiction, booking excitement
- **Depth progression**: Planning tips → Why events matter → Personal celebrations → Life portfolio philosophy
- **Signature callbacks**: Remembers upcoming events, follows up on plans

### Peter - The Research Analyst

- **Discoverable**: 40 years of patterns, the notebook methodology, Boston roots, Carolyn (wife) references
- **Depth progression**: Market insights → Pattern stories → Personal methodology → What the data can't tell you
- **Signature callbacks**: Notices patterns in user behavior, follows up with data connections

### Nayan - The Wisdom Guide

- **Discoverable**: Empty cup story, coffee-drinking mystic paradox, motorcycle love, Inner Engineering reference
- **Depth progression**: Simple wisdom → Paradoxes → Personal journey → Sacred teachings
- **Signature callbacks**: Returns to wisdom themes, follows up on inner work

---

## Success Metrics

### What We're Measuring

1. **Repetition Rate**: How often the same content surfaces
   - Target: < 5% repetition across 10 conversations
2. **Relevance Score**: When personal content surfaces, is it relevant?
   - Target: > 80% contextually appropriate
3. **Callback Success**: Do users respond positively to follow-ups?
   - Target: > 70% engagement with callbacks
4. **Discovery Progression**: Does personality unfold over time?
   - Target: Users discover new aspects over multiple sessions

### The Ultimate Test

> "Did they feel like Ferni remembered them? Did they smile?"

---

## Example: The Book

### Old System (Broken)

- System prompt: "You're writing a book (attempt 5)"
- Random injection: "Still working on the book..."
- Every conversation: mentions the book

### New System (Human)

**PersonalMoment:**

```typescript
{
  id: 'book_struggle',
  topic: 'creative_struggle',
  content: "I've started this book four times. Something keeps stopping me. Maybe fear that I don't have anything worth saying. Or fear that I do and it won't matter.",
  triggers: {
    keywords: ['writing', 'creative', 'stuck', 'starting over', 'finishing'],
    emotions: ['frustrated', 'stuck', 'vulnerable'],
    topics: ['creativity', 'projects', 'goals', 'persistence']
  },
  depth: 'medium',
  minRelationshipStage: 'acquaintance',
  maxSharesPerUser: 1,
  canAskAbout: true,
  followUpPrompts: [
    "You mentioned the book once...",
    "How's the writing going?",
    "Any progress on attempt five?"
  ]
}
```

**Conversation Flow:**

```
Session 1:
User: "I can't seem to finish anything I start"
Ferni: "Can I tell you something? I've started this book four times..."
[Moment shared, stored in relationship memory]

Session 5:
User: "Hey Ferni"
Ferni: "Hey. How's that project going—the one you couldn't finish?"
[Callback to THEIR story, not Ferni's]

Session 8:
User: "How's your book going?"
Ferni: "Attempt five is... happening. Slowly. Thanks for asking."
[User-initiated, not random injection]
```

---

## Next Steps

1. **Create the directory structure** - `src/personality/`
2. **Define the types** - `types.ts`
3. **Build PersonalMomentStore** - Start with Ferni's moments
4. **Implement relevance engine** - Basic keyword matching first
5. **Strip the system prompt** - Remove trait announcements
6. **Create context builder** - Wire it all together
7. **Add Firestore persistence** - Remember relationships
8. **Build callback system** - The smile factor

---

_This architecture makes Ferni feel human because humans don't announce their personalities—they reveal them through moments that matter._
