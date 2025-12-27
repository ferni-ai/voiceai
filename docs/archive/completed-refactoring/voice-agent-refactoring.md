# Voice Agent Refactoring Guide

This guide shows how to use the newly extracted modules to simplify `voice-agent.ts`.

## Summary of New Modules

| Module | Purpose | Lines Saved |
|--------|---------|-------------|
| `processors/turn-processor.ts` | Handles `onUserTurnCompleted` logic | ~700 |
| `voice-agent/response-processor.ts` | Post-LLM response processing (SSML, humanization) | ~400 |
| `voice-agent/audio-processor.ts` | Audio prosody/emotion analysis from sttNode | ~580 |
| `realtime/frontend-publisher.ts` | Centralizes all `publishData` calls | ~150 |
| `session/session-state.ts` | Unified state management | ~100 |
| `shared/cached-imports.ts` | Performance-optimized imports | ~50 |

**Estimated total reduction: ~2000 lines** (from ~3600 to ~1600)

## New Extractions (December 2024)

### Response Processor (`voice-agent/response-processor.ts`)

Handles all post-LLM processing for agent responses:
- SSML tagging (phase personality, emotion mirroring)
- Advanced humanization (naturalness, memory callbacks, follow-ups)
- Dynamic speed control based on user's cognitive/emotional state
- Emotional contagion and rhythm mirroring
- Breathing synchronization
- Quality assurance recording

```typescript
import { processAgentResponse, type ResponseProcessorContext } from './voice-agent/index.js';

const result = await processAgentResponse({
  accumulatedText,
  agentPersona,
  userData,
  services,
  session,
  sendDataMessage,
});

const finalSsml = result.finalSsml; // Use this for TTS
```

### Audio Processor (`voice-agent/audio-processor.ts`)

Processes user audio for prosody analysis and emotion detection:
- Session-scoped prosody analysis
- Gemini multimodal emotion (experimental)
- Speaker change detection
- Breath pause detection for backchanneling
- Laughter detection (basic + multi-signal)
- Ambient awareness
- Voice baseline building
- Emotion updates to frontend

```typescript
import { processAudioStream, type AudioProcessorContext } from './voice-agent/index.js';

// In sttNode, run audio processing in background
void processAudioStream(audioForProsody, {
  sessionId,
  userId,
  userData,
  sendDataMessage: this.sendDataMessage.bind(this),
});
```

---

## 1. Using the Turn Processor

### Before (in voice-agent.ts)
```typescript
async onUserTurnCompleted(turnCtx: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
  // 700+ lines of context building, analysis, injection...
}
```

### After
```typescript
import { processTurn, injectTurnContext, getCelebrationEvents, type TurnContext } from './processors/index.js';

async onUserTurnCompleted(turnCtx: llm.ChatContext, newMessage: llm.ChatMessage): Promise<void> {
  const userText = newMessage.textContent;
  if (!userText) return;

  const userData = this.getUserDataFromContext();
  const services = userData?.services;
  if (!services) return;

  // Process the turn (all analysis, context building)
  const turnContext: TurnContext = {
    turnCtx,
    userText,
    persona: this.persona,
    bundleRuntime: this.bundleRuntime,
    services,
    userData: userData as UserData,
    logger: this.logger,
  };

  const result = await processTurn(turnContext);

  // Inject context into LLM
  injectTurnContext(turnCtx, result);

  // Send celebrations to frontend
  const celebrations = getCelebrationEvents(result);
  if (celebrations.length > 0) {
    await this.sendCelebrationEvents(celebrations);
  }
}
```

---

## 2. Using the Frontend Publisher

### Before (scattered throughout voice-agent.ts)
```typescript
// Multiple places with inline publishData calls
const message = JSON.stringify({
  type: 'emotion',
  emotion: voiceEmotion.primary,
  confidence: voiceEmotion.confidence,
  timestamp: Date.now(),
});
await ctx.room.localParticipant.publishData(
  new TextEncoder().encode(message),
  { reliable: true }
);
```

### After
```typescript
import { initializeFrontendPublisher, getFrontendPublisher } from './realtime/index.js';

// In entry function, initialize once
const publisher = initializeFrontendPublisher(ctx.room);

// Then use throughout
await publisher.sendEmotion(voiceEmotion.primary, voiceEmotion.confidence, voiceEmotion.arousal);
await publisher.sendMood(mood.state, mood.energyLevel, mood.relationshipStage, hasTransition);
await publisher.sendHandoffStarted(newAgent, prevAgent, direction, playSound);
await publisher.sendCelebration('milestone', 'fireworks', 'Great achievement!');
```

### Benefits
- Type-safe messages
- Built-in retry logic
- Centralized error handling
- Consistent logging

---

## 3. Using the Session State Manager

### Before (mutable UserData scattered everywhere)
```typescript
userData.turnCount = (userData.turnCount || 0) + 1;
userData.lastTopic = currentTopic;
userData.lastEmotionAnalysis = { primary, intensity, distressLevel };
userData.bundleRuntimeState.currentMode = newMode;
// ... scattered across hundreds of lines
```

### After
```typescript
import { createSessionStateManager, SessionStateManager } from './session/index.js';

// Initialize once per session
const sessionState = createSessionStateManager(sessionId, personaId, {
  userId,
  userName,
  isReturningUser,
  services,
});

// Use throughout with type-safe methods
sessionState.incrementTurn();
sessionState.setTopic(currentTopic);
sessionState.setEmotionAnalysis({ primary, intensity, distressLevel });
sessionState.setMode(newMode, previousMode);
sessionState.markResponseHadHumor();

// Get state when needed (immutable)
const state = sessionState.getState();
console.log(state.conversation.turnCount);

// Convert to legacy format for backward compatibility
const legacyUserData = sessionState.toLegacyUserData();
```

