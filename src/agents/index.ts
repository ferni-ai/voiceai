/**
 * Voice AI Agents
 *
 * Multi-persona voice agent system with modular intelligence.
 *
 * Architecture (REFACTORED):
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ src/agents/                                                     │
 * │   ├── shared/             - Utilities for ANY agent            │
 * │   │   ├── types.ts        - Session types (UserData)           │
 * │   │   ├── health-server.ts - HTTP health check                 │
 * │   │   ├── external-apis.ts - Stock quotes, weather             │
 * │   │   └── handoff-handler.ts - Handoff event handling          │
 * │   │                                                             │
 * │   ├── handlers/           - Event and lifecycle handlers       │
 * │   │   ├── silence-handler.ts - Silence detection               │
 * │   │   └── user-identification.ts - User identification         │
 * │   │                                                             │
 * │   ├── processors/         - Turn processing (NEW)              │
 * │   │   ├── turn-processor.ts - Message analysis & context       │
 * │   │   └── types.ts        - Processor type definitions         │
 * │   │                                                             │
 * │   ├── realtime/           - Frontend communication (NEW)       │
 * │   │   └── frontend-publisher.ts - Data channel messages        │
 * │   │                                                             │
 * │   ├── session/            - Session state management (NEW)     │
 * │   │   └── session-state.ts - Unified state manager             │
 * │   │                                                             │
 * │   └── voice-agent.ts      - ⭐ PRIMARY: Generic agent          │
 * │                                                                 │
 * │ src/intelligence/context-builders/  - Modular context system   │
 * │   ├── emotional.ts        - Distress, validation, mirroring    │
 * │   ├── crisis.ts           - Market panic, grief, life events   │
 * │   ├── celebration.ts      - Milestones, good news              │
 * │   ├── memory.ts           - Cross-session, callbacks           │
 * │   ├── engagement.ts       - Curiosity, depth, follow-ups       │
 * │   ├── pacing.ts           - Response length, fatigue           │
 * │   ├── humanizing.ts       - Self-corrections, humor, wit       │
 * │   └── ...                 - And more!                          │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Usage:
 *   PERSONA_ID=ferni node dist/agents/voice-agent.js start
 *   PERSONA_ID=peter-john node dist/agents/voice-agent.js start
 *
 * Available personas:
 *   - ferni: The life coach (main persona)
 *   - peter-john: Research specialist
 *   - alex-chen: Communications specialist
 *   - maya-santos: Habits & routines specialist
 *   - jordan-taylor: Event planning specialist
 */

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
  parallelCollect,
  ParallelExecutor,
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
  createStreamingSession,
  LookaheadBuffer,
  ResponseStreamProcessor,
} from './shared/performance/response-streaming.js';

export {
  cachePersonaBundle,
  EdgeCache,
  getCachedPersonaBundle,
  getOrLoadPersonaBundle,
  getPersonaBundleCache,
  warmCommonCaches,
} from './shared/performance/edge-cache.js';

export {
  createSessionKeepAlive,
  getSessionKeepAlive,
  WebSocketKeepAlive,
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
// PRIMARY AGENT
// ============================================================================

// Generic voice agent (supports all personas via PERSONA_ID env var)
export * from './voice-agent.js';

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
