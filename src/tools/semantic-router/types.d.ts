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
 * Semantic trigger patterns for fast matching
 */
export interface SemanticTrigger {
    /** Exact phrases that trigger this tool */
    phrases?: string[];
    /** Regex patterns for matching */
    patterns?: RegExp[];
    /**
     * Keywords that suggest this tool
     * Can be simple strings or weighted objects:
     * - Simple: ['career', 'job', 'work']
     * - Weighted: [{ word: 'career', weight: 1.0 }, { word: 'job', weight: 0.8 }]
     */
    keywords?: string[] | Array<{
        word: string;
        weight: number;
    }>;
    /** Negative keywords that suggest NOT this tool */
    antiKeywords?: string[];
}
/**
 * Test case example for semantic matching validation
 */
export interface SemanticTestCase {
    /** The input text to test */
    input: string;
    /** Whether this input should match the tool */
    expectedMatch: boolean;
}
/**
 * Example input - can be simple string or detailed test case
 */
export type SemanticExample = string | SemanticTestCase;
/**
 * Argument definition for a tool
 */
export interface ToolArgument {
    name: string;
    type: 'string' | 'number' | 'boolean' | 'array' | 'object';
    description: string;
    required: boolean;
    /** Extraction patterns (regex with named groups) */
    extractionPatterns?: RegExp[];
    /** Entity type for NER extraction */
    entityType?: 'location' | 'person' | 'date' | 'time' | 'number' | 'duration' | 'genre' | 'custom';
    /** Default value if not extracted */
    defaultValue?: unknown;
    /** Valid values (for enums) */
    enumValues?: string[];
}
/**
 * Complete tool definition for semantic routing
 */
export interface SemanticToolDefinition {
    /** Unique tool identifier */
    id: string;
    /** Human-readable name */
    name: string;
    /** Detailed description for embedding */
    description: string;
    /** Short description for quick matching */
    shortDescription: string;
    /** Tool category for hierarchical routing */
    category: ToolCategory;
    /** Semantic triggers for fast matching */
    triggers: SemanticTrigger;
    /**
     * Example user queries that should trigger this tool
     * Can be simple strings or test cases with expectedMatch flag:
     * - Simple: ['play some jazz', 'I want to hear music']
     * - Test case: [{ input: 'play jazz', expectedMatch: true }]
     */
    examples: SemanticExample[];
    /**
     * Counter-examples that should NOT trigger this tool
     * Can be simple strings or test cases with expectedMatch flag
     */
    counterExamples?: SemanticExample[];
    /** Tool arguments */
    arguments: ToolArgument[];
    /**
     * The actual tool function to execute
     * Can return full ToolExecutionResult or simple routing result
     */
    execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<ToolExecutionResult | SemanticRoutingResult>;
    /** Domain to delegate tool execution to (for semantic routing) */
    delegateTo?: string;
    /** Priority when multiple tools match (higher = preferred) */
    priority?: number;
    /** Whether this tool requires confirmation before execution */
    requiresConfirmation?: boolean;
    /** Cooldown between executions (ms) */
    cooldownMs?: number;
    /** Tags for filtering and organization */
    tags?: string[];
    /** Confidence scoring configuration */
    confidence?: {
        /** Base confidence score (0-1) */
        baseScore: number;
        /** Bonus for pattern matches */
        patternMatchBonus?: number;
        /** Multiplier for keyword density */
        keywordDensityMultiplier?: number;
        /** Penalty for negative keywords */
        negativeKeywordPenalty?: number;
    };
    /** Context-based boosts */
    contextBoosts?: {
        /** Boost when certain emotions are detected */
        emotionBoost?: {
            condition: string;
            boost: number;
        };
        /** Boost during certain hours */
        timeBoost?: {
            hours: number[];
            boost: number;
        };
    };
}
/**
 * Tool categories for hierarchical routing
 *
 * Categories are organized by domain:
 * - Core: music, calendar, memory, habits, handoff
 * - Information: information, weather
 * - Wellness: wellness, crisis (safety-critical)
 * - Life Coaching: life-coaching, career, decisions, dating, relationships, grief
 * - Productivity: tasks, productivity, smart-home, learning
 * - Entertainment: games, entertainment, recommendations
 * - Finance: finance, telephony
 * - System: utility, settings, communication
 */
export type ToolCategory = 'music' | 'calendar' | 'memory' | 'habits' | 'handoff' | 'information' | 'weather' | 'wellness' | 'crisis' | 'life-coaching' | 'life-planning' | 'career' | 'decisions' | 'dating' | 'relationships' | 'grief' | 'family' | 'tasks' | 'productivity' | 'smart-home' | 'learning' | 'games' | 'entertainment' | 'recommendations' | 'finance' | 'telephony' | 'travel' | 'utility' | 'settings' | 'communication' | 'local-search';
/**
 * Holistic context detected from user input.
 * Provides relationship, emotional, and urgency signals.
 */