### Benefits
- Single source of truth
- Immutable updates
- Type-safe state access
- Easy to serialize/restore

---

## 4. Using Cached Imports

### Before (dynamic imports scattered throughout)
```typescript
// Many uncached dynamic imports causing latency
const { checkForEasterEgg } = await import('../personas/easter-eggs.js');
const { getTaskManager } = await import('../tasks/task-manager.js');
const { buildConversationContext } = await import('../intelligence/context-builders/index.js');
```

### After
```typescript
import {
  getContextBuilders,
  getEasterEggChecker,
  getTaskManagerCached,
  preloadCommonModules,
} from './shared/cached-imports.js';

// Preload during prewarm for faster first turn
await preloadCommonModules();

// Use cached versions (instant after first load)
const { buildConversationContext } = await getContextBuilders();
const checkForEasterEgg = await getEasterEggChecker();
const taskManager = await getTaskManagerCached();
```

---

## 5. Refactoring Plan (Incremental)

### Phase 1: Low Risk (Do First) ✅ COMPLETE
1. ✅ Add cached imports to prewarm
2. ✅ Replace publishData calls with FrontendPublisher
3. ✅ Use turn processor in onUserTurnCompleted

### Phase 2-10: Medium Risk ✅ COMPLETE
1. ✅ Replace UserData mutations with SessionStateManager
2. ✅ Verify all state is properly synced
3. ✅ Update tests
4. ✅ Remove dead code from voice-agent.ts
5. ✅ Update documentation
6. ✅ Add integration tests

### Phase 11: Legacy Removal ✅ COMPLETE
**Goal**: Make SessionStateManager the single source of truth via Proxy pattern.

**Implementation** (see `session/user-data-proxy.ts`):
- Created `createUserDataProxy()` that wraps SessionStateManager
- All reads (`userData.turnCount`) go through SessionStateManager
- All writes (`userData.turnCount = 5`) update SessionStateManager
- Existing code works unchanged - no migration needed!
- Direct fields (services, voice humanization) stored on proxy

**Usage**:
```typescript
// In session-init-handler.ts
const sessionStateManager = createSessionStateManager(sessionId, personaId, { ... });
const userData = createUserDataProxy(sessionStateManager, {
  services,
  isTrialUser,
  isFirstConversation,
});

// Existing code continues to work:
userData.turnCount = 5;  // → updates sessionStateManager
console.log(userData.turnCount);  // → reads from sessionStateManager

// New code can use sessionStateManager directly:
sessionStateManager.incrementTurn();
```

**Benefits**:
- ✅ Single source of truth (SessionStateManager)
- ✅ No breaking changes to existing code
- ✅ Immutable state updates under the hood
- ✅ Turn handler auto-updates state after processing
- ✅ 100 tests passing (37 proxy + 29 integration + 34 speech)

---

## Example: Updated Entry Function Structure

```typescript
export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    // Preload cached modules for faster first turn
    await preloadCommonModules();
    
    // ... rest of prewarm
  },

  entry: async (ctx: JobContext) => {
    // Initialize frontend publisher early
    const publisher = initializeFrontendPublisher(ctx.room);
    
    // Initialize session state
    const sessionState = createSessionStateManager(sessionId, personaId, {
      userId,
      userName,
      isReturningUser,
    });

    // ... session setup ...

    // Create voice agent with session state
    const voiceAgent = await VoiceAgent.create(sessionPersona);
    voiceAgent.setSessionState(sessionState);
    voiceAgent.setPublisher(publisher);

    // ... rest of entry ...
  },
});
```

---

## Files Changed

### New Files Created
- `src/agents/processors/index.ts` - Processor exports
- `src/agents/processors/types.ts` - Processor types
- `src/agents/processors/turn-processor.ts` - Turn processing logic
- `src/agents/voice-agent/response-processor.ts` - Post-LLM response processing ✨ NEW
- `src/agents/voice-agent/audio-processor.ts` - Audio prosody/emotion analysis ✨ NEW
- `src/agents/realtime/index.ts` - Realtime exports
- `src/agents/realtime/frontend-publisher.ts` - Data channel messaging
- `src/agents/session/index.ts` - Session exports
- `src/agents/session/session-state.ts` - State management
- `src/agents/shared/cached-imports.ts` - Import caching
- `src/personas/bundles/preloader.ts` - Persona bundle preloading ✨ NEW
- `src/utils/performance-metrics.ts` - Performance timing utilities ✨ NEW
- `src/context/INTEGRATION-GUIDE.md` - Context module documentation ✨ NEW
- `docs/SYSTEM-HEALTH-REPORT.md` - Architecture health report ✨ NEW

### Files Modified
- `src/agents/index.ts` - Updated exports
- `src/agents/shared/index.ts` - Added cached import exports

---

## Testing

Each new module can be tested in isolation:

```typescript
// Test turn processor
const result = await processTurn(mockTurnContext);
expect(result.analysis.currentTopic).toBe('finances');
expect(result.emotional.primary).toBe('anxious');

// Test frontend publisher
const publisher = new FrontendPublisher(mockRoom);
await publisher.sendEmotion('happy', 0.9, 0.7);
expect(mockRoom.publishData).toHaveBeenCalled();

// Test session state
const manager = createSessionStateManager('sess-1', 'ferni');
manager.incrementTurn();
expect(manager.getTurnCount()).toBe(1);
```

