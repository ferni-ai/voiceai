/**
 * Dynamic Memory Module
 *
 * State-of-the-art memory extraction and storage implementing:
 * - Temporal decoupling (PMFR pattern)
 * - LLM-powered extraction (Mem0 pattern)
 * - Self-questioning refinement (ProMem pattern)
 * - Three-layer memory (STM, Working, Long-Term)
 *
 * Three paths:
 * 1. L1: STM Buffer (in-memory) - Session context, O(1) access
 * 2. L2: Fast Capture (< 50ms) + Firestore - Working memory
 * 3. L3: Deep Extraction → Spanner Graph - Long-term relationships
 *
 * @see docs/architecture/DYNAMIC-MEMORY-ARCHITECTURE.md
 */

// L2: Fast capture (real-time extraction)
export {
  fastCapture,
  detectEntityMentions,
  detectEmotionSignals,
  detectTopicHints,
  detectDateSignals,
  detectRelationshipSignals,
  type FastCaptureInput,
  type FastCaptureResult,
  type EntityMention,
  type EmotionSignal,
  type DateSignal,
  type RelationshipSignal,
} from './fast-capture.js';

// L3: Deep extraction worker (async LLM-powered)
export {
  DeepExtractionWorker,
  getDeepExtractionWorker,
  startDeepExtractionWorker,
  type DeepExtractionJob,
  type ExtractedEntity,
  type ExtractedFact,
  type ExtractedRelationship,
  type ExtractionResult,
} from './deep-extraction-worker.js';

// L1: STM buffer (in-memory session context)
export {
  getSTMBuffer,
  recordTurn,
  getRecentTurns,
  getFrequentEntities,
  getRecentTopics,
  wasEntityMentioned,
  getEntityMentionInfo,
  isTopicContinuing,
  getEmotionalTrajectory,
  getVoiceEmotionTrajectory,
  buildSTMContext,
  cleanupSession,
  cleanupExpiredSessions,
  startSTMCleanup,
  stopSTMCleanup,
  clearAllSTMBuffers,
  getSTMStats,
  configureSTMBuffer,
  type TurnMemory,
  type VoiceEmotionSnapshot,
  type EntityFrequency,
  type SessionSTM,
} from './stm-buffer.js';

// L1 → L2: STM promotion (session end → Firestore)
export {
  promoteSessionToFirestore,
  onSessionEnd,
  configurePromotion,
  type PromotionConfig,
  type PromotionResult,
  type PromotedEntity,
  type PromotedEmotionalArc,
  type PromotedTopicPattern,
} from './stm-promotion.js';

// L2 → L3: Firestore → Spanner background sync
export {
  runSyncCycle,
  startSyncService,
  stopSyncService,
  getSyncStats,
  isSyncServiceRunning,
  configureSyncService,
  type SyncConfig,
  type SyncResult,
  type SyncStats,
} from './firestore-spanner-sync.js';

// Observability metrics
export {
  getDynamicMemoryMetrics,
  getMetricsSummary,
  logMetrics,
  recordFastCapture,
  recordSTMTurn,
  recordSTMState,
  recordPromotion,
  recordDeepExtraction,
  recordQueueDepth,
  recordFirestoreWrite,
  recordFirestoreRead,
  recordSyncCycle,
  resetMetrics,
  // Memory health status (Jan 2026)
  getMemoryHealthStatus,
  // Knowledge graph metrics (Jan 2026)
  recordKnowledgeCapture,
  recordKnowledgeGraphStatus,
  getKnowledgeGraphMetrics,
  // Human signal metrics (Jan 2026)
  recordHumanSignalExtraction,
  recordHumanSignalPersistence,
  getHumanSignalMetrics,
  // Memory attribution metrics
  recordMemoryAttribution,
  recordMemoriesInjected,
  getAttributionMetrics,
  type DynamicMemoryMetrics,
  type MemoryHealthStatus,
} from './metrics.js';

// Voice Context Capture (Phase 11: Better Than Human)
export {
  voiceCaptureEnhanced,
  extractVoiceContext,
  calculateVoiceWeight,
  getVoiceContextForTurn,
  getRecentVoiceContexts,
  setVoiceCaptureConfig,
  getVoiceCaptureConfig,
  type VoiceCaptureInput,
  type VoiceContextData,
  type VoiceCaptureResult,
  type VoiceCaptureConfig,
} from './voice-context-capture.js';

// Dependency Injection configuration (services layer injects AsyncEvents)
export {
  configureAsyncEvents,
  isAsyncEventsConfigured,
  resetAsyncEventsConfig,
  type AsyncEventsConfig,
  type AsyncEventEmitter,
  type AsyncEventListener,
} from './async-events-config.js';
