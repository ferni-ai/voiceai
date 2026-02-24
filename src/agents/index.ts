/**
 * Voice AI Agents
 *
 * Multi-persona voice agent system with clean architecture.
 *
 * CANONICAL ARCHITECTURE (GCE Production):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ src/agents/                                                     │
 * │   ├── core/               - Foundation types & utilities       │
 * │   │   ├── types.ts        - SessionContext, adapters           │
 * │   │   ├── result.ts       - Result<T,E> error handling         │
 * │   │   ├── errors.ts       - Structured error hierarchy         │
 * │   │   ├── pipeline.ts     - Composable pipeline pattern        │
 * │   │   └── inference-executor.ts - InProcessInferenceExecutor   │
 * │   │                                                             │
 * │   ├── gce-voice-worker.ts - ⭐ PRIMARY: GCE entry point        │
 * │   ├── worker.ts           - Re-export (backwards compat)       │
 * │   ├── voice-agent-entry.ts - ⭐ Session lifecycle management   │
 * │   │                                                             │
 * │   ├── personas/           - PersonaVoiceAgent & persona agents │
 * │   │   ├── ferni-agent.ts  - PersonaVoiceAgent (FerniAgent)     │
 * │   │   ├── maya-agent.ts   - MayaAgent (habits specialist)      │
 * │   │   └── ...             - Other persona agents               │
 * │   │                                                             │
 * │   ├── safety/             - 🚨 HARD safety rails (crisis)      │
 * │   ├── trust/              - Trust enforcement layer            │
 * │   ├── shared/             - Shared utilities & performance     │
 * │   ├── handlers/           - Event handlers                     │
 * │   ├── processors/         - Turn processing (crisis detection) │
 * │   ├── realtime/           - Frontend communication             │
 * │   ├── session/            - Session state management           │
 * │   ├── integrations/       - External service integrations      │
 * │   └── voice-agent/        - Voice agent handlers & phases      │
 * │       ├── turn-handler.ts - Turn orchestrator                  │
 * │       ├── turn-personality.ts - Personality system             │
 * │       ├── turn-events.ts  - Event dispatch                     │
 * │       ├── turn-learning.ts - Trust & learning recording        │
 * │       └── phases/         - Session phases                     │
 * │                                                                 │
 * │   _legacy/ (archived, not used in production):                 │
 * │   ├── voice-agent.ts      - Monolith (replaced by handlers)    │
 * │   ├── voice-worker.ts     - Child process mode                 │
 * │   ├── voice-worker-single-process.ts - Cloud Run alternative   │
 * │   ├── voice-agent-child.ts - Child process agent               │
 * │   └── in-process-executor.ts - Cloud Run executor              │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * SAFETY FLOW:
 *   1. User speaks → transcript received
 *   2. processTurn() runs crisis detection FIRST (safety/crisis-guard.ts)
 *   3. If severe crisis: override LLM with pre-written safe response
 *   4. If moderate crisis: add safety injection to guide LLM
 *   5. Trust context added via injection-builders.ts
 *
 * Usage:
 *   node dist/agents/gce-voice-worker.js start  (GCE - recommended)
 *   node dist/agents/worker.js start            (backwards compat)
 *
 * Available personas:
 *   - ferni: The life coach (main persona)
 *   - peter-john: Research specialist
 *   - alex-chen: Communications specialist
 *   - maya-santos: Habits & routines specialist
 *   - jordan-taylor: Event planning specialist
 *   - nayan-patel: Wisdom specialist (premium)
 */

// ============================================================================
// CORE (Foundation types & utilities)
// Re-export selectively to avoid conflicts with shared/types.ts
// ============================================================================

export {
  // Errors
  AgentError,
  BaseStep,
  HandlerError,
  LLMError,
  PersonaLoadError,
  PersonaNotFoundError,
  // Pipeline
  Pipeline,
  PipelineStepError,
  RoomConnectionError,
  RoomDisconnectedError,
  SessionSetupError,
  SessionTimeoutError,
  TTSError,
  TransformStep,
  createStep,
  err,
  getUserMessage,
  isErr,
  isOk,
  isRecoverable,
  ok,
  unwrap,
  wrapError,
  type PipelineStep,
  // Result type
  type Result,
} from './core/index.js';

// ============================================================================
// SHARED UTILITIES (for any agent)
// ============================================================================

export * from './shared/index.js';

// ============================================================================
// PROCESSORS (extracted turn processing)
// ============================================================================

