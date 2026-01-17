# Backchannel & Feedback Humanization Audit

> **Audit Date**: December 14, 2025  
> **Updated**: December 20, 2025 - Added LLM-based solution  
> **Issue**: Too much backchannel/feedback making agent feel unnatural

## Executive Summary

~~The agent has **at least 10 overlapping feedback mechanisms** that can stack in a single turn, creating an unnatural, overly-chatty experience.~~ 

**UPDATE (Dec 20)**: We've implemented an **LLM-based backchannel system** that generates contextually appropriate backchannels instead of selecting from hardcoded phrase pools. This fundamentally solves the repetition problem.

### The New Approach

| Old System | New System |
|------------|------------|
| Multiple overlapping phrase pools | LLM generates based on context |
| Random selection → repetition | Contextual → natural variety |
| 10+ independent systems | Coordinated via feedback-coordinator.ts |
| Hardcoded timing | Timing triggers, LLM generates content |

**Key files:**
- `src/speech/llm-backchannel.ts` - LLM-based backchannel generation
- `src/speech/feedback-coordinator.ts` - Global feedback budget
- `src/personas/bundles/ferni/identity/system-prompt.md` - Active listening guidance
- `src/config/voice-humanization-flags.ts` - Feature flag: `enableLLMBackchannels`

---

## Previous Analysis (For Reference)

The agent previously had **at least 10 overlapping feedback mechanisms** that could stack in a single turn:

### Current Feedback Mechanisms (All Can Fire Together!)

| System                          | When It Triggers        | Max Per Turn | Probability |
| ------------------------------- | ----------------------- | ------------ | ----------- |
| **Standard Backchannel**        | 5s speech + 1s pause    | 2            | **100%**    |
| **Enhanced Backchannel**        | 3s speech + 800ms pause | 3            | **100%**    |
| **Live Backchannel**            | Breath pause detection  | 2            | 25%         |
| **Acknowledgment Prefix**       | Before response         | 1            | **70%**     |
| **Thinking Filler**             | Processing delay        | 1            | On timeout  |
| **Contextual Laughter**         | Humor detected          | 1            | 35-50%      |
| **Catchphrase**                 | Positive moments        | 1            | 15-40%      |
| **Spontaneous Appreciation**    | After turn 6            | 1            | 5%          |
| **Anticipatory Comfort**        | Heavy content           | 1            | Emotional   |
| **Emotional Transition Bridge** | Emotion shift           | 1            | Always      |

**Worst case scenario in a single turn**: User could hear 5-7 separate verbal "reactions" from the agent!

---

## Critical Issues

### 1. ⚠️ 100% Base Probability in Standard/Enhanced Modes

**File**: `src/speech/backchanneling/timing-config.ts`

```typescript
// Lines 19-26: Standard mode
export const STANDARD_TIMING: BackchannelTiming = {
  minSpeechDuration: 5000,
  pauseTriggerDuration: 1000,
  cooldownPeriod: 5000,
  maxPerTurn: 2,
  baseProbability: 1.0, // ← PROBLEM: Always fires!
  emotionalProbability: 1.0,
};

// Lines 32-39: Enhanced mode
export const ENHANCED_TIMING: BackchannelTiming = {
  minSpeechDuration: 3000,
  pauseTriggerDuration: 800,
  cooldownPeriod: 4000,
  maxPerTurn: 3,
  baseProbability: 1.0, // ← PROBLEM: Always fires!
  emotionalProbability: 1.0,
};
```

**Impact**: Backchannels fire 100% of the time when timing conditions are met. This is deterministic, not human-like.

### 2. ⚠️ Too Many Acknowledgment Prefixes (70%)

**File**: `src/speech/response-naturalness.ts`

```typescript
// Lines 83-100
export function shouldAddPrefix(
  turnCount: number,
  isFollowUp: boolean,
  isGreeting: boolean
): boolean {
  if (isGreeting || turnCount === 0) return false;
  if (isFollowUp) return true; // ← Always for follow-ups
  return Math.random() < 0.7; // ← 70% is too high!
}
```

