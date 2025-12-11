# Voice Agent Modularization Plan

> **Goal**: Reduce `voice-agent.ts` from 6082 lines to ~1500 lines by extracting cohesive modules while maintaining full functionality and test coverage.

---

## Current State Analysis

### File Structure
```
voice-agent.ts          # 6082 lines (TARGET: ~1500)
├── Imports             # Lines 1-396 (~396 lines)
├── VoiceAgent class    # Lines 398-2285 (~1900 lines)
│   ├── Properties & constructor   # 398-412
│   ├── initializeBundleRuntime    # 417-432
│   ├── sendDataMessage            # 460-497
│   ├── static create              # 499-640
│   ├── transcriptionNode          # 642-1190 (~550 lines) ← LARGE
│   ├── sttNode                    # 1192-1686 (~495 lines) ← LARGE
│   ├── getUserDataFromContext     # 1688-1734
│   ├── injectEngagementContext    # 1736-1770
│   ├── sendCelebrationEvents      # 1772-1844
│   ├── onUserTurnCompleted        # 1846-1872
│   ├── onUserTurnCompletedV2      # 1874-2118 (~244 lines)
│   ├── handleSlashCommand         # 2119-2200
│   └── recordTrustSystemsData     # 2202-2284
├── defineAgent (entry)  # Lines 2293-6005 (~3700 lines) ← MASSIVE
│   ├── prewarm()        # 2294-2395
│   └── entry()          # 2396-6004
│       ├── STEP 0: Load persona         # 2436-2470
│       ├── STEP 1: Identify user        # 2472-2665
│       ├── STEP 2: Create services      # 2707-2785
│       ├── STEP 3: Initialize user data # 2825-2948
│       ├── STEP 4: Load VAD & session   # 2948-3040
│       ├── STEP 5: Event listeners      # 3069-4176 (~1100 lines) ← HUGE
│       ├── STEP 6: Create voice agent   # 4243-4253
│       ├── STEP 7: Parallel init        # 4254-4782 (~530 lines)
│       ├── STEP 8: Greeting             # 4842-5228 (~386 lines)
│       └── STEP 9: Cleanup              # 5617-5996 (~380 lines)
└── Worker startup       # Lines 6007-6082 (~75 lines)
```

### Existing Modular Patterns (What We Already Have)

| File | Lines | Purpose | Used by voice-agent.ts? |
|------|-------|---------|------------------------|
| `shared/constants.ts` | ~50 | SILENCE_THRESHOLDS, PROCESSING_TIMEOUTS | ✅ Yes |
| `shared/types.ts` | ~100 | UserData, SessionContext types | ✅ Yes |
| `shared/helpers.ts` | ~80 | hasSsmlTags, utility functions | ✅ Yes |
| `shared/shutdown-handler.ts` | ~60 | Graceful shutdown | ✅ Yes |
| `shared/health-server.ts` | ~100 | Health check server | ✅ Yes |
| `shared/cameo-handler.ts` | ~200 | Cameo team member pop-ins | ✅ Yes |
| `shared/handoff-handler.ts` | ~300 | Persona handoff logic | ✅ Yes |
| `handlers/silence-handler.ts` | 150 | Silence response generation | ❌ **NOT USED** (inline is more sophisticated) |
| `handlers/user-identification.ts` | ~150 | User ID extraction | ✅ Yes |
| `voice-agent/types.ts` | 74 | Voice-agent specific types | ✅ Yes |
| `voice-agent/cleanup-handler.ts` | 367 | Session cleanup | ❌ **NOT USED** (inline duplicated) |
| `processors/turn-processor.ts` | ~300 | Turn processing pipeline | ✅ Yes |
| `integrations/speech-metrics-integration.ts` | ~100 | Speech metrics | ✅ Yes |
| `integrations/dynamic-speed-integration.ts` | ~80 | Dynamic speech speed | ✅ Yes |

---

## Extraction Plan (Ordered by Safety)

### Phase 1: Low-Risk Extractions (Week 1)

These extractions have **no shared state** and are pure functions or isolated utilities.

#### 1.1 Extract Greeting Generation → `voice-agent/greeting-handler.ts`
**Lines**: 4842-5150 (~308 lines)
**Risk**: LOW
**Dependencies**: UserData, PersonaConfig, services
**Why Safe**: Pure function, generates greeting string, no side effects on entry state

