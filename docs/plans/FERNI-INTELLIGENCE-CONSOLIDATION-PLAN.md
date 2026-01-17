# 🧠 Ferni Intelligence Consolidation Plan

> **"Give the LLM WHO Ferni is, not WHAT he says. Let authentic responses emerge from character."**
> — `voice-dna.json`

## Executive Summary

Ferni's processing/thinking expressions are scattered across **15+ files** with no unified intelligence. The result: random phrase selection that feels robotic, not human. This plan consolidates everything into a single **context-aware composition system**.

---

## 🔴 Current State: The Problem

### Phrase Fragmentation Map

| File | What It Contains | Lines | Problem |
|------|------------------|-------|---------|
| `voice-dna.json` | Core philosophy + 3 processing phrases | 175 | **Philosophy not enforced** - other systems ignore it |
| `persona-phrases.ts` | `THINKING_FILLERS` - 8 per persona | 887 | Random selection, no context |
| `natural-tool-calling.ts` | `PRE_CALL_PHRASES`, `THINKING_SOUNDS` | 417 | Tool-specific, disconnected from personality |
| `meaningful-silence.ts` | `THINKING_OUT_LOUD`, `COMFORTABLE_PRESENCE` | 1359 | Massive overlap with other systems |
| `silence-presence.ts` | `SilencePresenceEngine` with cues | 466 | Its own isolated logic |
| `rich-disfluencies.ts` | `thinking_aloud` patterns | 492 | Another random injection point |
| `better-than-human-personality.ts` | Context-aware composition (unused for processing!) | 786 | **Best system but not used for this** |
| `dynamic-personality.ts` | Pool-based variety tracking | 562 | Legacy, doesn't handle processing |
| `conversation-quality.ts` | Time-of-day processing phrases | 1072 | Hardcoded per-persona strings |
| `conversation-health.ts` | Memory recovery phrases | 500+ | "Give me a second" in health context |
| `spontaneous-delight.ts` | `emotional_impact` vulnerability | 653 | "That hit me. Give me a second." |
| `vocal-fatigue.ts` | Tired voice processing sounds | 200+ | Another isolated set |

### The Same Phrase, 31 Different Ways

```
"Give me a second" appears in:
├── voice-dna.json (processing)
├── persona-phrases.ts (THINKING_FILLERS)
├── natural-tool-calling.ts (PRE_CALL_PHRASES)
├── meaningful-silence.ts (THINKING_OUT_LOUD)
├── rich-disfluencies.ts (thinking_aloud)
├── conversation-quality.ts (postLunch note)
├── conversation-health.ts (memory degradation)
├── spontaneous-delight.ts (emotional_impact)
├── vocal-fatigue.ts (tired voice)
├── silence-presence.ts (processing cue)
└── ... and 21 more locations
```

### Why This Feels Robotic

1. **No Context Awareness**: "Give me a second" is said the same way whether Ferni is:
   - Processing a tool call
   - Sitting with emotional heaviness
   - Thinking about a hard question
   - Recovering from a service issue
   - Tired late at night

2. **Random Selection**: Each system picks phrases at random from its own pool

3. **No Relationship Memory**: New user vs. trusted friend get the same phrases

4. **No Temporal Awareness**: Morning energy vs. late-night intimacy ignored

5. **No Emotional Trajectory**: Rising excitement vs. falling sadness get same treatment

---

## 🟢 Target State: Unified Processing Intelligence

### New Architecture

```
src/personas/bundles/ferni/
├── intelligence/
│   ├── processing-intelligence.ts     # 🆕 MAIN: Context-aware processing
│   ├── processing-contexts.ts         # 🆕 Context type definitions
│   ├── processing-library.ts          # 🆕 Single source of truth for phrases
│   └── index.ts                       # Re-exports
├── better-than-human-personality.ts   # Enhanced to USE processing-intelligence
├── personality-integration.ts         # Entry point that wires everything
└── content/
    └── behaviors/
        └── processing-states.json     # 🆕 JSON config for processing behaviors
```

### Core Principle: Composition Over Selection