export * from './processors/index.js';

// ============================================================================
// REALTIME COMMUNICATION (frontend data channel)
// ============================================================================

export * from './realtime/index.js';

// ============================================================================
// SESSION MANAGEMENT (unified state)
// ============================================================================

export * from './session/index.js';

// ============================================================================
// HANDLERS (event handling)
// ============================================================================

export * from './handlers/index.js';

// ============================================================================
// SAFETY (crisis detection - HARD safety rails)
// ============================================================================

export {
  detectCrisis,
  guardPreResponse,
  guardPostResponse,
  buildCrisisGuardContext,
  applyGuardResult,
  type CrisisGuardResult,
  type CrisisGuardContext,
  type CrisisDetectionResult,
} from './safety/crisis-guard.js';

// ============================================================================
// TRUST (trust enforcement layer)
// ============================================================================

export {
  enforceTrustContext,
  buildRegenerationPrompt,
  type TrustEnforcementResult,
  type EnforcementContext,
} from './trust/trust-enforcer.js';

// ============================================================================
// PERFORMANCE OPTIMIZATIONS
// ============================================================================

// Re-export key performance utilities for easy access
export {
  ParallelExecutor,
  parallelCollect,
  parallelMap,
} from './shared/performance/parallel-executor.js';

export {
  batchWrite,
  executeWithPool,
  getDocument,
  getFirestorePool,
  setDocument,
} from './shared/performance/firestore-pool.js';

export {
  LookaheadBuffer,
  ResponseStreamProcessor,
  createStreamingSession,
} from './shared/performance/response-streaming.js';

export {
  EdgeCache,
  cachePersonaBundle,
  getCachedPersonaBundle,
  getOrLoadPersonaBundle,
  getPersonaBundleCache,
  warmCommonCaches,
} from '../services/cache/edge-cache.js';

export {
  WebSocketKeepAlive,
  createSessionKeepAlive,
  getSessionKeepAlive,
} from './shared/performance/websocket-keepalive.js';

export {
  BatchAnalyticsWriter,
  createPerformanceEvent,
  createSessionEvent,
  createToolEvent,
  initBatchAnalytics,
  queueAnalyticsEvent,
  queueAnalyticsEvents,
} from './shared/performance/batch-analytics.js';

// ============================================================================
// PERSONAS (voice agents for each character)
// ============================================================================

export {
  // Main voice agent (renamed from FerniAgent for clarity)
  PersonaVoiceAgent,
  createPersonaVoiceAgent,
  // Backwards compatibility aliases
  FerniAgent,
  createFerniAgent,
  type FerniAgentOptions,
  type PersonaVoiceAgentOptions,
} from './personas/index.js';

// ============================================================================
// VOICE AGENT HANDLERS (extracted from turn-handler)
// ============================================================================

export {
  // Turn handler (main orchestrator)
  handleUserTurn,
  cleanupPersonalityState,
  // Turn personality
  processPersonality,
  mapMoodToMomentum,
  mapIntentToSharing,
  // Turn events
  dispatchAllTurnEvents,
  // Turn learning
  recordAllLearningData,
  type TurnHandlerContext,
  type PersonalityContext,
  type EventDispatchContext,
  type LearningContext,
} from './voice-agent/index.js';

// ============================================================================
// PRIMARY ENTRY POINT
// ============================================================================

// The voice agent is launched via gce-voice-worker.ts which manages job dispatch.
// See: gce-voice-worker.ts for GCE deployment entry point
// See: voice-agent-entry.ts for session lifecycle

// Export the main entry function
export { runFullVoiceAgentEntry } from './voice-agent-entry/index.js';

// ============================================================================
// DJ INTEGRATION (NEW ARCHITECTURE)
// ============================================================================

// DJ integration is now handled by the DJController in src/audio/dj-controller.ts
// Use getDJController() from '@audio' instead of getDJIntegration()
export { getDJController, resetDJController, type DJController } from '../audio/dj-controller.js';

// ============================================================================
// VOICE IDS (for handoff and voice switching)
// Use voice-registry.ts as the single source of truth
// ============================================================================

export {
  getCanonicalPersonaId,
  getPersonaDisplayName,
  getVoiceId,
} from '../personas/voice-registry.js';

// All personas use:
// - PersonaVoiceAgent (src/agents/personas/ferni-agent.ts)
// - Persona bundles (src/personas/bundles/) for configuration
