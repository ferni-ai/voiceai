# Ferni AI - Comprehensive Implementation Plan

> **Goal**: Make the platform truly "Better Than Human" by completing the EQ system, integrating humanization features, fixing documentation, and closing critical gaps.

**Created**: 2025-12-12
**Estimated Total Effort**: 8-10 weeks (can parallelize)

---

## Executive Summary

The audit revealed that Ferni has **sophisticated systems that are 70-80% built but not fully integrated**. The EQ system exists (~5,000 lines of frontend code) but lacks backend→frontend event wiring. Tool humanization modules exist but aren't connected. Documentation claims features that are partially implemented.

### Key Findings

| Area | Status | Gap |
|------|--------|-----|
| EQ System (Frontend) | 95% Complete | Missing backend event dispatch |
| EQ System (Backend) | 80% Complete | Events calculated but not sent |
| Tool Humanization | 100% Built | Not wired into pipeline |
| Apple IAP | 30% Complete | JWT, handlers commented out |
| Relationship Memory | 70% Complete | Firestore persistence missing |
| Documentation | 60% Accurate | Dead links, false claims |
| Test Coverage | 28% | Critical paths untested |

---

## Phase 1: Quick Wins (Week 1)
**Effort**: 2-3 days | **Impact**: High | **Risk**: Low

### 1.1 Export Cameo Domain
**File**: `src/tools/domains/index.ts`

```typescript
// Line ~102: Add export
export { getToolDefinitions as getCameoToolDefinitions } from './cameo/index.js';

// Line ~262: Add to getAllDomainToolDefinitions()
import('./cameo/index.js').then(async (m) => m.getToolDefinitions()),

// Line ~414: Add metadata
cameo: {
  name: 'Team Cameos',
  description: 'Invite team members to briefly pop in and share quick insights',
  icon: '🎬',
  status: 'active',
},
```

### 1.2 Fix Documentation Dead Links

| File | Issue | Fix |
|------|-------|-----|
| `CLAUDE.md` line 187 | `design-system/design-system/brand/BETTER-THAN-HUMAN.md` | Change to `design-system/brand/BETTER-THAN-HUMAN.md` |
| `src/intelligence/context-builders/CLAUDE.md` | References `docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md` | Create file or remove reference |
| `src/personas/CLAUDE.md` | References `docs/creating-personas.md` | Change to `docs/guides/creating-personas.md` |
| `src/tools/CLAUDE.md` | References `docs/TOOL_MIGRATION.md` | Create file or remove reference |

### 1.3 Fix Telemetry Hardcoding
**File**: `src/services/better-than-human-telemetry.ts`

```typescript
// Lines 255-268: Change 'ferni' to dynamic personaId parameter

// BEFORE:
trackGrowthInsightDetected(userId: string, insightType: string): void {
  this.track('growth_insight_detected', userId, 'ferni', undefined, { insightType });
}

// AFTER:
trackGrowthInsightDetected(userId: string, personaId: string, insightType: string): void {
  this.track('growth_insight_detected', userId, personaId, undefined, { insightType });
}
```

### 1.4 Archive Legacy Files
Move to `docs/archive/legacy/` with explanation comments:
- `src/services/ferni-awareness.ts` → Replaced by 92+ modular context builders
- `src/tools/runtime-enforcement.ts` → Replaced by build-time validation

---

## Phase 2: EQ System Integration (Weeks 2-3)
**Effort**: 7-10 days | **Impact**: Critical | **Risk**: Medium

### 2.1 Create Emotion Event Dispatcher
**New File**: `src/agents/realtime/emotion-event-dispatcher.ts`

