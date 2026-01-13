/**
 * Semantic Tool Router - Type Definitions
 *
 * A state-of-the-art tool routing system that works with any LLM provider.
 * Instead of relying on unreliable LLM function calling, we use semantic
 * understanding to route tool requests BEFORE the LLM.
 *
 * ARCHITECTURE:
 *
 * ```
 * User Input
 *      ↓
 * ┌─────────────────────────────────────────────┐
 * │           SEMANTIC TOOL ROUTER              │
 * ├─────────────────────────────────────────────┤
 * │ Layer 1: Fast Pattern Matching (<1ms)       │
 * │ Layer 2: Embedding Similarity (~10-30ms)    │
 * │ Layer 3: Context-Aware Refinement           │
 * │ Layer 4: Argument Extraction                │
 * └─────────────────────────────────────────────┘
 *      ↓
 * ┌─────────────────────────────────────────────┐
 * │              DECISION ENGINE                │
 * ├─────────────────────────────────────────────┤
 * │ High confidence → Execute directly          │
 * │ Medium → Hint to LLM                        │
 * │ Low → Pure conversation                     │
 * └─────────────────────────────────────────────┘
 * ```
 *
 * WHY THIS IS BETTER THAN LLM FUNCTION CALLING:
 *
 * 1. **Reliability**: Deterministic routing vs probabilistic LLM output
 * 2. **Speed**: Pattern matching + embeddings is faster than waiting for LLM
 * 3. **Provider Agnostic**: Works with OpenAI, Gemini, Claude, local models
 * 4. **Scalability**: Handles 100+ tools without prompt bloat
 * 5. **Debuggability**: Clear routing decisions with confidence scores
 *
 * @module tools/semantic-router
 */
/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG = {
    thresholds: {
        // Lowered from 0.92 to 0.80 for more aggressive auto-execution
        // Pattern matches (1.0) and regex (0.95) now reliably auto-execute
        autoExecute: 0.8,
        confirm: 0.7,
        hint: 0.55,
        minimum: 0.35,
    },
    layerWeights: {
        // Boosted pattern weight so exact matches dominate scoring
        pattern: 1.2, // Exact patterns are HIGHLY trusted - boost to ensure auto-execute
        keyword: 0.75, // Keywords are good signals
        embedding: 0.9, // Embeddings are very reliable
        context: 0.5, // Context is helpful but not definitive
        history: 0.3, // History is a weak signal
        holistic: 0.85, // Holistic NLU (relationship, emotion, multi-intent) - high trust
    },
    maxMatches: 5,
    enabledLayers: ['pattern', 'keyword', 'embedding', 'context', 'holistic'],
    embeddingModel: 'google',
    cacheEmbeddings: true,
    debug: false,
};
// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
/**
 * Type guard to check if a keyword is weighted
 */
export function isWeightedKeyword(keyword) {
    return typeof keyword === 'object' && 'word' in keyword && 'weight' in keyword;
}
/**
 * Normalize a keyword to weighted format
 */
export function normalizeKeyword(keyword) {
    if (isWeightedKeyword(keyword)) {
        return keyword;
    }
    return { word: keyword, weight: 1.0 };
}
/**
 * Get the word from a keyword (simple or weighted)
 */
export function getKeywordWord(keyword) {
    return isWeightedKeyword(keyword) ? keyword.word : keyword;
}
/**
 * Get the weight from a keyword (simple = 1.0, weighted = actual weight)
 */
export function getKeywordWeight(keyword) {
    return isWeightedKeyword(keyword) ? keyword.weight : 1.0;
}
/**
 * Type guard to check if an example is a test case
 */
export function isSemanticTestCase(example) {
    return typeof example === 'object' && 'input' in example && 'expectedMatch' in example;
}
/**
 * Get the input text from an example (simple or test case)
 */
export function getExampleText(example) {
    return isSemanticTestCase(example) ? example.input : example;
}
/**
 * Normalize examples to simple strings
 */
export function normalizeExamples(examples) {
    return examples.map(getExampleText);
}
/**
 * Type guard to check if a result is a ToolExecutionResult
 */
export function isToolExecutionResult(result) {
    return 'success' in result;
}
/**
 * Type guard to check if a result is a SemanticRoutingResult
 */
export function isSemanticRoutingResult(result) {
    return 'tool' in result && 'confidence' in result && !('success' in result);
}
//# sourceMappingURL=types.js.map