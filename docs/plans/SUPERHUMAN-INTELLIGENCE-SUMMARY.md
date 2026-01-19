# Superhuman Intelligence Enhancement - Quick Reference

> **TL;DR:** 10 enhancements to make Ferni more intelligent and human-like, following clean architecture principles.

---

## The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     SUPERHUMAN INTELLIGENCE STACK                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PERCEPTION LAYER (What we notice)                                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐           │
│  │ Voice       │ │ Avoidance   │ │ Micro-      │ │ Silence     │           │
│  │ Biomarkers  │ │ Detection   │ │ Moments     │ │ Enhanced    │           │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘           │
│                                                                             │
│  UNDERSTANDING LAYER (What it means)                                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                           │
│  │ Emotional   │ │ Pattern     │ │ Story Arc   │                           │
│  │ Momentum    │ │ Connector   │ │ Tracking    │                           │
│  └─────────────┘ └─────────────┘ └─────────────┘                           │
│                                                                             │
│  RESPONSE LAYER (How we respond)                                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                           │
│  │ Response    │ │ Rhythm      │ │ Relational  │                           │
│  │ Mode        │ │ Intelligence│ │ Memory      │                           │
│  └─────────────┘ └─────────────┘ └─────────────┘                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The 10 Enhancements at a Glance

| # | Enhancement | What It Does | Key Insight |
|---|-------------|--------------|-------------|
| 1 | **Pattern Connector** | Connects dots across topics | "Mom comes up when you're stressed" |
| 2 | **Voice Biomarkers** | Deep emotional state from voice | Pre-panic detection → grounding |
| 3 | **Rhythm Intelligence** | Matches user's conversational tempo | Brief user → brief response |
| 4 | **Avoidance Detection** | Notices what's NOT being said | "Work keeps coming up and then... not" |
| 5 | **Relational Memory** | Remembers HOW we relate | Inside jokes, rituals, preferences |
| 6 | **Emotional Momentum** | Tracks trajectory within session | "Family topic caused decline" |
| 7 | **Response Mode** | Knows when NOT to respond fully | Post-venting → "I hear you" only |
| 8 | **Story Arc** | Tracks narratives across sessions | "How did that interview go?" |
| 9 | **Micro-Moments** | Catches small moments | "Almost" is still progress |
| 10 | **Enhanced Silence** | Deeper silence understanding | Learned user patterns |

---

## Implementation Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  Response Mode    │  Voice Biomarkers │
    │  Emotional Mom.   │  Pattern Connector│
    │  Silence Enhanced │                   │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │                   │                   │
    │  Micro-Moments    │  Story Arc        │
    │  Rhythm Intel.    │  Relational Mem.  │
    │  Avoidance Det.   │                   │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

**Start with:** Response Mode, Emotional Momentum, Enhanced Silence (high impact, low effort)

---

## File Structure

```
src/
├── services/superhuman/
│   ├── relational-memory/          # Enhancement #5
│   │   ├── types.ts
│   │   ├── persistence.ts
│   │   ├── engine.ts
│   │   └── index.ts
│   ├── story-arc/                  # Enhancement #8
│   │   ├── types.ts
│   │   ├── persistence.ts
│   │   ├── engine.ts
│   │   └── index.ts
│   └── voice-intelligence/         # Enhancement #2
│       ├── types.ts
│       ├── biomarker-analyzer.ts
│       └── index.ts
│
├── conversation/
│   ├── rhythm-intelligence/        # Enhancement #3
│   │   ├── types.ts
│   │   ├── engine.ts
│   │   └── index.ts
│   ├── response-mode/              # Enhancement #7
│   │   ├── types.ts
│   │   ├── engine.ts
│   │   └── index.ts
│   └── emotional-arc/
│       └── momentum/               # Enhancement #6
│           ├── types.ts
│           ├── tracker.ts
│           └── index.ts
│
├── intelligence/deep-understanding/
│   ├── pattern-connector/          # Enhancement #1
│   │   ├── types.ts
│   │   ├── engine.ts
│   │   └── index.ts
│   ├── avoidance-detection/        # Enhancement #4
│   │   ├── types.ts
│   │   ├── detection-rules.ts
│   │   ├── engine.ts
│   │   └── index.ts
│   └── micro-moments/              # Enhancement #9
│       ├── types.ts
│       ├── detection-rules.ts
│       ├── engine.ts
│       └── index.ts
```

