/**
 * Voice AI Agents
 *
 * Multi-persona voice agent system with clean architecture.
 *
 * Architecture (GCE Optimized):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ src/agents/                                                     │
 * │   ├── core/               - Foundation types & utilities       │
 * │   │   ├── types.ts        - SessionContext, adapters           │
 * │   │   ├── result.ts       - Result<T,E> error handling         │
 * │   │   ├── errors.ts       - Structured error hierarchy         │
 * │   │   └── pipeline.ts     - Composable pipeline pattern        │
 * │   │                                                             │
 * │   ├── adapters/           - External service adapters          │
 * │   │   ├── livekit.ts      - LiveKit room adapter               │
 * │   │   └── cartesia.ts     - Cartesia TTS adapter               │
 * │   │                                                             │
 * │   ├── worker.ts           - ⭐ UNIFIED: GCE entry point        │
 * │   ├── voice-agent-entry.ts - Session lifecycle management      │
 * │   │                                                             │
 * │   ├── shared/             - Shared utilities                   │
 * │   ├── handlers/           - Event handlers                     │
 * │   ├── processors/         - Turn processing                    │
 * │   ├── realtime/           - Frontend communication             │
 * │   └── session/            - Session state management           │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   node dist/agents/worker.js start  (GCE - recommended)
 *
 * Available personas:
 *   - ferni: The life coach (main persona)
 *   - peter-john: Research specialist
 *   - alex-chen: Communications specialist
 *   - maya-santos: Habits & routines specialist
 *   - jordan-taylor: Event planning specialist
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
// ADAPTERS (External service adapters)
// ============================================================================

export {
  CartesiaTTSAdapter,
  LiveKitRoomAdapter,
  MockRoomAdapter,
  MockTTSAdapter,
  connectToRoom,
  createLiveKitAdapter,
  createLocalizedTTSAdapter,
  createTTSAdapter,
} from './adapters/index.js';

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
} from './shared/performance/edge-cache.js';

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
// PRIMARY ENTRY POINT
// ============================================================================

// The voice agent is launched via worker.ts which manages job dispatch.
// See: worker.ts for GCE deployment entry point
// See: voice-agent-entry.ts for session lifecycle

// Export the main entry function
export { runFullVoiceAgentEntry } from './voice-agent-entry.js';

// ============================================================================
// DJ INTEGRATION (radio show experience)
// ============================================================================

export { djIntegration, getDJIntegration, resetDJIntegration } from './dj-integration.js';

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
// - src/agents/voice-agent.ts with PERSONA_ID env var
// - src/personas/bundles/ for persona configuration