**Instead of:**
```typescript
// ❌ Random selection from pool
const phrase = THINKING_FILLERS[personaId][Math.floor(Math.random() * length)];
```

**We do:**
```typescript
// ✅ Context-aware composition
const phrase = composeProcessingExpression({
  trigger: 'emotional_moment',       // What caused this
  emotionalWeight: 'heavy',          // How intense
  relationshipStage: 'trusted',      // How well we know them
  timeOfDay: 'late_night',           // When this is happening
  whatUserJustSaid: 'My dad died',   // Specific context
  toolInProgress: null,              // Not a tool call
  silenceDuration: 2500,             // How long they've been quiet
});
// Returns: "<break time='400ms'/>That hit me. <break time='300ms'/>I'm sitting with that."
```

---

## 📋 Implementation Phases

### Phase 1: Single Source of Truth (Week 1)

#### 1.1 Create `processing-library.ts`

All processing/thinking expressions in ONE place, organized by context:

```typescript
// src/personas/bundles/ferni/intelligence/processing-library.ts

export const PROCESSING_LIBRARY = {
  // Tool call processing - hide the mechanics
  tool_call: {
    visible: [
      { text: "Let me check...", intimacy: 0.3, duration: "short" },
      { text: "Hmm, one moment...", intimacy: 0.4, duration: "short" },
      { text: "Give me a second...", intimacy: 0.5, duration: "medium" },
    ],
    hidden: [
      // For trusted relationships - make tool usage invisible
      { text: "<break time='300ms'/>Hmm.<break time='200ms'/>", intimacy: 0.6 },
    ]
  },

  // Deep thinking - not about tools, about ideas
  thinking: {
    light: [
      { text: "Let me think about that...", intimacy: 0.3 },
      { text: "Hmm.", intimacy: 0.2 },
    ],
    deep: [
      { text: "I'm sitting with that.", intimacy: 0.6 },
      { text: "That's a hard one.", intimacy: 0.5 },
      { text: "I need a moment with that.", intimacy: 0.7 },
    ]
  },

  // Emotional processing - weight of what was shared
  emotional: {
    light: [
      { text: "<break time='200ms'/>", intimacy: 0.3 },
    ],
    medium: [
      { text: "Let me sit with that for a moment...", intimacy: 0.5 },
      { text: "<break time='400ms'/>Hmm.<break time='300ms'/>", intimacy: 0.4 },
    ],
    heavy: [
      { text: "<break time='400ms'/>That hit me. <break time='300ms'/>Give me a second.", intimacy: 0.8 },
      { text: "<break time='500ms'/>I... <break time='300ms'/>I need a moment with that.", intimacy: 0.9 },
      { text: "<break time='600ms'/>", intimacy: 0.7 }, // Pure silence
    ]
  },

  // Time-of-day awareness
  temporal: {
    late_night: {
      processing: [
        { text: "<break time='400ms'/>Late night thoughts...<break time='300ms'/>", intimacy: 0.6 },
        { text: "<speed ratio='0.9'/>Give me a second...<break time='400ms'/>", intimacy: 0.5 },
      ]
    },
    morning: {
      processing: [
        { text: "Morning brain still kicking in.<break time='200ms'/>", intimacy: 0.4 },
        { text: "Coffee hasn't hit yet.<break time='200ms'/>Give me a second.", intimacy: 0.5 },
      ]
    }
  },

  // Relationship stage variations
  relationship: {
    new_user: {
      // More formal, less intimate
      processing: [
        { text: "Let me think about that...", intimacy: 0.3 },
        { text: "One moment...", intimacy: 0.2 },
      ]
    },
    trusted: {
      // Can be more raw, more real
      processing: [
        { text: "<break time='300ms'/>Hmm.", intimacy: 0.5 },
        { text: "That's... yeah. Give me a second.", intimacy: 0.7 },
      ]
    }
  },

  // Self-healing / service issues
  service_recovery: {
    memory: [
      { text: "I'm having a moment where I can't quite remember—give me a second.", intimacy: 0.5 },
    ],
    general: [
      { text: "Something's not quite clicking—one moment.", intimacy: 0.4 },
    ]
  }
};
```