```typescript
import { createLogger } from '../../utils/safe-logger.js';
import type { EmotionalState } from '../../intelligence/types.js';
import type { FrontendPublisher } from './frontend-publisher.js';

const log = createLogger('EmotionEventDispatcher');

export interface EmotionEventOptions {
  emotionalState: EmotionalState;
  userId: string;
  personaId: string;
}

export async function dispatchEmotionToFrontend(
  options: EmotionEventOptions,
  publisher: FrontendPublisher
): Promise<void> {
  const { emotionalState, userId, personaId } = options;

  // 1. Send emotion update (triggers ferni:emotion-change on frontend)
  await publisher.sendEmotion(
    emotionalState.primary,
    emotionalState.intensity,
    emotionalState.intensity // confidence
  );

  // 2. Determine concern level from distress
  const concernLevel = emotionalState.distressLevel > 0.8 ? 'significant'
    : emotionalState.distressLevel > 0.5 ? 'moderate'
    : emotionalState.distressLevel > 0.2 ? 'mild'
    : 'none';

  // 3. Send concern event if detected
  if (concernLevel !== 'none') {
    await publisher.sendCustomEvent('ferni:concern-detected', {
      level: concernLevel,
      distressLevel: emotionalState.distressLevel,
      triggers: emotionalState.markers || [],
    });
    log.debug({ userId, concernLevel }, 'Dispatched concern event');
  }

  // 4. Send humanization signal for voice-text mismatch
  if (emotionalState.mismatch?.hasMismatch && emotionalState.mismatch.confidence > 0.5) {
    await publisher.sendCustomEvent('humanization_signal', {
      signalType: 'protective_instinct',
      intensity: emotionalState.mismatch.confidence,
      observationType: 'voice_text_mismatch',
      mismatchType: emotionalState.mismatch.type,
    });
    log.debug({ userId, mismatchType: emotionalState.mismatch.type }, 'Dispatched mismatch signal');
  }

  // 5. Send trajectory signal for emotional arc changes
  if (emotionalState.trajectory === 'improving') {
    await publisher.sendCustomEvent('humanization_signal', {
      signalType: 'spontaneous_delight',
      intensity: emotionalState.intensity,
    });
  }
}
```

### 2.2 Integrate into Voice Agent
**File**: `src/agents/voice-agent.ts`

Add after `processTurn()` returns (approximately line 1850):

```typescript
// After: const result = await processTurn(ctx);

// NEW: Dispatch emotion events to frontend for EQ system
if (result.emotional && frontendPublisher) {
  try {
    await dispatchEmotionToFrontend({
      emotionalState: result.emotional,
      userId: ctx.userId,
      personaId: ctx.personaId,
    }, frontendPublisher);
  } catch (err) {
    diag.warn({ error: String(err) }, 'Emotion dispatch failed');
  }
}
```

### 2.3 Add Custom Event Method to FrontendPublisher
**File**: `src/agents/realtime/frontend-publisher.ts`

```typescript
async sendCustomEvent(eventType: string, data: Record<string, unknown>): Promise<void> {
  const message = JSON.stringify({
    type: 'custom_event',
    eventType,
    data,
    timestamp: Date.now(),
  });

  await this.room.localParticipant.publishData(
    new TextEncoder().encode(message),
    { reliable: true }
  );
}
```

### 2.4 Frontend Event Handler
**File**: `apps/web/src/app/data-message-handlers.ts`

Add handler for custom_event type:

```typescript
case 'custom_event': {
  const { eventType, data } = parsed;
  document.dispatchEvent(new CustomEvent(eventType, { detail: data }));
  break;
}
```

### 2.5 Verify Voice Emotion Data Flow
**File**: `src/agents/voice-agent.ts`

Ensure `userData.voiceEmotion` is populated from prosody analyzer:

```typescript
// In audio processing callback:
const prosodyAnalyzer = getSessionAudioProsodyAnalyzer(sessionId);
prosodyAnalyzer.processSamples(audioSamples, sampleRate);
const voiceEmotion = prosodyAnalyzer.analyze();

// CRITICAL: Ensure this flows to userData
userData.voiceEmotion = voiceEmotion;
```

---

## Phase 3: Tool Humanization (Weeks 3-4)
**Effort**: 5-7 days | **Impact**: High | **Risk**: Low

