/**
 * Observability Services - Unified Metrics Collection
 *
 * Provides comprehensive observability for the Ferni AI platform:
 * - LLM Health (tokens, context, rate limits)
 * - Connection Health (WebSocket, LiveKit, data channels)
 * - User Experience (conversations, interruptions, completion)
 * - Memory/RAG Performance (vector search, relevance, storage)
 * - Cost Tracking (LLM, TTS, STT costs)
 * - Error & Recovery (error rates, retries, fallbacks)
 * - Persona Health (bundle load, knowledge queries, voice)
 *
 * @module observability
 */

export { llmHealthMetrics, type LLMHealthSnapshot, type LLMCall } from './llm-health.js';
export {
  connectionHealthMetrics,
  type ConnectionHealthSnapshot,
  type ConnectionEvent,
} from './connection-health.js';
export {
  uxQualityMetrics,
  type UXQualitySnapshot,
  type ConversationTurn,
  type SessionQuality,
} from './ux-quality.js';
export {
  memoryMetrics,
  type MemoryHealthSnapshot,
  type VectorSearchEvent,
  type EmbeddingEvent,
} from './memory-health.js';
export { costMetrics, type CostSnapshot, type CostEvent } from './cost-tracking.js';
export {
  errorMetrics,
  type ErrorSnapshot,
  type ErrorEvent,
  type ErrorCategory,
} from './error-recovery.js';
export {
  personaMetrics,
  type PersonaHealthSnapshot,
  type PersonaLoadEvent,
  type PersonaKnowledgeQuery,
  type PersonaVoiceEvent,
  type PersonaUsageEvent,
} from './persona-health.js';
export { observabilityHub, type ObservabilitySnapshot, type Alert } from './hub.js';
