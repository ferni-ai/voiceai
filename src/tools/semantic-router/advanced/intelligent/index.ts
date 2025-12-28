/**
 * Intelligent Routing System
 *
 * A comprehensive suite of advanced routing strategies that go beyond
 * semantic matching to provide truly intelligent tool selection.
 *
 * ## Strategies
 *
 * 1. **Intent Classifier** - Fast NLU-style classification (<5ms)
 *    - Pattern matching for common intents
 *    - Slot extraction for arguments
 *    - Learning from corrections
 *
 * 2. **LLM Fallback** - For uncertain cases (~500ms)
 *    - Triggers when semantic routing is uncertain
 *    - LLM selects from top candidates with reasoning
 *    - Handles edge cases better than embeddings
 *
 * 3. **ReAct Reasoning** - Explainable decisions (~800ms)
 *    - Step-by-step reasoning (Thought → Action)
 *    - Full transparency into decision process
 *    - Better for complex intents
 *
 * 4. **Goal Planner** - Multi-step execution (~1-2s)
 *    - Decomposes complex requests into tool sequences
 *    - Dependency-aware parallel execution
 *    - State passing between steps
 *
 * 5. **Bandit Optimizer** - RL-based learning
 *    - Thompson Sampling for exploration/exploitation
 *    - Learns from actual outcomes (not just clicks)
 *    - Contextual boosts (time, persona, topic)
 *
 * 6. **Orchestrator** - Combines all strategies
 *    - Cascade routing through strategies
 *    - Adaptive strategy selection
 *    - Unified interface
 *
 * ## Usage
 *
 * ```typescript
 * import {
 *   getIntelligentOrchestrator,
 *   initializeIntelligentOrchestrator,
 *   intelligentRoute,
 * } from './intelligent';
 *
 * // Initialize
 * const orchestrator = initializeIntelligentOrchestrator();
 * await orchestrator.initialize({
 *   tools: [...],
 *   llmProvider: myLLMProvider,
 *   semanticRouter: existingRouter.route,
 * });
 *
 * // Route
 * const decision = await orchestrator.route('play some jazz music', {
 *   userId: 'user123',
 *   personaId: 'ferni',
 * });
 *
 * console.log(decision.toolId);       // 'spotify_play'
 * console.log(decision.decidedBy);    // 'intent-classifier'
 * console.log(decision.confidence);   // 0.92
 * console.log(decision.reasoning);    // 'Matched intent: Play Music'
 * ```
 *
 * @module semantic-router/advanced/intelligent
 */

// ============================================================================
// INTENT CLASSIFIER
// ============================================================================

export {
  IntentClassifier,
  getIntentClassifier,
  initializeIntentClassifier,
  type IntentClassifierConfig,
  type Intent,
  type Slot,
  type SlotType,
  type ClassificationResult,
} from './intent-classifier.js';

// ============================================================================
// LLM FALLBACK ROUTER
// ============================================================================

export {
  LLMFallbackRouter,
  getLLMFallbackRouter,
  initializeLLMFallback,
  createGeminiProvider,
  createOpenAIProvider,
  type LLMFallbackConfig,
  type LLMSelectionResult,
  type ToolCandidate,
  type LLMProvider,
} from './llm-fallback.js';

// ============================================================================
// REACT REASONING ENGINE
// ============================================================================

export {
  ReActReasoningEngine,
  getReActEngine,
  initializeReActEngine,
  explainReasoning,
  suggestsMultiStep,
  type ReActConfig,
  type ReasoningStep,
  type ReActResult,
  type ReActLLMProvider,
  type ToolDescription as ReActToolDescription,
} from './react-reasoning.js';

// ============================================================================
// GOAL PLANNER
// ============================================================================

export {
  GoalPlanner,
  getGoalPlanner,
  initializeGoalPlanner,
  describePlan,
  shouldAutoExecute,
  type GoalPlannerConfig,
  type PlanStep,
  type ExecutionPlan,
  type PlanExecutionState,
  type GoalPlannerLLMProvider,
  type ToolExecutor,
  type ToolDefinition as GoalPlannerToolDefinition,
} from './goal-planner.js';

// ============================================================================
// BANDIT OPTIMIZER
// ============================================================================