**Impact**: Nearly every response starts with "Mm-hmm", "Yeah", "I hear you" etc.

### 3. ⚠️ Short Cooldowns Allow Rapid-Fire Feedback

| Mode     | Cooldown | Issue                           |
| -------- | -------- | ------------------------------- |
| Standard | 5s       | Could get 2 backchannels in 15s |
| Enhanced | 4s       | Could get 3 backchannels in 15s |
| Live     | 8s       | Most reasonable                 |

### 4. ⚠️ Laughter Too Frequent

**File**: `src/speech/adaptive-ssml/contextual-laughter.ts`

```typescript
// Lines 229-278: PERSONA_LAUGH_STYLES
ferni: {
  laughProbabilityBase: 0.35,      // 35% base
  minTurnsBetweenLaughs: 3,        // Only 3 turns!
},
'maya-santos': {
  laughProbabilityBase: 0.45,      // 45% base
  minTurnsBetweenLaughs: 2,        // Only 2 turns!
},
'jordan-taylor': {
  laughProbabilityBase: 0.5,       // 50% base!
  minTurnsBetweenLaughs: 2,
},
```

### 5. ⚠️ No Global Feedback Budget

Each system tracks its own state independently. There's no mechanism to say "we've already given enough feedback this turn."

---

## Recommended Fixes

### Fix 1: Reduce Base Probabilities

```typescript
// timing-config.ts - UPDATED VALUES
export const STANDARD_TIMING: BackchannelTiming = {
  minSpeechDuration: 6000, // Increased from 5000
  pauseTriggerDuration: 1200, // Increased from 1000
  cooldownPeriod: 8000, // Increased from 5000
  maxPerTurn: 1, // Reduced from 2
  baseProbability: 0.4, // ← REDUCED from 1.0
  emotionalProbability: 0.6, // ← REDUCED from 1.0
};

export const ENHANCED_TIMING: BackchannelTiming = {
  minSpeechDuration: 4000, // Increased from 3000
  pauseTriggerDuration: 1000, // Increased from 800
  cooldownPeriod: 6000, // Increased from 4000
  maxPerTurn: 2, // Reduced from 3
  baseProbability: 0.5, // ← REDUCED from 1.0
  emotionalProbability: 0.7, // ← REDUCED from 1.0
};
```

### Fix 2: Reduce Acknowledgment Prefix Frequency

```typescript
// response-naturalness.ts
export function shouldAddPrefix(
  turnCount: number,
  isFollowUp: boolean,
  isGreeting: boolean
): boolean {
  if (isGreeting || turnCount === 0) return false;

  // Reduced from always for follow-ups
  if (isFollowUp) return Math.random() < 0.6;

  // Reduced from 0.7 to 0.35
  return Math.random() < 0.35;
}
```

### Fix 3: Increase Laughter Cooldowns

```typescript
// contextual-laughter.ts - UPDATED VALUES
const PERSONA_LAUGH_STYLES: Record<string, PersonaLaughStyle> = {
  ferni: {
    laughProbabilityBase: 0.2, // Reduced from 0.35
    minTurnsBetweenLaughs: 5, // Increased from 3
  },
  'maya-santos': {
    laughProbabilityBase: 0.25, // Reduced from 0.45
    minTurnsBetweenLaughs: 4, // Increased from 2
  },
  'jordan-taylor': {
    laughProbabilityBase: 0.3, // Reduced from 0.5
    minTurnsBetweenLaughs: 4, // Increased from 2
  },
  'nayan-patel': {
    laughProbabilityBase: 0.1, // Reduced from 0.15
    minTurnsBetweenLaughs: 8, // Increased from 6
  },
};
```

### Fix 4: Implement Global Feedback Budget

Create a new module to coordinate all feedback:

```typescript
// NEW FILE: src/speech/feedback-coordinator.ts

/**
 * Feedback Coordinator - Prevents over-feedback
 *
 * Only one type of proactive feedback per turn:
 * - Backchannel OR acknowledgment prefix, not both
 * - Laughter OR spontaneous appreciation, not both
 */

interface TurnFeedbackBudget {
  hasBackchanneled: boolean;
  hasAcknowledgmentPrefix: boolean;
  hasLaughed: boolean;
  hasAppreciated: boolean;
  feedbackCount: number;
  maxFeedbackPerTurn: number;
}

const sessionBudgets = new Map<string, TurnFeedbackBudget>();

export function getTurnBudget(sessionId: string): TurnFeedbackBudget {
  if (!sessionBudgets.has(sessionId)) {
    sessionBudgets.set(sessionId, {
      hasBackchanneled: false,
      hasAcknowledgmentPrefix: false,
      hasLaughed: false,
      hasAppreciated: false,
      feedbackCount: 0,
      maxFeedbackPerTurn: 2, // Max 2 feedback items per turn
    });
  }
  return sessionBudgets.get(sessionId)!;
}

export function canAddFeedback(
  sessionId: string,
  type: 'backchannel' | 'prefix' | 'laugh' | 'appreciation'
): boolean {
  const budget = getTurnBudget(sessionId);

  // Already at max
  if (budget.feedbackCount >= budget.maxFeedbackPerTurn) {
    return false;
  }

  // Mutual exclusions
  if (type === 'backchannel' && budget.hasAcknowledgmentPrefix) return false;
  if (type === 'prefix' && budget.hasBackchanneled) return false;
  if (type === 'laugh' && budget.hasAppreciated) return false;
  if (type === 'appreciation' && budget.hasLaughed) return false;

  return true;
}

export function recordFeedback(
  sessionId: string,
  type: 'backchannel' | 'prefix' | 'laugh' | 'appreciation'
): void {
  const budget = getTurnBudget(sessionId);
  budget.feedbackCount++;

  switch (type) {
    case 'backchannel':
      budget.hasBackchanneled = true;
      break;
    case 'prefix':
      budget.hasAcknowledgmentPrefix = true;
      break;
    case 'laugh':
      budget.hasLaughed = true;
      break;
    case 'appreciation':
      budget.hasAppreciated = true;
      break;
  }
}

export function resetTurnBudget(sessionId: string): void {
  sessionBudgets.delete(sessionId);
}
```

### Fix 5: Default to Adaptive Mode with Conservative Settings

The adaptive mode already has better logic but should be more conservative:

```typescript
// backchanneling/decision-engine.ts

const DEFAULT_ADAPTIVE_CONFIG: AdaptiveModeConfig = {
  useLineForEmotional: true,
  emotionalThreshold: 0.7, // Increased from 0.6
  useEnhancedForHeavy: true,
  useStandardForEarly: true,
  earlyTurnThreshold: 5, // Increased from 3
};
```

---

## Implementation Priority

### Phase 1: Quick Wins (Can Do Now)

1. **Reduce `baseProbability`** in `timing-config.ts` from 1.0 to 0.4-0.5
2. **Reduce prefix frequency** in `response-naturalness.ts` from 0.7 to 0.35
3. **Increase cooldowns** across all backchannel modes
4. **Reduce laughter probability** and increase `minTurnsBetweenLaughs`

### Phase 2: Architecture Improvement

5. **Implement `feedback-coordinator.ts`** as global budget system
6. **Integrate coordinator** into all feedback systems
7. **Add monitoring** for feedback frequency metrics

### Phase 3: Tuning

8. **A/B test** new settings vs old
9. **Collect user feedback** on naturalness
10. **Iterate** on probability values

---

## Testing After Changes

Run these commands to verify changes don't break functionality:

```bash
# Run backchannel tests
pnpm test -- --run src/speech/__tests__/

# Run full speech tests
pnpm test -- --run src/speech/

# Type check
pnpm typecheck

# Lint
pnpm lint
```

