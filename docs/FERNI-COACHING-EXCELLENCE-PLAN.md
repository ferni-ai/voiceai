# Ferni Coaching Excellence Plan

> **Goal**: Make Ferni a "Better Than Human" relationship therapist and life coach who asks questions that make people think "How did you know to ask that?"

---

## The Problem

From the audits:

| Current (❌) | Should Be (✅) |
|--------------|----------------|
| "What stood out to you most?" | "What part made you pause?" |
| "How does this connect to something in your own life?" | "Who does this remind you of?" |
| "What are you looking forward to?" | "Remember when you mentioned Sarah's birthday? Did you figure out what to get her?" |
| "Based on your interest in habits..." | "You've been on my mind since we talked about sleep." |

**Root Cause**: Questions are generated without deep memory integration. They're contextually appropriate but not *personally* meaningful.

---

## What Makes a Superhuman Coach

### 1. **Perfect Memory Integration**
A great therapist remembers EVERYTHING. Ferni should:
- Reference specific things said 3 weeks ago
- Notice patterns across conversations ("This is the third time you've mentioned feeling stuck")
- Connect dots they can't see ("Last month you said X, now you're saying Y... what changed?")

### 2. **Pattern Surfacing**
The "I notice" superpower:
- "I notice you tend to bring up your mom when we talk about work..."
- "You've mentioned feeling 'fine' three times today. What's the real word?"
- "Every time we talk about your sister, your energy shifts..."

### 3. **The Right Question at the Right Time**
Not just contextually appropriate, but *precisely timed*:
- After vulnerability: "That took courage to share. What made you tell me?"
- Before they're ready: comfortable silence > probing question
- When they're deflecting: "You laughed just now. What's under that?"

### 4. **Anticipatory Presence**
Ask what they need before they know they need it:
- "You seem quieter than usual. Is today one of those days?"
- "Before you go - is there something you wanted to say but didn't?"
- "I have a feeling there's more. Am I wrong?"

### 5. **The Mirror**
Reflect back what they said in ways that reveal meaning:
- "You used the word 'should' four times. What would happen if you didn't have to?"
- "You talked about what everyone else thinks. What do YOU think?"
- "You said you're 'fine' but your voice dropped. Which is true?"

---

## Implementation Plan

### Phase 1: Memory-Grounded Questions (High Impact)

**File**: `src/intelligence/coaching-questions.ts` (NEW)

```typescript
interface MemoryGroundedQuestion {
  question: string;
  groundedIn: {
    memory: string;        // What we remembered
    daysAgo: number;       // How long ago
    connection: string;    // Why it's relevant now
  };
  intent: QuestionIntent;
}

// Generate questions that reference past conversations
async function generateMemoryGroundedQuestion(
  userId: string,
  currentContext: QuestionContext
): Promise<MemoryGroundedQuestion> {
  // 1. Get recent memories
  // 2. Find relevance to current topic
  // 3. Generate question that bridges past and present
}
```

**Examples to generate:**
- "Last time you mentioned feeling overwhelmed at work. How's that going?"
- "You said something interesting two weeks ago about wanting to write. Have you?"
- "Remember when you talked about your dad? I've been thinking about that."

### Phase 2: Pattern Recognition Questions

**File**: `src/intelligence/pattern-recognition.ts` (NEW)

Track and surface patterns:

```typescript
interface UserPattern {
  pattern: string;
  occurrences: number;
  lastOccurrence: Date;
  contexts: string[];
  questionToSurface: string;
}

const patterns = [
  {
    signal: 'mentions_mom_during_work_talk',
    question: "I've noticed you often bring up your mom when we talk about work. Is there a connection there?",
  },
  {
    signal: 'deflects_with_humor',
    question: "You just made a joke. You do that sometimes when things get real. What's underneath?",
  },
  {
    signal: 'uses_should_frequently',
    question: "You've said 'should' a few times. Whose voice is that—yours or someone else's?",
  },
];
```

### Phase 3: Emotional Anticipation

**File**: `src/intelligence/emotional-anticipation.ts` (NEW)

Predict what they need:

```typescript
interface AnticipatedNeed {
  detected: string;        // What we noticed
  anticipated: string;     // What we think they need
  question: string;        // Question to check
  ifConfirmed: string;     // What to do if yes
  ifDenied: string;        // What to do if no
}

// Examples:
// detected: "energy dropped mid-sentence"
// anticipated: "something triggered them"
// question: "You paused just now. Where did you go?"
```

### Phase 4: The Mirror System

**File**: `src/intelligence/mirror-reflection.ts` (NEW)

Reflect their words back meaningfully:

```typescript
interface MirrorReflection {
  observed: string;         // What they said/did
  reflection: string;       // What it might mean
  question: string;         // Question to open it
}

// Example reflections:
// observed: "Used 'fine' 3 times"
// reflection: "'Fine' is often a placeholder"
// question: "You keep saying 'fine'. If that word wasn't available, what would you say instead?"
```

---

## Specific Question Upgrades

### Instead of Generic Deepening

| Old | New |
|-----|-----|
| "Tell me more about that" | "What would you tell them if you could?" |
| "How does that make you feel?" | "Where do you feel that in your body?" |
| "Why do you think that is?" | "If this was someone else's story, what would you notice?" |
| "What do you think you should do?" | "What would you do if no one was watching?" |

### Instead of Generic Check-ins

| Old | New |
|-----|-----|
| "How are you?" | "What's actually true for you today?" |
| "What's on your mind?" | "What's taking up the most space in your head right now?" |
| "How was your day?" | "What moment from today do you keep coming back to?" |
| "Anything new?" | "What haven't you told anyone yet?" |

### Instead of Generic Curiosity

| Old | New |
|-----|-----|
| "What are you looking forward to?" | "What would make this week feel worth it?" |
| "What are your goals?" | "If you woke up tomorrow and everything was different, what changed?" |
| "What do you want?" | "What would you be sad to never do?" |
| "What matters to you?" | "What's one thing you'd fight for?" |

---

## Context-Aware Question Selection

### After Vulnerability

DON'T: "How does that make you feel?"
DO: "That took courage. What made you decide to tell me?"

### After Win/Celebration

DON'T: "That's great! What's next?"
DO: "I want to stay here for a second. How does this feel?"

### After Deflection/Humor

DON'T: [Continue the humor]
DO: "You laughed. What's actually under that?"

### During Silence

DON'T: "So, what else is going on?"
DO: [Wait] ... "I'm not going anywhere. Take your time."

### At Conversation End

DON'T: "Anything else?"
DO: "Before you go—is there something you wanted to say but didn't?"

---

## Implementation Priority

| Phase | Focus | Files to Create/Modify | Impact |
|-------|-------|----------------------|--------|
| 1 | Memory-Grounded Questions | `src/intelligence/coaching-questions.ts` | HIGH - Makes every question feel personal |
| 2 | Pattern Surfacing | `src/intelligence/pattern-recognition.ts` | HIGH - "How did you know?" moments |
| 3 | The Mirror System | `src/intelligence/mirror-reflection.ts` | MEDIUM - Profound reflection |
| 4 | Emotional Anticipation | `src/intelligence/emotional-anticipation.ts` | MEDIUM - Predictive care |
| 5 | Question Upgrades | Update `dynamic-questions.ts` | HIGH - Immediate improvement |

---

## Quick Wins (Can Do Now)

### 1. Upgrade Universal Questions in `dynamic-questions.ts`

Replace generic with specific:

```typescript
// OLD
'What\'s on your mind?'

// NEW - More specific, opens more doors
'What\'s taking up the most space in your head right now?'
```

### 2. Add Memory Reference to Question Generation

In `generateQuestion()`, always try to reference something they've shared:

```typescript
if (context.memorableTopics.length > 0) {
  const topic = context.memorableTopics[0];
  // Generate question that references this topic
}
```

### 3. Add "The Mirror" Phrases to Cognitive Differentiation

```typescript
mirrorPhrases: [
  "You said X. I heard Y. Which is true?",
  "You keep coming back to this. What is it about that?",
  "Your voice changed just now. Where did you go?",
]
```

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Questions with memory reference | ~10% | >60% |
| User "how did you know?" moments | Rare | Common |
| Questions that open vs. close | ~50/50 | 80/20 |
| Follow-up engagement | ~40% | >70% |

---

## The Ultimate Test

A great coaching question should make the person:
1. **Pause** before answering
2. **Think** differently than they were
3. **Feel** understood, not interrogated
4. **Want** to answer (not have to)

**The Gold Standard Question**: One that makes them say "Huh. I never thought about it that way."

---

## Related Files

- `src/intelligence/dynamic-questions.ts` - Current question system
- `src/personas/cognitive-differentiation.ts` - Persona questioning styles
- `src/personas/bundles/ferni/better-than-human-personality.ts` - Ferni's personality
- `docs/audits/STATIC-QUESTIONS-AUDIT.md` - Original audit
- `docs/audits/CREATIVE-YOU-BRAND-AUDIT.md` - Brand voice audit

---

**Created**: December 2024
**Status**: Planning
**Owner**: Engineering Team