export {
  BanditOptimizer,
  getBanditOptimizer,
  initializeBanditOptimizer,
  calculateImplicitReward,
  calculateExplicitReward,
  type BanditConfig,
  type ToolArm,
  type SelectionResult as BanditSelectionResult,
  type RewardSignal,
  type RoutingContext as BanditRoutingContext,
} from './bandit-optimizer.js';

// ============================================================================
// INTELLIGENT ORCHESTRATOR
// ============================================================================

export {
  IntelligentRouterOrchestrator,
  getIntelligentOrchestrator,
  initializeIntelligentOrchestrator,
  intelligentRoute,
  type OrchestratorConfig,
  type RoutingDecision,
  type RoutingStrategy,
  type ToolDefinition as OrchestratorToolDefinition,
  type RoutingContext as OrchestratorRoutingContext,
} from './orchestrator.js';

// ============================================================================
// FERNI-SPECIFIC INTENTS
// ============================================================================

export {
  FERNI_INTENTS,
  PERSONA_HANDOFF_INTENTS,
  HABIT_INTENTS,
  FINANCE_INTENTS,
  CALENDAR_INTENTS,
  PLANNING_INTENTS,
  WISDOM_INTENTS,
  EMOTIONAL_INTENTS,
  CRISIS_INTENTS,
  MUSIC_INTENTS,
  MEMORY_INTENTS,
  SMALLTALK_INTENTS,
  getIntentsForPersona,
  registerFerniIntents,
} from './ferni-intents.js';

// ============================================================================
// PERSISTENCE
// ============================================================================

export {
  createFirestorePersistence,
  createInMemoryPersistence,
  saveUserPreferences,
  loadUserPreferences,
  recordUserToolPreference,
  saveBanditMetrics,
  loadBanditMetrics,
  incrementBanditMetrics,
  recordRoutingEvent,
  updateRoutingEventOutcome,
  startAutoSave,
  stopAutoSave,
  queueForSave,
  type BanditPersistence,
  type UserRoutingPreferences,
  type BanditMetrics,
  type RoutingEvent,
} from './bandit-persistence.js';

// ============================================================================
// EXTENDED INTENTS (Weather, Reminders, Timers, etc.)
// ============================================================================

export {
  EXTENDED_INTENTS,
  WEATHER_INTENTS,
  REMINDER_INTENTS,
  TIMER_INTENTS,
  NOTES_INTENTS,
  SPOTIFY_INTENTS,
  SEARCH_INTENTS,
  LOCATION_INTENTS,
  DATETIME_INTENTS,
  getAllExtendedIntents,
  getIntentsByCategory,
} from './extended-intents.js';

// ============================================================================
// LLM PROVIDERS (Gemini, OpenAI, Claude)
// ============================================================================

export {
  createGeminiProvider as createGeminiLLMProvider,
  createOpenAIProvider as createOpenAILLMProvider,
  createClaudeProvider,
  createLLMProvider,
  createProviderFromEnv,
  type LLMProviderConfig,
  type LLMProviderType,
  type UnifiedLLMProvider,
} from './llm-providers.js';

// ============================================================================
// OBSERVABILITY
// ============================================================================

export {
  recordRoutingDecision,
  recordRoutingOutcome,
  recordFallback,
  getDashboardData,
  getStrategyMetrics,
  clearMetrics,
  checkAlerts,
  type RoutingMetricEvent,
  type StrategyMetrics,
  type DashboardData,
  type Alert,
  type AlertRule,
} from './observability.js';

// ============================================================================
// A/B TESTING
// ============================================================================

export {
  getABTestingService,
  shouldUseIntelligentRouting,
  getIntelligentConfig,
  recordABTestResult,
  enableIntelligentRouting,
  getExperimentDashboard,
  INTELLIGENT_VS_SEMANTIC_EXPERIMENT,
  CONFIDENCE_THRESHOLD_EXPERIMENT,
  type RoutingExperiment,
  type IntelligentRoutingConfig,
  type ExperimentAssignment,
  type ExperimentResults,
  type VariantStats,
} from './ab-testing.js';

// ============================================================================
// CACHE WARMING
// ============================================================================

export {
  warmIntelligentRouting,
  quickWarmup,
  fullWarmup,
  startPeriodicRefresh,
  stopPeriodicRefresh,
  type WarmupConfig,
  type WarmupResult,
} from './cache-warming.js';

// ============================================================================
// CONVENIENCE RE-EXPORTS
// ============================================================================

// Default export for simple usage
export { getIntelligentOrchestrator as default } from './orchestrator.js';