#### 1.2 Create `processing-contexts.ts`

```typescript
// src/personas/bundles/ferni/intelligence/processing-contexts.ts

export interface ProcessingContext {
  // What triggered the need for processing
  trigger: 
    | 'tool_call'           // Executing a tool
    | 'thinking'            // Thinking about a question
    | 'emotional_moment'    // Heavy emotional content
    | 'memory_recall'       // Trying to remember
    | 'service_issue'       // Self-healing scenario
    | 'silence_response';   // User has been quiet

  // Emotional weight of the moment
  emotionalWeight: 'light' | 'medium' | 'heavy';

  // How deep is the relationship
  relationshipStage: 'new' | 'acquaintance' | 'familiar' | 'trusted';

  // Time context
  timeOfDay: 'early_morning' | 'morning' | 'afternoon' | 'evening' | 'late_night';

  // What the user just said (for specific acknowledgment)
  userMessage?: string;

  // Detected user emotion
  userEmotion?: string;

  // If tool call, which tool
  toolName?: string;

  // If silence, how long
  silenceDuration?: number;

  // Session context
  turnCount: number;
  conversationMomentum: 'opening' | 'cruising' | 'peaking' | 'intimate' | 'closing';
}

export interface ProcessingExpression {
  // The SSML-tagged text to speak
  ssml: string;
  
  // Plain text version
  text: string;
  
  // Why this was chosen
  reason: string;
  
  // Timing guidance
  timing: 'immediate' | 'after_pause' | 'with_breath';
  
  // Whether to show avatar presence signals
  showPresence: boolean;
}
```

#### 1.3 Create `processing-intelligence.ts`