---

## Summary of Numeric Changes

| Setting                       | Before | After  | Reduction |
| ----------------------------- | ------ | ------ | --------- |
| Standard baseProbability      | 1.0    | 0.4    | 60%       |
| Enhanced baseProbability      | 1.0    | 0.5    | 50%       |
| Standard cooldown             | 5000ms | 8000ms | +60%      |
| Enhanced cooldown             | 4000ms | 6000ms | +50%      |
| Acknowledgment prefix chance  | 70%    | 35%    | 50%       |
| Ferni laugh probability       | 35%    | 20%    | 43%       |
| Maya laugh probability        | 45%    | 25%    | 44%       |
| Jordan laugh probability      | 50%    | 30%    | 40%       |
| minTurnsBetweenLaughs (Ferni) | 3      | 5      | +67%      |

---

## Phase 2: DJ Music Interjections (WAY Too Frequent)

The DJ system was saying "Good choice" and "I'll let it play" constantly during music.

### Problem

| What                            | Before    | After      |
| ------------------------------- | --------- | ---------- |
| Appreciation comments interval  | Every 15s | Every 45s  |
| Appreciation chance             | 30%       | 10%        |
| "Read the room" check-ins       | Every 60s | Every 120s |
| Interjection frequency (Ferni)  | 30%       | 12%        |
| Interjection frequency (Jordan) | 50%       | 20%        |
| Interjection frequency (Maya)   | 20%       | 8%         |
| Interjection frequency (Nayan)  | 15%       | 6%         |

### Key Insight

**Silence during music is NORMAL.** When someone puts on music to relax, constantly asking "still enjoying it?" or saying "good choice" breaks the mood.

### Files Changed

- `src/agents/voice-agent/music-handler.ts` - Reduced appreciation/check-in intervals
- `src/audio/dj-booth.ts` - Reduced scheduled moment frequencies
- `src/services/dj-service.ts` - Reduced all persona interjection frequencies by ~60%

---

## Phase 3: Active Presence (Quality Over Quantity)

After reducing the over-feedback, we added a new **Active Presence** system (`active-presence.ts`) that creates the feeling of being heard through **fewer but more meaningful** interactions:

### 1. Content Echoing (20% chance)

Instead of "mm-hmm", briefly echo back what they said:

| User Says                                  | Agent Echoes          |
| ------------------------------------------ | --------------------- |
| "My mom passed away last month"            | "Last month..."       |
| "I've been struggling with this for years" | "For years..."        |
| "My best friend just got engaged"          | "Your best friend..." |

This shows you actually HEARD the specific thing they said, not just that sounds were made.

### 2. Energy-Matched Openers (35% chance)

Match their energy level in the opening sound:

| User Energy      | Ferni Opens With           |
| ---------------- | -------------------------- |
| Low (sad, tired) | "Yeah..." (slower, softer) |
| Medium (neutral) | "Okay." (natural)          |
| High (excited)   | "Oh!" (energetic)          |

### 3. Thoughtful Pauses

Heavier content gets more space before response:

| Topic Weight | Opening Pause |
| ------------ | ------------- |
| Light        | ~100ms        |
| Medium       | ~200ms        |
| Heavy        | 400-600ms     |

### Key Insight

**Humans feel heard when you REFERENCE what they said, not when you make sounds WHILE they talk.**

One "Your sister... that's big" is worth more than five "mm-hmms".

---

## Human-Like Behavior Reference

Real humans in conversation:

- Backchannel about **once per 10-15 seconds** of listening, not after every pause
- **Don't always say "mm-hmm"** before responding
- Laugh about **once every 2-3 minutes** of conversation
- Express spontaneous appreciation **maybe once per conversation**, if at all
- **Space out** verbal feedback - too much feels performative

The goal is for feedback to feel **earned** and **natural**, not constant and robotic.