---

## Key Interfaces

### Pattern Connector
```typescript
interface IPatternConnector {
  recordTopicMention(userId: string, topic: string, context: {...}): Promise<void>;
  detectPatterns(userId: string): Promise<PatternConnection[]>;
  getSurfaceableInsight(userId: string, receptivity: number): Promise<PatternConnection | null>;
}
```

### Response Mode Decider
```typescript
interface IResponseModeDecider {
  decide(context: ResponseModeContext): ResponseModeDecision;
  getContentForMode(mode: ResponseMode, context: {...}): { text: string; ssml: string } | null;
}
```

### Emotional Momentum Tracker
```typescript
interface IEmotionalMomentumTracker {
  recordTurn(sessionId: string, snapshot: EmotionSnapshot): void;
  getMomentum(sessionId: string): EmotionalMomentum | null;
  checkIntervention(sessionId: string): InterventionGuidance | null;
  getSafeTopics(sessionId: string): string[];
  getRiskyTopics(sessionId: string): string[];
}
```

### Avoidance Detector
```typescript
interface IAvoidanceDetector {
  detectInTurn(userId: string, userMessage: string, context: {...}): AvoidanceMark | null;
  getPatterns(userId: string): Promise<AvoidancePattern[]>;
  getGuidance(pattern: AvoidancePattern, context: {...}): AvoidanceGuidance;
}
```

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- [ ] Response Mode Intelligence
- [ ] Enhanced Silence Intelligence
- [ ] Emotional Momentum Tracking

### Phase 2: Deep Understanding (Weeks 3-5)
- [ ] Micro-Moment Recognition
- [ ] Avoidance Detection
- [ ] Rhythm Intelligence

### Phase 3: Memory & Connection (Weeks 6-8)
- [ ] Relational Memory
- [ ] Pattern Connector
- [ ] Story Arc Tracking

### Phase 4: Voice Pipeline (Weeks 9-10)
- [ ] Voice Biomarker Pipeline

---

## Integration Checklist

### For Each Enhancement:

1. **Create Module Structure**
   - [ ] `types.ts` - Type definitions
   - [ ] `constants.ts` - Static data (if needed)
   - [ ] `persistence.ts` - Firestore operations
   - [ ] `engine.ts` - Business logic
   - [ ] `index.ts` - Barrel exports + factory

2. **Add to DI Container**
   - [ ] Add token to `SuperhumanIntelligenceTokens`
   - [ ] Register in `src/services/di/setup.ts`

3. **Integrate with Voice Pipeline**
   - [ ] Add to turn-handler.ts or relevant processor
   - [ ] Add to context builders if needed

4. **Test**
   - [ ] Unit tests for engine
   - [ ] Integration tests
   - [ ] Add to E2E test suite

5. **Document**
   - [ ] Add to relevant CLAUDE.md
   - [ ] Update this plan with status

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Response appropriateness | 90% positive feedback |
| Intervention accuracy | 80% correct timing |
| Pattern detection precision | 70% user confirmation |
| False positive rate | <15% dismissal |
| Response mode accuracy | 85% appropriate mode |

---

## Quick Commands

```bash
# Run all superhuman intelligence tests
pnpm vitest run src/services/superhuman/**/*.test.ts
pnpm vitest run src/conversation/**/*.test.ts

# Type check
pnpm typecheck

# Lint
pnpm lint

# Run specific module tests
pnpm vitest run src/conversation/response-mode/
pnpm vitest run src/intelligence/deep-understanding/micro-moments/
```

---

## Philosophy Reminder

> **"Better than human = superhuman perception + human-like restraint"**

**The goal is NOT:**
- More features
- More data
- More responses

**The goal IS:**
- Knowing when NOT to respond
- Connecting dots humans miss
- Reading what's NOT said
- Remembering HOW we relate
- Matching conversational rhythm

---

**See full plan:** `docs/plans/SUPERHUMAN-INTELLIGENCE-ENHANCEMENT-PLAN.md`