### 3.1 Integrate natural-tool-calling.ts
**File**: `src/tools/utils/tool-wrapper.ts`

```typescript
import { getNaturalToolCall, weaveToolResult } from '../natural-tool-calling.js';

// In wrapToolExecute(), before tool execution:
const naturalCall = getNaturalToolCall({
  personaId: ctx.agentId,
  toolName: toolId,
  userMood: ctx.userData?.emotionalState?.primary,
  relationshipStage: ctx.userData?.relationshipStage,
  timeOfDay: getTimeOfDay(),
  isUserDistressed: (ctx.userData?.emotionalState?.distressLevel || 0) > 0.5,
  turnCount: ctx.turnCount,
});

// Check if tool should be called (e.g., don't call productivity at 2am)
if (!naturalCall.shouldCallTool) {
  return { skipped: true, reason: naturalCall.skipReason };
}

// Execute tool
const result = await originalExecute(params);

// Weave result naturally
const wovenResult = weaveToolResult(result, naturalCall.resultFraming, ctx);

return wovenResult;
```

### 3.2 Integrate cognitive-tool-interpretation.ts
**File**: `src/tools/utils/tool-wrapper.ts`

```typescript
import { formatToolResultWithCognition } from '../cognitive-tool-interpretation.js';

// After tool execution, before returning:
const cognitiveResult = formatToolResultWithCognition({
  toolName: toolId,
  toolDomain: domain,
  result: result,
  wasSuccessful: !result.error,
  userQuestion: ctx.lastUserMessage,
}, ctx.agentId);

// Use cognitive framing in result
return {
  ...result,
  framingPhrase: cognitiveResult.framingPhrase,
  keyInsightStyle: cognitiveResult.keyInsightStyle,
  suggestedFollowUp: cognitiveResult.suggestedFollowUp,
};
```

### 3.3 Add Tool Tracking for Humanization
**File**: `src/agents/voice-agent/tool-tracking-handler.ts`

```typescript
// In FunctionToolsExecuted handler (line 84+):
import { getNaturalToolCall } from '../../tools/natural-tool-calling.js';

// Record humanization metadata
const naturalCall = getNaturalToolCall({
  personaId: agentId,
  toolName: event.name,
  // ... context
});

// Track for analytics/learning
await recordToolHumanization({
  toolName: event.name,
  personaId: agentId,
  framingUsed: naturalCall.preCallPhrase,
  resultFraming: naturalCall.resultFraming,
  timestamp: Date.now(),
});
```

---

## Phase 4: Critical Persistence (Weeks 4-5)
**Effort**: 5-7 days | **Impact**: Critical | **Risk**: Medium

### 4.1 Relationship Memory Firestore Persistence
**File**: `src/personality/relationship-memory.ts`

Add Firestore initialization and persistence helper:

```typescript
const COLLECTION_PATH = 'personality_relationships';

let firestoreInstance: FirebaseFirestore.Firestore | null = null;
let initAttempted = false;

async function getFirestore(): Promise<FirebaseFirestore.Firestore | null> {
  if (firestoreInstance) return firestoreInstance;
  if (initAttempted) return null;
  initAttempted = true;

  try {
    const admin = await import('firebase-admin');
    if (admin.apps.length === 0) {
      admin.initializeApp({
        projectId: process.env.GCP_PROJECT_ID || process.env.FIREBASE_PROJECT_ID
      });
    }
    firestoreInstance = admin.firestore();
    return firestoreInstance;
  } catch (error) {
    log.warn({ error }, 'Firebase unavailable - using in-memory storage');
    return null;
  }
}

async function persistRelationship(
  userId: string,
  personaId: string,
  relationship: PersonalityRelationship
): Promise<void> {
  const db = await getFirestore();
  if (!db) return;

  try {
    const docId = `${userId}#${personaId}`;
    await db.collection(COLLECTION_PATH).doc(docId).set(
      toFirestore(relationship),
      { merge: true }
    );
  } catch (error) {
    log.error({ error, userId, personaId }, 'Failed to persist relationship');
  }
}
```

Then update each TODO:
- `getRelationship()` - Load from Firestore on cache miss
- `recordSharedMoment()` - Persist after cache update
- `recordUserMoment()` - Persist after cache update
- `markCallbackComplete()` - Persist after cache update
- `incrementVulnerabilityDepth()` - Use `FieldValue.increment(1)` for atomicity

### 4.2 Apple IAP Completion (If Needed)
**File**: `src/services/apple-iap.ts`

**Priority Tasks:**
1. Implement JWT generation with ES256 (lines 182-185)
2. Implement receipt decoding for `signedTransactionInfo` (lines 338-344)
3. Implement `findUserByTransaction()` database lookup (lines 586-589)
4. Uncomment and implement webhook handlers (lines 603-684)

See detailed implementation in agent report above.

---

## Phase 5: Documentation Update (Week 5)
**Effort**: 2-3 days | **Impact**: Medium | **Risk**: Low

### 5.1 Update CLAUDE.md EQ Section

Replace the current EQ section (lines 187-236) with accurate documentation:

```markdown
## 🚀 Ferni EQ - Superhuman Emotional Intelligence

