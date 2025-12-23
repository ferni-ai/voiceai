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

// ============================================================================
// TOOL DEFINITION
// ============================================================================

/**
 * Semantic trigger patterns for fast matching
 */
export interface SemanticTrigger {
  /** Exact phrases that trigger this tool */
  phrases?: string[];

  /** Regex patterns for matching */
  patterns?: RegExp[];

  /** Keywords that suggest this tool (weighted) */
  keywords?: Array<{ word: string; weight: number }>;

  /** Negative keywords that suggest NOT this tool */
  antiKeywords?: string[];
}

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

  /** Example user queries that should trigger this tool */
  examples: string[];

  /** Counter-examples that should NOT trigger this tool */
  counterExamples?: string[];

  /** Tool arguments */
  arguments: ToolArgument[];

  /** The actual tool function to execute */
  execute: (
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ) => Promise<ToolExecutionResult>;

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
export type ToolCategory =
  // Core functionality
  | 'music'
  | 'calendar'
  | 'memory'
  | 'habits'
  | 'handoff'
  // Information
  | 'information'
  | 'weather'
  // Wellness & Crisis
  | 'wellness'
  | 'crisis' // SAFETY-CRITICAL
  // Life Coaching
  | 'life-coaching'
  | 'career'
  | 'decisions'
  | 'dating'
  | 'relationships'
  | 'grief'
  // Productivity
  | 'tasks'
  | 'productivity'
  | 'smart-home'
  | 'learning'
  // Entertainment
  | 'games'
  | 'entertainment'
  | 'recommendations'
  // Finance & Telephony
  | 'finance'
  | 'telephony'
  // System
  | 'utility'
  | 'settings'
  | 'communication';

// ============================================================================
// ROUTING RESULTS
// ============================================================================

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
}

/**
 * Matching layers used in routing
 */
export type MatchLayer =
  | 'pattern' // Fast regex/phrase matching
  | 'keyword' // Keyword scoring
  | 'embedding' // Semantic embedding similarity
  | 'context' // Conversation context
  | 'history'; // User's tool usage history

/**
 * Recommended action from router
 */
export type RouterAction =
  | { type: 'execute'; toolId: string; args: Record<string, unknown>; confidence: number }
  | { type: 'confirm'; toolId: string; args: Record<string, unknown>; question: string }
  | { type: 'disambiguate'; options: Array<{ toolId: string; description: string }> }
  | { type: 'clarify'; question: string; missingInfo: string[] }
  | { type: 'hint'; toolId: string; confidence: number }
  | { type: 'conversation'; reason: string };

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

// ============================================================================
// EXECUTION CONTEXT
// ============================================================================

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
  services: unknown; // SessionServices type

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

// ============================================================================
// ROUTER CONFIGURATION
// ============================================================================

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
  embeddingModel: 'local' | 'openai' | 'voyage' | 'cohere';

  /** Cache embeddings */
  cacheEmbeddings: boolean;

  /** Debug mode */
  debug: boolean;
}

/**
 * Default router configuration
 */
export const DEFAULT_ROUTER_CONFIG: SemanticRouterConfig = {
  thresholds: {
    autoExecute: 0.92,
    confirm: 0.8,
    hint: 0.6,
    minimum: 0.4,
  },
  layerWeights: {
    pattern: 1.0, // Exact patterns are highly trusted
    keyword: 0.7, // Keywords are good signals
    embedding: 0.85, // Embeddings are very reliable
    context: 0.6, // Context is helpful but not definitive
    history: 0.4, // History is a weak signal
  },
  maxMatches: 5,
  enabledLayers: ['pattern', 'keyword', 'embedding', 'context'],
  embeddingModel: 'openai',
  cacheEmbeddings: true,
  debug: false,
};

// ============================================================================
// EMBEDDINGS
// ============================================================================

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

// ============================================================================
// ANALYTICS
// ============================================================================

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
