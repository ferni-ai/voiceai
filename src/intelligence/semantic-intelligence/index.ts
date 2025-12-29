/**
 * Semantic Intelligence Layer
 *
 * A hybrid approach that uses semantic capabilities to ENHANCE LLM decision-making
 * without replacing it. The JSON workaround handles reliable tool dispatch while
 * semantic intelligence provides:
 *
 * 1. TOOL HINTS - Inject likely tools into LLM context
 * 2. LEARNING LOOP - Record executions and learn from corrections
 * 3. INTENT CLASSIFICATION - Fast classification for context enrichment
 * 4. PROACTIVE ANTICIPATION - Pattern-based need anticipation
 *
 * ARCHITECTURE:
 * ```
 * User Speech
 *     ↓
 * ┌─────────────────────────────────────┐
 * │  SEMANTIC INTELLIGENCE (this layer) │
 * │  - Intent classification (~1-2ms)   │
 * │  - Tool hints (~5-15ms)             │
 * │  - Memory retrieval (parallel)      │
 * │  - Proactive hints (if patterns)    │
 * └─────────────────────────────────────┘
 *     ↓ (enhances context)
 * ┌─────────────────────────────────────┐
 * │  LLM (Gemini/OpenAI)                │
 * │  Makes final tool decision with     │
 * │  semantic hints in context          │
 * └─────────────────────────────────────┘
 *     ↓
 * ┌─────────────────────────────────────┐
 * │  JSON DISPATCH (reliable)           │
 * │  {"fn":"...","args":{...}}          │
 * └─────────────────────────────────────┘
 *     ↓
 * ┌─────────────────────────────────────┐
 * │  LEARNING LOOP (post-execution)     │
 * │  - Record what tool was used        │
 * │  - Compare to semantic prediction   │
 * │  - Update user preferences          │
 * └─────────────────────────────────────┘
 * ```
 *
 * @module intelligence/semantic-intelligence
 */

export {
  // Phase 1: Tool Hints
  getSemanticToolHints,
  buildToolHintInjection,
  shouldGenerateHints,
  type ToolHint,
  type ToolHintResult,
  type ToolHintContext,
} from './tool-hints.js';

export {
  // Phase 2: Learning Loop
  recordToolExecution,
  recordImplicitCorrection,
  recordExplicitCorrection,
  getToolPrediction,
  getUserToolPatterns,
  type ExecutionRecord,
  type ToolPattern,
  type ToolPrediction,
} from './learning-loop.js';

export {
  // Phase 3: Intent Classification
  classifyIntent,
  getIntentType,
  isToolRequest,
  needsCrisisSupport,
  type IntentClassification,
  type IntentType,
} from './intent-classifier.js';

export {
  // Phase 4: Proactive Anticipation
  getProactiveHints,
  shouldPrewarmTool,
  recordToolTiming,
  type ProactiveHint,
  type TimingPattern,
  type AnticipationContext,
} from './proactive-anticipation.js';

export {
  // Unified orchestrator
  getSemanticIntelligence,
  processSemanticIntelligence,
  recordExecution,
  type SemanticIntelligenceResult,
  type SemanticIntelligenceContext,
} from './orchestrator.js';