Ferni's avatar implements **superhuman emotional intelligence** through a sophisticated
event-driven system.

### Architecture

**Backend** (emotion detection + event dispatch):
- `src/agents/processors/turn-processor.ts` - Emotion analysis
- `src/intelligence/voice-text-mismatch.ts` - Detects incongruence
- `src/agents/realtime/emotion-event-dispatcher.ts` - Sends to frontend

**Frontend** (visual response):
- `apps/web/src/ui/better-than-human.ui.ts` - EQ capabilities
- `apps/web/src/ui/avatar-soul.ui.ts` - Visual animations

### Five Capabilities

| Capability | Backend | Frontend | Event |
|------------|---------|----------|-------|
| Micro-Expressions | Emotion detected | 40-150ms flash | `ferni:emotion-change` |
| Active Listening | Speech pause detected | Micro-nods | `ferni:user-speech-pause` |
| Breath Sync | Pause patterns analyzed | Breathing animation | `ferni:breath-sync` |
| Concern Detection | Distress level > 0.5 | Protective mode | `ferni:concern-detected` |
| Anticipation | Partial transcript analyzed | Pre-emotion display | `humanization_signal` |

### Integration

The backend dispatches events after each turn:
\`\`\`typescript
await dispatchEmotionToFrontend({
  emotionalState: result.emotional,
  userId, personaId
}, frontendPublisher);
\`\`\`

Frontend listens and responds:
\`\`\`typescript
document.addEventListener('ferni:emotion-change', (e) => {
  ferni.playMicroExpression(e.detail.emotion);
  soul.pupilRespondToEmotion(e.detail.emotion, e.detail.intensity);
});
\`\`\`
```

### 5.2 Create Missing Documentation Files

**Create**: `docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md`
- Document the 92+ context builders
- Explain priority ordering
- Show registration pattern

**Create**: `docs/TOOL_MIGRATION.md`
- Document migration from legacy tools to domain system
- Explain registry pattern
- Show how to add new tools

### 5.3 Update Persona 200% Documentation

Document which JSON files exist vs which are planned:

| File | Ferni | Alex | Maya | Peter | Jordan | Nayan |
|------|-------|------|------|-------|--------|-------|
| `superhuman-insights.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `trust-phrases.json` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `better-than-human.json` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `i-notice-power.json` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| `emotional-intelligence.json` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## Phase 6: Test Coverage (Weeks 6-8)
**Effort**: 10-15 days | **Impact**: High | **Risk**: Low

### 6.1 Priority Test Files to Create

| File | Tests | Priority |
|------|-------|----------|
| `src/agents/__tests__/voice-agent.test.ts` | Agent initialization, tool loading | Critical |
| `src/agents/__tests__/emotion-event-dispatcher.test.ts` | Event dispatch, concern detection | Critical |
| `src/tools/__tests__/humanization-integration.test.ts` | Natural calling, cognitive interpretation | High |
| `src/intelligence/context-builders/__tests__/integration.test.ts` | Context builder chain | High |
| `src/services/__tests__/stripe-payments.test.ts` | Payment flows | Critical |
| `src/tools/handoff/__tests__/detection.test.ts` | Handoff triggers | High |

### 6.2 EQ System Tests

```typescript
// src/agents/__tests__/emotion-event-dispatcher.test.ts
describe('EmotionEventDispatcher', () => {
  it('should dispatch emotion-change for all emotions', async () => {
    const mockPublisher = createMockPublisher();
    await dispatchEmotionToFrontend({
      emotionalState: { primary: 'happy', intensity: 0.8, distressLevel: 0 },
      userId: 'test', personaId: 'ferni'
    }, mockPublisher);

    expect(mockPublisher.sendEmotion).toHaveBeenCalledWith('happy', 0.8, 0.8);
  });

  it('should dispatch concern-detected when distress > 0.5', async () => {
    const mockPublisher = createMockPublisher();
    await dispatchEmotionToFrontend({
      emotionalState: { primary: 'sad', intensity: 0.7, distressLevel: 0.75 },
      userId: 'test', personaId: 'ferni'
    }, mockPublisher);

    expect(mockPublisher.sendCustomEvent).toHaveBeenCalledWith(
      'ferni:concern-detected',
      expect.objectContaining({ level: 'moderate' })
    );
  });

  it('should dispatch humanization_signal for voice-text mismatch', async () => {
    const mockPublisher = createMockPublisher();
    await dispatchEmotionToFrontend({
      emotionalState: {
        primary: 'neutral',
        intensity: 0.5,
        distressLevel: 0.6,
        mismatch: { hasMismatch: true, confidence: 0.8, type: 'masking_negative' }
      },
      userId: 'test', personaId: 'ferni'
    }, mockPublisher);

    expect(mockPublisher.sendCustomEvent).toHaveBeenCalledWith(
      'humanization_signal',
      expect.objectContaining({ signalType: 'protective_instinct' })
    );
  });
});
```

### 6.3 Tool Humanization Tests

```typescript
// src/tools/__tests__/humanization-integration.test.ts
describe('Tool Humanization', () => {
  it('should add natural pre-call phrase', () => {
    const naturalCall = getNaturalToolCall({
      personaId: 'ferni',
      toolName: 'checkHabits',
      userMood: 'neutral',
    });

    expect(naturalCall.preCallPhrase).toBeTruthy();
    expect(naturalCall.preCallPhrase).not.toContain('Executing');
  });

  it('should apply persona cognitive lens to results', () => {
    const result = formatToolResultWithCognition({
      toolName: 'analyzeSpending',
      toolDomain: 'finance',
      result: { total: 500, categories: [] },
      wasSuccessful: true,
    }, 'peter-john');

    expect(result.keyInsightStyle).toBe('data_point');
    expect(result.framingPhrase).toContain('Looking at');
  });

  it('should skip tools during late night for productivity domain', () => {
    const naturalCall = getNaturalToolCall({
      personaId: 'maya-santos',
      toolName: 'intensiveHabitChallenge',
      timeOfDay: 'late_night',
      isUserDistressed: false,
    });

    expect(naturalCall.shouldCallTool).toBe(false);
  });
});
```

---

## Phase 7: Cleanup (Week 8)
**Effort**: 2-3 days | **Impact**: Medium | **Risk**: Low

### 7.1 Consolidate Duplicates

| Duplicate | Action |
|-----------|--------|
| `types/result.ts` vs `memory/result.ts` | Keep `types/result.ts`, migrate memory imports |
| `utils/logger.ts` vs `utils/safe-logger.ts` | Delete `logger.ts`, update imports to `safe-logger.ts` |
| `intelligence/emotion-detector.ts` vs `services/emotion-detection.ts` | Keep intelligence version, deprecate services |

### 7.2 Split Large Files

| File | Lines | Action |
|------|-------|--------|
| `services/session-manager.ts` | 1,744 | Split into `session-manager/` submodules |
| `services/ferni-awareness.ts` | 526 | Already replaced - archive |

### 7.3 Remove Confirmed Dead Code

After verification:
- `src/tools/expression.ts` - Only if not wiring to EQ system
- Any files with zero imports after Phase 2-3 integration

---

## Verification Checklist

### Phase 1 Complete When:
- [ ] Cameo tools appear in agent tool list
- [ ] All CLAUDE.md links resolve to real files
- [ ] Telemetry tracks correct personaId for all personas

### Phase 2 Complete When:
- [ ] Frontend avatar responds to backend emotion changes
- [ ] Protective mode activates when distress > 0.5
- [ ] Micro-expressions play on emotion detection
- [ ] Voice-text mismatch triggers humanization signal

### Phase 3 Complete When:
- [ ] Tools have natural pre-call phrases in logs
- [ ] Tool results show persona-specific framing
- [ ] Late-night productivity tools are skipped

### Phase 4 Complete When:
- [ ] Relationships persist across server restarts
- [ ] Apple IAP can process test subscriptions (if implemented)

### Phase 5 Complete When:
- [ ] All CLAUDE.md documentation matches code
- [ ] Missing docs files created
- [ ] Persona capability matrix accurate

### Phase 6 Complete When:
- [ ] Test coverage > 50% for critical paths
- [ ] EQ integration tests passing
- [ ] Tool humanization tests passing

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| EQ events break existing flow | Feature flag `ENABLE_EQ_EVENTS` to toggle |
| Tool humanization slows response | Cache natural call patterns |
| Firestore unavailable | In-memory fallback already exists |
| Breaking changes to tools | Maintain backward compatibility in wrapper |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| EQ events dispatched | 0 | 100% of turns |
| Avatar visual responses | 0 | Match backend emotion |
| Tool humanization coverage | 0% | 100% of tools |
| Test coverage (critical paths) | ~10% | 60% |
| Documentation accuracy | 60% | 95% |
| Dead code | ~2,000 lines | 0 |

---

## Timeline Summary

| Week | Phase | Focus |
|------|-------|-------|
| 1 | Quick Wins | Exports, docs, telemetry |
| 2-3 | EQ Integration | Backend→frontend events |
| 3-4 | Tool Humanization | Natural calling, cognitive interpretation |
| 4-5 | Persistence | Relationship memory, Apple IAP |
| 5 | Documentation | Update all docs |
| 6-8 | Testing | 50%+ coverage |
| 8 | Cleanup | Consolidate, remove dead code |

**Total Estimated Effort**: 8-10 weeks with 1-2 engineers

---

## Appendix: File Reference

### New Files to Create
- `src/agents/realtime/emotion-event-dispatcher.ts`
- `src/agents/__tests__/emotion-event-dispatcher.test.ts`
- `src/tools/__tests__/humanization-integration.test.ts`
- `src/intelligence/context-builders/__tests__/integration.test.ts`
- `docs/COGNITIVE-INTELLIGENCE-ARCHITECTURE.md`
- `docs/TOOL_MIGRATION.md`

### Files to Modify
- `src/tools/domains/index.ts` - Add cameo export
- `src/services/better-than-human-telemetry.ts` - Fix hardcoding
- `src/agents/voice-agent.ts` - Add emotion dispatch
- `src/agents/realtime/frontend-publisher.ts` - Add custom event method
- `src/tools/utils/tool-wrapper.ts` - Add humanization
- `src/personality/relationship-memory.ts` - Add Firestore
- `apps/web/src/app/data-message-handlers.ts` - Handle custom events
- `CLAUDE.md` - Update EQ documentation

### Files to Archive
- `src/services/ferni-awareness.ts` → `docs/archive/legacy/`
- `src/tools/runtime-enforcement.ts` → `docs/archive/legacy/`
