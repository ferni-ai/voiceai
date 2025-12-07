# Voice Agent Refactoring Guide

This guide shows how to use the newly extracted modules to simplify `voice-agent.ts`.

## Summary of New Modules

| Module | Purpose | Lines Saved |
|--------|---------|-------------|
| `processors/turn-processor.ts` | Handles `onUserTurnCompleted` logic | ~700 |
| `realtime/frontend-publisher.ts` | Centralizes all `publishData` calls | ~150 |
| `session/session-state.ts` | Unified state management | ~100 |
| `shared/cached-imports.ts` | Performance-optimized imports | ~50 |

**Estimated total reduction: ~1000 lines** (from 3614 to ~2600)

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

### Phase 1: Low Risk (Do First)
1. ✅ Add cached imports to prewarm
2. ✅ Replace publishData calls with FrontendPublisher
3. ✅ Use turn processor in onUserTurnCompleted

### Phase 2: Medium Risk
1. Replace UserData mutations with SessionStateManager
2. Verify all state is properly synced
3. Update tests

### Phase 3: Cleanup
1. Remove dead code from voice-agent.ts
2. Update documentation
3. Add integration tests

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
- `src/agents/realtime/index.ts` - Realtime exports
- `src/agents/realtime/frontend-publisher.ts` - Data channel messaging
- `src/agents/session/index.ts` - Session exports
- `src/agents/session/session-state.ts` - State management
- `src/agents/shared/cached-imports.ts` - Import caching

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

