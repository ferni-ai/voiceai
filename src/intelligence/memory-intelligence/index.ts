/**
 * Memory Intelligence Module
 *
 * Coordinates when, what, and how to surface memories during conversations.
 * Replaces scattered context builders with unified intelligence.
 *
 * @module intelligence/memory-intelligence
 */

// Types
export type {
  MemoryIntelligence,
  TurnContext,
  ConversationContext,
  EmotionalState,
  UserState,
  TimingDecision,
  SurfacingTrigger,
  BlockingCondition,
  TimingRule,
  TimingRuleContext,
  PhrasingStyle,
  PersonaId,
  TrustLevel,
  PhrasingTemplate,
  PhrasingResult,
  UserResponseSignal,
  UserResponseType,
  UserMemoryProfile,
  MemoryPreparedContext,
  ScoredMemoryForTurn,
  MemoryIntelligenceConfig,
  MemorySurfacedEvent,
  MemoryResponseEvent,
} from './types.js';

export { DEFAULT_MEMORY_INTELLIGENCE_CONFIG } from './types.js';

// Core
export { MemoryIntelligenceCore, getMemoryIntelligence, resetMemoryIntelligence } from './core.js';

// Timing
export { TimingEngine, getTimingEngine } from './timing/timing-engine.js';
export { ReceptivityScorer, getReceptivityScorer } from './timing/receptivity-scorer.js';
export { BLOCKING_RULES, TRIGGERING_RULES, evaluateTimingRules } from './timing/timing-rules.js';

// Phrasing
export { PhrasingGenerator, getPhrasingGenerator } from './phrasing/phrasing-generator.js';
export { getPersonaVoice, PERSONA_VOICES } from './phrasing/persona-voice.js';
export { PHRASING_TEMPLATES } from './phrasing/templates.js';

// Learning
export { ResponseTracker, getResponseTracker } from './learning/response-tracker.js';
export { ProfileBuilder, getProfileBuilder } from './learning/profile-builder.js';
export { PreferenceLearner, getPreferenceLearner } from './learning/preference-learner.js';

// Turn Processor Integration
export {
  getMemoryInjection,
  initMemorySession,
  endMemorySession,
  recordMemoryResponse,
  getMemoryContext,
  type MemoryInjectionInput,
  type MemoryInjection,
} from './turn-processor-integration.js';

// Metrics/Observability
export {
  getMetrics as getMemoryIntelligenceMetrics,
  getMetricsSummary as getMemoryIntelligenceMetricsSummary,
  resetMetrics as resetMemoryIntelligenceMetrics,
  type MemoryIntelligenceMetrics,
  type TimingDecisionMetric,
  type SurfacingMetric,
  type ResponseMetric,
} from './metrics.js';