```typescript
// src/personas/bundles/ferni/intelligence/processing-intelligence.ts

import { PROCESSING_LIBRARY } from './processing-library.js';
import type { ProcessingContext, ProcessingExpression } from './processing-contexts.js';

export class ProcessingIntelligence {
  
  /**
   * Compose a contextually-appropriate processing expression
   * This is the ONLY entry point for "give me a second" type phrases
   */
  compose(ctx: ProcessingContext): ProcessingExpression {
    // Priority 1: Heavy emotional content - be present, not performative
    if (ctx.emotionalWeight === 'heavy') {
      return this.composeEmotionalProcessing(ctx);
    }

    // Priority 2: Tool calls - hide mechanics when possible
    if (ctx.trigger === 'tool_call') {
      return this.composeToolCallProcessing(ctx);
    }

    // Priority 3: Silence response - depends on why they're quiet
    if (ctx.trigger === 'silence_response') {
      return this.composeSilenceProcessing(ctx);
    }

    // Priority 4: Service issues - acknowledge warmly
    if (ctx.trigger === 'service_issue') {
      return this.composeServiceRecoveryProcessing(ctx);
    }

    // Priority 5: General thinking - vary by relationship
    return this.composeThinkingProcessing(ctx);
  }

  private composeEmotionalProcessing(ctx: ProcessingContext): ProcessingExpression {
    const library = PROCESSING_LIBRARY.emotional[ctx.emotionalWeight];
    
    // Select based on relationship depth - more intimate for trusted
    const candidates = library.filter(p => 
      ctx.relationshipStage === 'trusted' || p.intimacy <= 0.6
    );

    // Late night gets slower, more space
    if (ctx.timeOfDay === 'late_night') {
      return this.applyLateNightTiming(this.selectBest(candidates, ctx));
    }

    return this.selectBest(candidates, ctx);
  }

  private composeToolCallProcessing(ctx: ProcessingContext): ProcessingExpression {
    // Trusted users: hide tool usage, make it seamless
    if (ctx.relationshipStage === 'trusted') {
      return {
        ssml: "<break time='200ms'/>Hmm.<break time='150ms'/>",
        text: "Hmm.",
        reason: "Trusted relationship - hiding tool mechanics",
        timing: 'immediate',
        showPresence: false
      };
    }

    // New users: be slightly more explicit
    const library = PROCESSING_LIBRARY.tool_call.visible;
    return this.selectBest(library, ctx);
  }

  private composeSilenceProcessing(ctx: ProcessingContext): ProcessingExpression {
    // Short silence: just breathe
    if (ctx.silenceDuration && ctx.silenceDuration < 5000) {
      return {
        ssml: "<break time='300ms'/>",
        text: "",
        reason: "Short silence - just presence",
        timing: 'after_pause',
        showPresence: true
      };
    }

    // Longer silence after heavy topic: pure presence
    if (ctx.emotionalWeight === 'heavy') {
      return {
        ssml: "<break time='500ms'/>I'm here.<break time='400ms'/>",
        text: "I'm here.",
        reason: "Extended silence after heavy content - presence over words",
        timing: 'after_pause',
        showPresence: true
      };
    }

    // Longer silence in light conversation: gentle invitation
    return {
      ssml: "<break time='400ms'/>Still with me?<break time='300ms'/>",
      text: "Still with me?",
      reason: "Extended silence - gentle check-in",
      timing: 'after_pause',
      showPresence: true
    };
  }

  private composeServiceRecoveryProcessing(ctx: ProcessingContext): ProcessingExpression {
    const library = PROCESSING_LIBRARY.service_recovery.general;
    return this.selectBest(library, ctx);
  }

  private composeThinkingProcessing(ctx: ProcessingContext): ProcessingExpression {
    // Deep conversation: use deep thinking phrases
    if (ctx.conversationMomentum === 'intimate' || ctx.conversationMomentum === 'peaking') {
      const library = PROCESSING_LIBRARY.thinking.deep;
      return this.selectBest(library, ctx);
    }

    // Surface level: lighter phrases
    const library = PROCESSING_LIBRARY.thinking.light;
    return this.selectBest(library, ctx);
  }

  private selectBest(
    candidates: Array<{ text: string; intimacy: number }>, 
    ctx: ProcessingContext
  ): ProcessingExpression {
    // Weight by relationship appropriateness
    const scored = candidates.map(c => ({
      ...c,
      score: this.scoreCandidate(c, ctx)
    }));

    // Sort by score and add randomness
    scored.sort((a, b) => b.score - a.score);
    
    // Pick from top 3 with some randomness
    const topCandidates = scored.slice(0, 3);
    const selected = topCandidates[Math.floor(Math.random() * topCandidates.length)];

    return {
      ssml: this.applyTiming(selected.text, ctx),
      text: selected.text.replace(/<[^>]+>/g, ''), // Strip SSML
      reason: `Selected for ${ctx.trigger} in ${ctx.relationshipStage} relationship`,
      timing: 'immediate',
      showPresence: ctx.emotionalWeight !== 'light'
    };
  }

  private scoreCandidate(
    candidate: { text: string; intimacy: number },
    ctx: ProcessingContext
  ): number {
    let score = 1.0;

    // Intimacy match
    const targetIntimacy = {
      'new': 0.3,
      'acquaintance': 0.4,
      'familiar': 0.6,
      'trusted': 0.8
    }[ctx.relationshipStage];

    const intimacyDiff = Math.abs(candidate.intimacy - targetIntimacy);
    score -= intimacyDiff * 0.5;

    // Emotional weight match
    if (ctx.emotionalWeight === 'heavy' && candidate.intimacy < 0.5) {
      score -= 0.3; // Don't use light phrases for heavy moments
    }

    // Late night bonus for slower phrases
    if (ctx.timeOfDay === 'late_night' && candidate.text.includes('400ms')) {
      score += 0.1;
    }

    return score;
  }

  private applyTiming(text: string, ctx: ProcessingContext): string {
    // Late night: slow everything down
    if (ctx.timeOfDay === 'late_night') {
      return `<speed ratio="0.9">${text}</speed>`;
    }
    return text;
  }

  private applyLateNightTiming(expression: ProcessingExpression): ProcessingExpression {
    return {
      ...expression,
      ssml: `<speed ratio="0.9">${expression.ssml}</speed>`,
      timing: 'after_pause'
    };
  }
}

// Singleton
let instance: ProcessingIntelligence | null = null;

export function getProcessingIntelligence(): ProcessingIntelligence {
  if (!instance) {
    instance = new ProcessingIntelligence();
  }
  return instance;
}

export function composeProcessingExpression(ctx: ProcessingContext): ProcessingExpression {
  return getProcessingIntelligence().compose(ctx);
}
```