export interface HolisticContextSummary {
    /** Detected relationship type (family_immediate, friends, professional, etc.) */
    relationshipType?: string;
    /** Relationship sentiment (personal, professional, transactional, collective) */
    relationshipSentiment?: string;
    /** Detected emotion type (stressed, happy, crisis, etc.) */
    emotionType?: string;
    /** Emotion valence (positive, negative, neutral, crisis) */
    emotionValence?: string;
    /** Overall urgency level */
    urgency: 'low' | 'medium' | 'high' | 'critical';
    /** Overall sentiment of the input */
    sentiment: 'positive' | 'neutral' | 'negative' | 'crisis';
    /** Is this a crisis situation requiring safety tools? */
    isCrisis: boolean;
    /** Is this a compound (multi-intent) query? */
    isCompoundIntent: boolean;
    /** Domain boosts from context (category → boost amount) */
    domainBoosts: Record<string, number>;
}
/**
 * Result from the semantic router
 */
export interface SemanticRouterResult {
    /** Detected intent */
    intent: DetectedIntent;
    /** Matched tools ranked by confidence */
    matches: ToolMatch[];
    /** Recommended action */
    action: RouterAction;
    /** Extracted arguments (if tool matched) */
    extractedArgs?: Record<string, unknown>;
    /** Routing metadata for debugging */
    metadata: RoutingMetadata;
    /** Holistic context (relationship, emotion, urgency) detected from input */
    holisticContext?: HolisticContextSummary;
}
/**
 * Detected user intent
 */
export interface DetectedIntent {
    /** Primary intent category */
    category: ToolCategory | 'conversation' | 'clarification' | 'unknown';
    /** Specific intent within category */
    specific?: string;
    /** Confidence in intent detection (0-1) */
    confidence: number;
    /** Whether user is asking vs commanding */
    mood: 'command' | 'question' | 'request' | 'statement';
    /** Urgency level */
    urgency: 'low' | 'normal' | 'high' | 'critical';
}
/**
 * A matched tool with confidence score
 */
export interface ToolMatch {
    /** Tool ID */
    toolId: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Which layer(s) matched this tool */
    matchedBy: MatchLayer[];
    /** Breakdown of confidence by layer */
    layerScores: Record<MatchLayer, number>;
    /** Extracted arguments for this tool */
    extractedArgs: Record<string, unknown>;
    /** Missing required arguments */
    missingArgs: string[];
    /** Reason for match (for debugging) */
    matchReason: string;
    /** Optional metadata (prosody signals, etc.) */
    metadata?: Record<string, unknown>;
}
/**
 * Extended tool match with semantic routing metadata.
 * Used by prosody routing and other advanced systems.
 */
export type SemanticToolMatch = ToolMatch;
/**
 * Matching layers used in routing
 */
export type MatchLayer = 'pattern' | 'keyword' | 'embedding' | 'context' | 'history' | 'holistic';
/**
 * Recommended action from router
 */
export type RouterAction = {
    type: 'execute';
    toolId: string;
    args: Record<string, unknown>;
    confidence: number;
} | {
    type: 'confirm';
    toolId: string;
    args: Record<string, unknown>;
    question: string;
} | {
    type: 'disambiguate';
    options: Array<{
        toolId: string;
        description: string;
    }>;
} | {
    type: 'clarify';
    question: string;
    missingInfo: string[];
} | {
    type: 'hint';
    toolId: string;
    confidence: number;
} | {
    type: 'conversation';
    reason: string;
};
/**
 * Routing metadata for debugging and analytics
 */
export interface RoutingMetadata {
    /** Total routing time (ms) */
    totalTimeMs: number;
    /** Time per layer */
    layerTimesMs: Record<MatchLayer, number>;
    /** Number of tools considered */
    toolsConsidered: number;
    /** Raw input text */
    inputText: string;
    /** Normalized input text */
    normalizedText: string;
    /** Session context used */
    contextUsed: string[];
    /** Routing version for A/B testing */
    routerVersion: string;
}
/**
 * Context provided to tool execution
 */
export interface ToolExecutionContext {
    /** User ID */
    userId: string;
    /** Session ID */
    sessionId: string;
    /** Current persona */
    personaId: string;
    /** Conversation history (last N turns) */
    conversationHistory: ConversationTurn[];
    /** User profile */
    userProfile?: UserProfileContext;
    /** Session services */
    services: unknown;
    /** Original user text */
    originalText: string;
    /** Confidence that triggered execution */
    confidence: number;
    /** User's location (city or coordinates) */
    userLocation?: string;
}
/**
 * Conversation turn for context
 */
export interface ConversationTurn {
    role: 'user' | 'assistant';
    text: string;
    timestamp: Date;
    toolsUsed?: string[];
}
/**
 * User profile context for personalization
 */