```typescript
// greeting-handler.ts
export interface GreetingContext {
  sessionPersona: PersonaConfig;
  services: SessionServices;
  userData: UserData;
  sessionId: string;
  userId: string;
  userName?: string;
  isReturningUser: boolean;
  subscriptionTier: string;
}

export async function generateSessionGreeting(ctx: GreetingContext): Promise<{
  greeting: string;
  personaMemories?: PersonaMemoryForGreeting;
  humanizingState?: HumanizingState;
}>;
```

#### 1.2 Extract Data Channel Setup → `voice-agent/data-channel-handler.ts`
**Lines**: 5301-5616 (~315 lines)
**Risk**: LOW
**Dependencies**: Room, session, services
**Why Safe**: Event handler registration only, doesn't affect core conversation flow

```typescript
// data-channel-handler.ts
export interface DataChannelContext {
  room: Room;
  session: AgentSession;
  services: SessionServices;
  sessionPersona: PersonaConfig;
  userData: UserData;
  voiceAgent: VoiceAgent;
}

export function setupDataChannelHandlers(ctx: DataChannelContext): void;
```

#### 1.3 Extract Music Player Setup → `voice-agent/music-handler.ts`
**Lines**: 4312-4668 (~356 lines)
**Risk**: LOW
**Dependencies**: session, persona, room
**Why Safe**: Isolated feature, doesn't affect core voice pipeline

```typescript
// music-handler.ts
export interface MusicContext {
  session: AgentSession;
  sessionPersona: PersonaConfig;
  room: Room;
  isPhoneCall: boolean;
}

export async function setupMusicPlayer(ctx: MusicContext): Promise<{
  clearTimers: () => void;
}>;
```

---

### Phase 2: Medium-Risk Extractions (Week 2)

These touch shared state but have clear boundaries.

#### 2.1 Extract User Identification → `voice-agent/user-setup.ts`
**Lines**: 2472-2665 (~193 lines)
**Risk**: MEDIUM
**Dependencies**: ctx.job.metadata, services
**Why Medium**: Returns values used by subsequent steps (userId, userName)

```typescript
// user-setup.ts
export interface UserSetupResult {
  userId: string;
  userName?: string;
  identificationSource: string;
  identityContext?: IdentityContext;
}

export async function setupUserIdentification(
  ctx: JobContext,
  sessionId: string,
  sessionPersona: PersonaConfig
): Promise<UserSetupResult>;
```

#### 2.2 Extract Services Initialization → `voice-agent/services-setup.ts`
**Lines**: 2707-2785 (~78 lines)
**Risk**: MEDIUM
**Dependencies**: userId, persona, subscriptionTier
**Why Medium**: Creates SessionServices used everywhere else

```typescript
// services-setup.ts
export async function createSessionServices(
  sessionId: string,
  userId: string,
  userName: string | undefined,
  sessionPersona: PersonaConfig,
  subscriptionTier: string
): Promise<SessionServices>;
```

#### 2.3 Consolidate Cleanup → Use existing `cleanup-handler.ts`
**Lines**: 5617-5996 (inline) → Move to existing module
**Risk**: MEDIUM
**Dependencies**: Many services
**Why Medium**: cleanup-handler.ts exists but isn't used; inline version is duplicate

**Action**: Replace inline cleanup with import of existing `cleanup-handler.ts`

---

### Phase 3: High-Risk Extractions (Week 3-4)

These involve shared state and complex interdependencies.

#### 3.1 Extract Event Listeners → `voice-agent/event-handlers.ts`
**Lines**: 3069-4176 (~1100 lines) ← BIGGEST EXTRACTION
**Risk**: HIGH
**Dependencies**: 50+ local variables including timers, state flags, services
**Why High**: Deep closure over entry() local variables

**Strategy**: Create `VoiceAgentContext` class to hold shared state:

```typescript
// event-context.ts
export class VoiceAgentContext {
  // Timing state
  userLastSpokeAt: number = Date.now();
  lastBackchannelAt: number = 0;
  lastSilenceResponseAt: number = 0;
  silenceResponseCount: number = 0;

  // Feature flags
  pendingBackchannelReaction: boolean = false;
  isPhoneCall: boolean = false;

  // Services
  services: SessionServices;
  session: AgentSession;
  userData: UserData;
  // ... 40+ more fields
}

// event-handlers.ts
export function setupUserStateHandlers(ctx: VoiceAgentContext): void;
export function setupAgentStateHandlers(ctx: VoiceAgentContext): void;
export function setupSilenceHandlers(ctx: VoiceAgentContext): void;
```

#### 3.2 Extract Transcription Pipeline → `voice-agent/transcription-pipeline.ts`
**Lines**: 642-1190 (~550 lines in VoiceAgent class)
**Risk**: HIGH
**Dependencies**: this.persona, this._currentSession, services
**Why High**: Core functionality, heavily integrated with class state

**Strategy**: Keep in VoiceAgent class but extract sub-functions:

```typescript
// transcription-helpers.ts
export function processEmotionalAnalysis(text: string, services: SessionServices): EmotionalResult;
export function generateContextInjections(userData: UserData, services: SessionServices): ContextInjection[];
export function applyHumanization(text: string, context: HumanizationContext): string;
```

#### 3.3 Extract STT Pipeline → `voice-agent/stt-pipeline.ts`
**Lines**: 1192-1686 (~495 lines in VoiceAgent class)
**Risk**: HIGH
**Dependencies**: Similar to transcriptionNode
**Why High**: Core functionality, audio processing

---

### Phase 4: Verification & Polish (Week 5)

1. **Integration Testing**: Run full E2E test suite after each extraction
2. **Performance Testing**: Verify no latency regressions in voice pipeline
3. **Code Review**: Ensure no circular dependencies introduced
4. **Documentation**: Update CLAUDE.md with new module patterns

---

## Dependency Graph

```
voice-agent.ts
├── greeting-handler.ts (Phase 1)
├── data-channel-handler.ts (Phase 1)
├── music-handler.ts (Phase 1)
├── user-setup.ts (Phase 2)
├── services-setup.ts (Phase 2)
├── cleanup-handler.ts (existing, Phase 2)
├── event-context.ts (Phase 3)
├── event-handlers.ts (Phase 3)
├── transcription-helpers.ts (Phase 3)
└── stt-helpers.ts (Phase 3)

All modules import from:
├── shared/types.ts (UserData, etc.)
├── shared/constants.ts (thresholds, timeouts)
└── voice-agent/types.ts (voice-agent specific types)
```

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| voice-agent.ts lines | 6082 | ~1500 |
| Test coverage | 60% | ≥60% |
| E2E tests passing | 71/71 | 71/71 |
| Voice latency p95 | ~200ms | ≤200ms |
| Files in voice-agent/ | 4 | 10-12 |

---

## Risk Mitigation

1. **Before Each Extraction**:
   - Run `npm run quality` (full quality check)
   - Run `npm test` (all tests pass)
   - Commit current state

2. **During Extraction**:
   - Use `git diff` to verify only intended changes
   - Maintain backward-compatible imports via index.ts re-exports

3. **After Each Extraction**:
   - Run `npm run quality` again
   - Run E2E tests specifically: `npm test -- --run voice-agent`
   - Test manually with a real conversation

---

## Notes

### Why Not Use cleanup-handler.ts?
The existing `voice-agent/cleanup-handler.ts` (367 lines) was created but **never integrated**. The inline cleanup in voice-agent.ts (lines 5617-5996) is a **duplicate**. Phase 2.3 should consolidate these.

### Why Not Use silence-handler.ts?
The existing `handlers/silence-handler.ts` (150 lines) provides basic functionality, but the inline silence handling in voice-agent.ts (lines 3539-3720) is much more sophisticated with:
- Medium silence backchannels (4-10s)
- Voice insight delivery
- Emotional moment awareness
- Silence context from services

**Decision**: Enhance silence-handler.ts to include the sophisticated features, then use it.

### VoiceAgentContext Pattern
The event handlers (1100 lines) are the hardest to extract because they close over 50+ local variables. The solution is to:
1. Create a `VoiceAgentContext` class that holds all shared state
2. Pass this context to extracted handler functions
3. Handlers mutate context directly (same behavior as closures)

This is a **refactor, not a rewrite** - behavior stays identical.