---

### Phase 2: Integration Points (Week 2)

#### 2.1 Update `natural-tool-calling.ts`

```typescript
// BEFORE
const preCallPhrase = PRE_CALL_PHRASES[category][Math.floor(Math.random() * length)];

// AFTER
import { composeProcessingExpression } from '../personas/bundles/ferni/intelligence/index.js';

const expression = composeProcessingExpression({
  trigger: 'tool_call',
  toolName: toolName,
  emotionalWeight: context.isUserDistressed ? 'heavy' : 'light',
  relationshipStage: context.relationshipStage,
  timeOfDay: context.timeOfDay,
  turnCount: context.turnCount || 0,
  conversationMomentum: 'cruising'
});

const preCallPhrase = expression.ssml;
```

#### 2.2 Update `persona-phrases.ts`

Deprecate `THINKING_FILLERS` and redirect:

```typescript
/**
 * @deprecated Use composeProcessingExpression() from processing-intelligence.ts
 * This function now delegates to the unified system.
 */
export function getThinkingFiller(personaId: string, context?: ProcessingContext): string {
  if (personaId === 'ferni' || personaId === 'jack-b') {
    return composeProcessingExpression({
      trigger: context?.trigger || 'thinking',
      emotionalWeight: context?.emotionalWeight || 'light',
      relationshipStage: context?.relationshipStage || 'acquaintance',
      timeOfDay: context?.timeOfDay || 'afternoon',
      turnCount: context?.turnCount || 5,
      conversationMomentum: context?.conversationMomentum || 'cruising'
    }).ssml;
  }
  
  // Other personas still use legacy for now
  const fillers = THINKING_FILLERS[normalizePersonaId(personaId)];
  return fillers[Math.floor(Math.random() * fillers.length)];
}
```

#### 2.3 Update `meaningful-silence.ts`

Replace `THINKING_OUT_LOUD` with calls to unified system:

```typescript
// BEFORE
const thinkingMoment = getThinkingOutLoudMoment(context, persona);

// AFTER
import { composeProcessingExpression } from '../bundles/ferni/intelligence/index.js';

function getThinkingOutLoudMoment(context: SilenceContext, persona: PersonaConfig): string | null {
  if (getCanonicalPersonaId(persona.id) !== 'ferni') {
    return getThinkingOutLoudMomentLegacy(context, persona);
  }

  const expression = composeProcessingExpression({
    trigger: 'silence_response',
    emotionalWeight: context.recentEmotionalTone === 'heavy' ? 'heavy' : 'medium',
    relationshipStage: context.turnCount > 10 ? 'familiar' : 'acquaintance',
    timeOfDay: getTimeOfDay(context.currentHour),
    silenceDuration: context.silenceDurationSeconds * 1000,
    userMessage: context.lastUserMessage,
    turnCount: context.turnCount,
    conversationMomentum: context.turnCount > 10 ? 'intimate' : 'cruising'
  });

  return expression.ssml;
}
```

#### 2.4 Update `silence-presence.ts`

```typescript
// Replace getVerbalCueForSilence with unified system
getVerbalCueForSilence(reason: SilenceReason): string | null {
  const expression = composeProcessingExpression({
    trigger: reason === 'processing' ? 'thinking' : 'silence_response',
    emotionalWeight: reason === 'emotional' ? 'heavy' : 'medium',
    relationshipStage: 'familiar', // Would need context
    timeOfDay: 'afternoon', // Would need context
    turnCount: 5,
    conversationMomentum: 'cruising'
  });

  return expression.text || null;
}
```

#### 2.5 Update `better-than-human-personality.ts`

Integrate processing intelligence into the composition system:

```typescript
// Add to composeExpression function
export function composeExpression(ctx: PersonalityContext): ComposedExpression | null {
  // NEW: If this is a processing moment, use ProcessingIntelligence
  if (ctx.isProcessingMoment) {
    const processingExpr = composeProcessingExpression({
      trigger: ctx.processingTrigger || 'thinking',
      emotionalWeight: ctx.distressLevel > 0.6 ? 'heavy' : 
                       ctx.distressLevel > 0.3 ? 'medium' : 'light',
      relationshipStage: ctx.relationshipStage,
      timeOfDay: ctx.timeOfDay,
      userMessage: ctx.lastUserMessage,
      userEmotion: ctx.currentEmotion,
      turnCount: ctx.turnCount,
      conversationMomentum: ctx.conversationMomentum
    });

    return {
      content: processingExpr.ssml,
      theme: 'processing',
      intimacyLevel: processingExpr.showPresence ? 0.6 : 0.3,
      compositionReason: processingExpr.reason,
      shouldBeSubtle: !processingExpr.showPresence,
      timing: processingExpr.timing === 'immediate' ? 'immediate' : 'after_pause'
    };
  }

  // ... rest of existing logic
}
```

---

### Phase 3: Deprecation & Cleanup (Week 3)

#### 3.1 Files to Deprecate

| File | Action | Replacement |
|------|--------|-------------|
| `THINKING_FILLERS` in persona-phrases.ts | Deprecate | `composeProcessingExpression()` |
| `PRE_CALL_PHRASES` in natural-tool-calling.ts | Remove | `composeProcessingExpression()` |
| `THINKING_SOUNDS` in natural-tool-calling.ts | Remove | `composeProcessingExpression()` |
| `THINKING_OUT_LOUD` in meaningful-silence.ts | Deprecate | `composeProcessingExpression()` |
| `thinking_aloud` in rich-disfluencies.ts | Deprecate | `composeProcessingExpression()` |

#### 3.2 Add Migration Warnings

```typescript
/**
 * @deprecated Since v2.0 - Use composeProcessingExpression() instead
 * This function will be removed in v3.0
 * 
 * Migration guide:
 * ```typescript
 * // Old:
 * const filler = getThinkingFiller('ferni');
 * 
 * // New:
 * import { composeProcessingExpression } from '@ferni/intelligence';
 * const expr = composeProcessingExpression({ trigger: 'thinking', ... });
 * const filler = expr.ssml;
 * ```
 */
export function getThinkingFiller(personaId: string): string {
  console.warn('getThinkingFiller is deprecated. Use composeProcessingExpression()');
  // ... delegation
}
```

#### 3.3 Update Tests

Create comprehensive tests for the new system:

```typescript
// src/personas/bundles/ferni/intelligence/__tests__/processing-intelligence.test.ts

describe('ProcessingIntelligence', () => {
  describe('emotional processing', () => {
    it('uses longer pauses for heavy emotional content', () => {
      const expr = composeProcessingExpression({
        trigger: 'emotional_moment',
        emotionalWeight: 'heavy',
        relationshipStage: 'trusted',
        timeOfDay: 'late_night',
        turnCount: 15,
        conversationMomentum: 'intimate'
      });

      expect(expr.ssml).toContain('400ms'); // Longer pause
      expect(expr.showPresence).toBe(true);
    });

    it('uses lighter phrases for light moments', () => {
      const expr = composeProcessingExpression({
        trigger: 'thinking',
        emotionalWeight: 'light',
        relationshipStage: 'new',
        timeOfDay: 'morning',
        turnCount: 2,
        conversationMomentum: 'opening'
      });

      expect(expr.ssml).not.toContain('heavy');
      expect(expr.text.length).toBeLessThan(30);
    });
  });

  describe('tool call processing', () => {
    it('hides tool mechanics for trusted relationships', () => {
      const expr = composeProcessingExpression({
        trigger: 'tool_call',
        toolName: 'memory_recall',
        emotionalWeight: 'light',
        relationshipStage: 'trusted',
        timeOfDay: 'afternoon',
        turnCount: 20,
        conversationMomentum: 'cruising'
      });

      expect(expr.ssml).not.toContain('checking');
      expect(expr.ssml).not.toContain('looking up');
      expect(expr.reason).toContain('hiding tool mechanics');
    });
  });

  describe('temporal awareness', () => {
    it('slows down for late night', () => {
      const expr = composeProcessingExpression({
        trigger: 'thinking',
        emotionalWeight: 'medium',
        relationshipStage: 'familiar',
        timeOfDay: 'late_night',
        turnCount: 10,
        conversationMomentum: 'intimate'
      });

      expect(expr.ssml).toContain('speed ratio="0.9"');
    });
  });
});
```