export interface UserProfileContext {
    name?: string;
    preferences?: Record<string, unknown>;
    recentTools?: string[];
    timezone?: string;
}
/**
 * Result from tool execution
 */
export interface ToolExecutionResult {
    /** Whether execution succeeded */
    success: boolean;
    /** Result data */
    data?: unknown;
    /** Human-readable result for LLM to use */
    naturalResponse?: string;
    /** Error message if failed */
    error?: string;
    /** Whether to speak the response immediately */
    speakImmediately?: boolean;
    /** Side effects (for logging/analytics) */
    sideEffects?: string[];
    /** Tool ID that should be executed (for semantic routing delegation) */
    toolId?: string;
    /** Arguments to pass to the delegated tool */
    args?: Record<string, unknown>;
    /** Domain to delegate to */
    delegateTo?: string;
}
/**
 * Simple routing result for semantic tool definitions
 * Used when a semantic tool just needs to indicate which tool to call
 */
export interface SemanticRoutingResult {
    /** Tool ID to execute */
    tool: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Optional arguments to pass */
    args?: Record<string, unknown>;
}
/**
 * Configuration for the semantic router
 */
export interface SemanticRouterConfig {
    /** Confidence thresholds */
    thresholds: {
        /** Execute directly without LLM (default: 0.92) */
        autoExecute: number;
        /** Ask for confirmation (default: 0.80) */
        confirm: number;
        /** Pass hint to LLM (default: 0.60) */
        hint: number;
        /** Minimum to consider a match (default: 0.40) */
        minimum: number;
    };
    /** Layer weights for combining scores */
    layerWeights: Record<MatchLayer, number>;
    /** Maximum tools to return in matches */
    maxMatches: number;
    /** Enable/disable specific layers */
    enabledLayers: MatchLayer[];
    /** Embedding model to use */
    embeddingModel: 'local' | 'openai' | 'voyage' | 'cohere' | 'google';
    /** Cache embeddings */
    cacheEmbeddings: boolean;
    /** Debug mode */
    debug: boolean;
}
/**
 * Default router configuration
 */
export declare const DEFAULT_ROUTER_CONFIG: SemanticRouterConfig;
/**
 * Embedding vector type
 */
export type EmbeddingVector = Float32Array | number[];
/**
 * Cached embedding entry
 */
export interface CachedEmbedding {
    text: string;
    vector: EmbeddingVector;
    model: string;
    createdAt: Date;
}
/**
 * Embedding provider interface
 */
export interface EmbeddingProvider {
    /** Get embedding for a single text */
    embed(text: string): Promise<EmbeddingVector>;
    /** Get embeddings for multiple texts (batched) */
    embedBatch(texts: string[]): Promise<EmbeddingVector[]>;
    /** Model name */
    modelName: string;
    /** Embedding dimensions */
    dimensions: number;
}
/**
 * Routing analytics event
 */
export interface RoutingAnalyticsEvent {
    timestamp: Date;
    sessionId: string;
    userId: string;
    inputText: string;
    result: SemanticRouterResult;
    actualOutcome?: {
        toolExecuted?: string;
        success?: boolean;
        userFeedback?: 'correct' | 'wrong_tool' | 'should_not_have_called';
    };
}
/**
 * Type guard to check if a keyword is weighted
 */
export declare function isWeightedKeyword(keyword: string | {
    word: string;
    weight: number;
}): keyword is {
    word: string;
    weight: number;
};
/**
 * Normalize a keyword to weighted format
 */
export declare function normalizeKeyword(keyword: string | {
    word: string;
    weight: number;
}): {
    word: string;
    weight: number;
};
/**
 * Get the word from a keyword (simple or weighted)
 */
export declare function getKeywordWord(keyword: string | {
    word: string;
    weight: number;
}): string;
/**
 * Get the weight from a keyword (simple = 1.0, weighted = actual weight)
 */
export declare function getKeywordWeight(keyword: string | {
    word: string;
    weight: number;
}): number;
/**
 * Type guard to check if an example is a test case
 */
export declare function isSemanticTestCase(example: SemanticExample): example is SemanticTestCase;
/**
 * Get the input text from an example (simple or test case)
 */
export declare function getExampleText(example: SemanticExample): string;
/**
 * Normalize examples to simple strings
 */
export declare function normalizeExamples(examples: SemanticExample[]): string[];
/**
 * Type guard to check if a result is a ToolExecutionResult
 */
export declare function isToolExecutionResult(result: ToolExecutionResult | SemanticRoutingResult): result is ToolExecutionResult;
/**
 * Type guard to check if a result is a SemanticRoutingResult
 */
export declare function isSemanticRoutingResult(result: ToolExecutionResult | SemanticRoutingResult): result is SemanticRoutingResult;
//# sourceMappingURL=types.d.ts.map