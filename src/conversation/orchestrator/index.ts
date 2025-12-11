/**
 * Conversation Orchestrator Module
 *
 * Unified orchestration for all conversation humanization systems.
 *
 * @module @ferni/conversation/orchestrator
 */

// Main orchestrator
export {
  ConversationOrchestrator,
  getConversationOrchestrator,
  resetConversationOrchestrator,
  resetAllOrchestrators,
  default,
} from './conversation-orchestrator.js';

// Types
export type {
  OrchestratorInput,
  OrchestratorOutput,
  OrchestratorConfig,
  AnalysisPhaseResult,
  IntelligencePhaseResult,
  HumanizationPhaseResult,
  DetectedSignals,
  AnalysisContext,
  IntelligenceGuidance,
  PriorityAction,
  AppliedFeature,
  SkippedFeature,
  ResponseAdditions,
  OutputMetadata,
} from './types.js';

export { DEFAULT_ORCHESTRATOR_CONFIG } from './types.js';