---

### Phase 4: Other Personas (Week 4)

#### 4.1 Extend to Other Personas

Create persona-specific processing libraries:

```typescript
// src/personas/bundles/maya-santos/intelligence/processing-library.ts
export const MAYA_PROCESSING_LIBRARY = {
  thinking: {
    light: [
      { text: "Okay, let me think...", intimacy: 0.3 },
      { text: "Hmm...", intimacy: 0.2 },
    ],
    deep: [
      { text: "I want to think about this carefully...", intimacy: 0.6 },
      { text: "That's... let me sit with that.", intimacy: 0.7 },
    ]
  },
  // ... Maya-specific patterns
};
```

#### 4.2 Create Persona-Aware Factory

```typescript
// src/personas/shared/processing-factory.ts
import { FERNI_PROCESSING_LIBRARY } from '../bundles/ferni/intelligence/processing-library.js';
import { MAYA_PROCESSING_LIBRARY } from '../bundles/maya-santos/intelligence/processing-library.js';
// ... others

export function getProcessingLibrary(personaId: string) {
  const libraries: Record<string, typeof FERNI_PROCESSING_LIBRARY> = {
    'ferni': FERNI_PROCESSING_LIBRARY,
    'maya-santos': MAYA_PROCESSING_LIBRARY,
    // ...
  };

  return libraries[getCanonicalPersonaId(personaId)] || FERNI_PROCESSING_LIBRARY;
}
```

---

## 📊 Success Metrics

### Before (Current State)

| Metric | Value |
|--------|-------|
| Files containing processing phrases | 15+ |
| Unique "give me a second" variants | 31 |
| Context-aware selection | 0% |
| Relationship-aware selection | 0% |
| Time-of-day awareness | Partial (scattered) |
| Emotional weight awareness | 0% |

### After (Target State)

| Metric | Target |
|--------|--------|
| Files containing processing phrases | **1** (processing-library.ts) |
| Single entry point | **composeProcessingExpression()** |
| Context-aware selection | **100%** |
| Relationship-aware selection | **100%** |
| Time-of-day awareness | **100%** |
| Emotional weight awareness | **100%** |

---

## 🚀 Quick Wins (Can Do Now)

1. **Create the new files** - processing-intelligence.ts, processing-library.ts, processing-contexts.ts
2. **Update natural-tool-calling.ts** - Highest traffic, immediate impact
3. **Add deprecation warnings** - Start migration path

## ⚠️ Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing behavior | Deprecation period with fallbacks |
| Regression in voice quality | A/B testing with gradual rollout |
| Increased latency from composition | Pre-compute common contexts |
| Other personas feel different | Use Ferni as template, adapt per persona |

---

## Timeline

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Single Source of Truth | processing-library.ts, processing-intelligence.ts |
| 2 | Integration | Update 5 major callers |
| 3 | Deprecation | Add warnings, update tests |
| 4 | Other Personas | Extend to Maya, Peter, etc. |

---

## Next Steps

1. **Review this plan** - Any missing systems? Any concerns?
2. **Prioritize** - Start with Phase 1.1 (single source of truth)
3. **Create branch** - `feature/processing-intelligence-consolidation`
4. **Begin implementation** - Start with processing-library.ts

---

*This plan was generated by analyzing 15+ source files containing scattered processing/thinking phrases. The goal: make Ferni feel like one coherent intelligence, not 15 disconnected systems.*

