/**
 * FTIS Hybrid Router
 *
 * Implements tiered routing for optimal latency/accuracy tradeoff:
 * - Fast Path: Direct execution when high confidence + within boundary (~50ms)
 * - Verify Path: Gemini verification for medium confidence (~200ms)
 * - LLM Path: Pass to LLM for low confidence or outside boundary (~500ms)
 *
 * Features:
 * - Dynamic threshold adjustment based on tool success rates
 * - Per-category threshold configuration
 * - Automatic fallback handling
 * - Comprehensive metrics
 *
 * @module tools/intelligence/ftis-hybrid-router
 */

import { createLogger } from '../../utils/safe-logger.js';
import { FTISCalibration, getFTISCalibration } from './classifier-calibration.js';
import {
  ClassificationResult,
  FTISClassifierV2,
  getFTISClassifierV2,
} from './tool-classifier.js';
import { FTISDecisionBoundary, getFTISDecisionBoundary } from './classifier-boundary.js';

const log = createLogger({ module: 'ftis-hybrid' });

// ============================================================================
// PATTERN MATCHING LAYER (Pre-ML defense for edge cases)
// ============================================================================
// These patterns catch edge cases that the ML model struggles with.
// Pattern matching runs in <1ms, providing a fast path before ML inference.

interface PatternRule {
  patterns: RegExp[];
  toolGroup: string;
  tools: string[];
  boost: number;
}

const PATTERN_RULES: PatternRule[] = [
  // Weather patterns - "do I need an umbrella" type queries
  {
    patterns: [
      /do I need (a |an )?(jacket|umbrella|coat|sweater|raincoat)/i,
      /will I need (a |an )?(jacket|umbrella|coat|sweater)/i,
      /(will|is) it (rain|snow|sunny|cold|hot|warm)/i,
      /going to (rain|snow|be sunny|be cold|be hot)/i,
      /should I (bring|take|wear|pack) (a |an )?(jacket|umbrella|coat)/i,
    ],
    toolGroup: 'weather',
    tools: ['weather', 'get_weather'],
    boost: 0.95,
  },
  // News patterns - "headlines" queries
  {
    patterns: [
      /give (me )?(the )?headlines/i,
      /show (me )?(the )?headlines/i,
      /^headlines$/i,
      /what are the headlines/i,
      /today'?s? headlines/i,
      /latest headlines/i,
      /news headlines/i,
    ],
    toolGroup: 'news',
    tools: ['news', 'get_news'],
    boost: 0.95,
  },
  // Open intent patterns - AI personal questions (should be conversational)
  {
    patterns: [
      /what'?s? your favorite/i,
      /what is your favorite/i,
      /what do you (like|prefer|enjoy)/i,
      /are you (alive|real|conscious|sentient|a robot|an AI)/i,
      /do you (have )?(feelings|emotions|a soul|dreams|thoughts)/i,
      /do you (think|believe|feel)/i,
      /can you (feel|think|dream)/i,
      /tell me about yourself/i,
    ],
    toolGroup: 'open_intent',
    tools: [], // Empty = conversational, no tool execution
    boost: 0.9,
  },
];

interface PatternMatchResult {
  matched: boolean;
  rule?: PatternRule;
  matchedPattern?: string;
  isOpenIntent?: boolean;
}

function matchPatterns(query: string): PatternMatchResult {
  const normalizedQuery = query.toLowerCase().trim();

  for (const rule of PATTERN_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalizedQuery)) {
        return {
          matched: true,
          rule,
          matchedPattern: pattern.source,
          isOpenIntent: rule.toolGroup === 'open_intent',
        };
      }
    }
  }

  return { matched: false };
}

// ============================================================================
// TYPES
// ============================================================================

export type RoutingTier = 'fast' | 'verify' | 'llm';

export interface RoutingDecision {
  /** Which routing tier was selected */
  tier: RoutingTier;
  /** Classification result from FTIS */
  classification: ClassificationResult;
  /** Reason for the routing decision */
  reason: string;
  /** Final confidence used for decision (may be calibrated/boundary-adjusted) */
  effectiveConfidence: number;
  /** Whether the query is within class boundary */
  withinBoundary: boolean;
  /** Estimated latency for this tier */
  estimatedLatencyMs: number;
  /** Suggested action */
  action: 'execute_tool' | 'verify_with_gemini' | 'pass_to_llm';
}

export interface HybridRouterConfig {
  /** Confidence threshold for fast path (default: 0.75) */
  fastPathThreshold: number;
  /** Confidence threshold for verify path (default: 0.50) */
  verifyPathThreshold: number;
  /** Whether to enable Gemini verification (default: true) */
  enableVerification: boolean;
  /** Whether to use calibrated confidence (default: true) */
  useCalibration: boolean;
  /** Whether to use boundary checking (default: true) */
  useBoundaryChecking: boolean;
  /** Per-category threshold overrides */
  categoryThresholds: Record<string, { fast: number; verify: number }>;
  /** High-reliability tools that can use lower thresholds */
  highReliabilityTools: string[];
  /** High-risk tools that should use higher thresholds */
  highRiskTools: string[];
  /**
   * Categories that should ALWAYS route to LLM path regardless of confidence.
   * These are conversational/emotional support categories where Ferni should
   * respond naturally rather than executing a tool.
   */
  conversationalCategories: string[];
}

export interface RouterMetrics {
  totalRoutings: number;
  fastPathCount: number;
  verifyPathCount: number;
  llmPathCount: number;
  fastPathRate: number;
  verifyPathRate: number;
  llmPathRate: number;
  averageLatencyMs: number;
  categoryDistribution: Map<string, { fast: number; verify: number; llm: number }>;
  /** Pattern matching statistics */
  patternMatchCount: number;
  patternMatchRate: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: HybridRouterConfig = {
  fastPathThreshold: 0.75,
  verifyPathThreshold: 0.5,
  enableVerification: true,
  useCalibration: true,
  useBoundaryChecking: true,
  categoryThresholds: {},
  // Tools that are safe to execute with lower confidence
  highReliabilityTools: [
    'play_music',
    'find_music',
    'music_control',
    'weather',
    'time',
    'date',
    'joke',
  ],
  // Tools that should require higher confidence
  highRiskTools: [
    'handoff_maya',
    'handoff_peter',
    'handoff_alex',
    'handoff_jordan',
    'handoff_nayan',
    'handoff_ferni',
    'bills',
    'budget',
    'call_make',
    'email_send',
    'message_send',
  ],
  // Categories that ALWAYS route to LLM - these are conversational/emotional
  // support topics where Ferni should respond naturally, not execute tools.
  // Even high confidence should not bypass the LLM for these.
  conversationalCategories: [
    // Crisis & Safety
    'crisis_support',
    // Emotional Support
    'grounding',
    'wellness_check',
    'coaching_motivation',
    'grief_support',
    'relationship_advice',
    'breakup_support',
    'self_compassion',
    'imposter_syndrome',
    // General conversation
    'conversation',
    // Recommendations (better as natural conversation)
    'restaurant_rec',
    'movie_rec',
    'book_rec',
    'podcast_rec',
  ],
};

// ============================================================================
// HYBRID ROUTER
// ============================================================================

export class FTISHybridRouter {
  private config: HybridRouterConfig;
  private classifier: FTISClassifierV2;
  private boundary: FTISDecisionBoundary;
  private calibration: FTISCalibration;
  private initialized = false;

  // Metrics
  private metrics: RouterMetrics = {
    totalRoutings: 0,
    fastPathCount: 0,
    verifyPathCount: 0,
    llmPathCount: 0,
    fastPathRate: 0,
    verifyPathRate: 0,
    llmPathRate: 0,
    averageLatencyMs: 0,
    categoryDistribution: new Map(),
    patternMatchCount: 0,
    patternMatchRate: 0,
  };
  private latencySum = 0;

  // Dynamic threshold adjustment based on success rates
  private toolSuccessRates = new Map<string, { successes: number; total: number }>();

  constructor(config: Partial<HybridRouterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.classifier = getFTISClassifierV2();
    this.boundary = getFTISDecisionBoundary();
    this.calibration = getFTISCalibration();
  }

  /**
   * Initialize the router and all its components
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const startTime = Date.now();
    log.info('🚀 Initializing FTIS Hybrid Router...');

    // Initialize all components in parallel
    await Promise.all([
      this.classifier.initialize(),
      this.boundary.initialize(),
      this.calibration.initialize(),
    ]);

    this.initialized = true;
    log.info(
      {
        classifierReady: this.classifier.isReady(),
        boundaryReady: this.boundary.isReady(),
        calibrationReady: this.calibration.isReady(),
        durationMs: Date.now() - startTime,
      },
      '✅ FTIS Hybrid Router initialized'
    );
  }

  /**
   * Check if router is ready
   */
  isReady(): boolean {
    return this.initialized && this.classifier.isReady();
  }

  /**
   * Get threshold for a specific category
   */
  private getThresholds(category: string): { fast: number; verify: number } {
    // Check for category-specific override
    if (this.config.categoryThresholds[category]) {
      return this.config.categoryThresholds[category];
    }

    // Adjust based on tool reliability
    if (this.config.highReliabilityTools.includes(category)) {
      return {
        fast: this.config.fastPathThreshold - 0.1, // Lower threshold = easier fast path
        verify: this.config.verifyPathThreshold - 0.1,
      };
    }

    if (this.config.highRiskTools.includes(category)) {
      return {
        fast: this.config.fastPathThreshold + 0.1, // Higher threshold = harder fast path
        verify: this.config.verifyPathThreshold + 0.1,
      };
    }

    // Dynamic adjustment based on historical success rate
    const successData = this.toolSuccessRates.get(category);
    if (successData && successData.total >= 10) {
      const successRate = successData.successes / successData.total;
      if (successRate > 0.95) {
        // High success rate, can lower thresholds
        return {
          fast: this.config.fastPathThreshold - 0.05,
          verify: this.config.verifyPathThreshold - 0.05,
        };
      } else if (successRate < 0.8) {
        // Low success rate, raise thresholds
        return {
          fast: this.config.fastPathThreshold + 0.1,
          verify: this.config.verifyPathThreshold + 0.1,
        };
      }
    }

    return {
      fast: this.config.fastPathThreshold,
      verify: this.config.verifyPathThreshold,
    };
  }

  /**
   * Main routing method - determines which path to take
   *
   * Uses a two-layer defense:
   * 1. Pattern matching (< 1ms) - catches edge cases the ML struggles with
   * 2. ML classification (~50-200ms) - handles everything else
   */
  async route(query: string): Promise<RoutingDecision> {
    if (!this.initialized) {
      await this.initialize();
    }

    const startTime = Date.now();

    // LAYER 1: Pattern matching (fast path for edge cases)
    const patternMatch = matchPatterns(query);
    if (patternMatch.matched && patternMatch.rule) {
      const rule = patternMatch.rule;

      // Open intent patterns → always LLM (conversational)
      if (patternMatch.isOpenIntent) {
        const latencyMs = Date.now() - startTime;
        log.debug(
          {
            query: query.slice(0, 40),
            matchedPattern: patternMatch.matchedPattern,
            toolGroup: rule.toolGroup,
            latencyMs,
          },
          '🎯 Pattern match: open intent → LLM path'
        );

        // Update metrics for pattern match
        this.updateMetrics('llm', 'open_intent', latencyMs, true);

        return {
          tier: 'llm',
          classification: {
            superCategory: 'open_intent',
            fineCategory: 'open_intent',
            superConfidence: rule.boost,
            fineConfidence: rule.boost,
            combinedConfidence: rule.boost,
            usedFallback: false,
            toolIds: [],
            latencyMs,
            effectiveConfidence: rule.boost,
            isOpenIntent: true,
            openIntentReason: 'pattern_match',
          },
          reason: 'pattern_match_open_intent',
          effectiveConfidence: rule.boost,
          withinBoundary: false,
          estimatedLatencyMs: 1, // Pattern match is <1ms
          action: 'pass_to_llm',
        };
      }

      // Tool patterns → fast path with high confidence
      const latencyMs = Date.now() - startTime;
      log.debug(
        {
          query: query.slice(0, 40),
          matchedPattern: patternMatch.matchedPattern,
          toolGroup: rule.toolGroup,
          tools: rule.tools,
          latencyMs,
        },
        '🎯 Pattern match: tool detected → fast path'
      );

      // Update metrics for pattern match
      this.updateMetrics('fast', rule.toolGroup, latencyMs, true);

      return {
        tier: 'fast',
        classification: {
          superCategory: rule.toolGroup,
          fineCategory: rule.toolGroup,
          superConfidence: rule.boost,
          fineConfidence: rule.boost,
          combinedConfidence: rule.boost,
          usedFallback: false,
          toolIds: rule.tools,
          latencyMs,
          effectiveConfidence: rule.boost,
        },
        reason: 'pattern_match_tool',
        effectiveConfidence: rule.boost,
        withinBoundary: true,
        estimatedLatencyMs: 1, // Pattern match is <1ms
        action: 'execute_tool',
      };
    }

    // LAYER 2: ML classification (for everything else)
    const classification = await this.classifier.classify(query);

    if (!classification) {
      // Classification failed, go to LLM
      return {
        tier: 'llm',
        classification: {
          superCategory: 'unknown',
          fineCategory: 'unknown',
          superConfidence: 0,
          fineConfidence: 0,
          combinedConfidence: 0,
          usedFallback: false,
          toolIds: [],
          latencyMs: Date.now() - startTime,
          effectiveConfidence: 0,
        },
        reason: 'classification_failed',
        effectiveConfidence: 0,
        withinBoundary: false,
        estimatedLatencyMs: 500,
        action: 'pass_to_llm',
      };
    }

    // Determine effective confidence
    let effectiveConfidence = classification.combinedConfidence;
    let withinBoundary = true;
    let reason = '';

    // Apply boundary checking
    if (
      this.config.useBoundaryChecking &&
      classification.boundaryAdjustedConfidence !== undefined
    ) {
      effectiveConfidence = classification.boundaryAdjustedConfidence;
      withinBoundary = !classification.isOpenIntent;

      if (classification.isOpenIntent) {
        reason = `outside_boundary:${classification.openIntentReason}`;
      }
    }

    // Apply calibration if available
    // Note: calibration is already integrated into tool-classifier.ts
    // This is where we could apply additional calibration if needed

    // Get thresholds for this category
    const thresholds = this.getThresholds(classification.fineCategory);

    // Make routing decision
    let tier: RoutingTier;
    let action: 'execute_tool' | 'verify_with_gemini' | 'pass_to_llm';
    let estimatedLatencyMs: number;

    // Check if this is a conversational category that should always go to LLM
    const isConversational = this.config.conversationalCategories.includes(
      classification.fineCategory
    );

    if (isConversational) {
      // Conversational categories ALWAYS go to LLM regardless of confidence
      // These are emotional support, coaching, and advisory topics where
      // Ferni should respond naturally rather than executing a tool
      tier = 'llm';
      action = 'pass_to_llm';
      estimatedLatencyMs = 500;
      reason = 'conversational_category';
    } else if (!withinBoundary) {
      // Outside boundary - always go to LLM
      tier = 'llm';
      action = 'pass_to_llm';
      estimatedLatencyMs = 500;
      reason = reason || 'outside_class_boundary';
    } else if (effectiveConfidence >= thresholds.fast) {
      // Fast path - high confidence, execute directly
      tier = 'fast';
      action = 'execute_tool';
      estimatedLatencyMs = 50;
      reason = 'high_confidence_within_boundary';
    } else if (effectiveConfidence >= thresholds.verify && this.config.enableVerification) {
      // Verify path - medium confidence, verify with Gemini
      tier = 'verify';
      action = 'verify_with_gemini';
      estimatedLatencyMs = 200;
      reason = 'medium_confidence_needs_verification';
    } else {
      // LLM path - low confidence or verification disabled
      tier = 'llm';
      action = 'pass_to_llm';
      estimatedLatencyMs = 500;
      reason = 'low_confidence';
    }

    // Update metrics
    this.updateMetrics(tier, classification.fineCategory, Date.now() - startTime);

    const decision: RoutingDecision = {
      tier,
      classification,
      reason,
      effectiveConfidence,
      withinBoundary,
      estimatedLatencyMs,
      action,
    };

    log.debug(
      {
        query: query.slice(0, 40),
        tier,
        fineCategory: classification.fineCategory,
        originalConf: classification.combinedConfidence.toFixed(3),
        effectiveConf: effectiveConfidence.toFixed(3),
        withinBoundary,
        isConversational,
        reason,
      },
      '🔀 Routing decision'
    );

    return decision;
  }

  /**
   * Record tool execution success/failure for dynamic threshold adjustment
   */
  recordToolOutcome(category: string, success: boolean): void {
    const data = this.toolSuccessRates.get(category) || { successes: 0, total: 0 };
    data.total++;
    if (success) {
      data.successes++;
    }
    this.toolSuccessRates.set(category, data);

    log.debug(
      {
        category,
        success,
        successRate: (data.successes / data.total).toFixed(3),
        total: data.total,
      },
      '📊 Tool outcome recorded'
    );
  }

  /**
   * Update internal metrics
   */
  private updateMetrics(
    tier: RoutingTier,
    category: string,
    latencyMs: number,
    wasPatternMatch = false
  ): void {
    this.metrics.totalRoutings++;
    this.latencySum += latencyMs;
    this.metrics.averageLatencyMs = this.latencySum / this.metrics.totalRoutings;

    // Track pattern matches
    if (wasPatternMatch) {
      this.metrics.patternMatchCount++;
    }
    this.metrics.patternMatchRate = this.metrics.patternMatchCount / this.metrics.totalRoutings;

    switch (tier) {
      case 'fast':
        this.metrics.fastPathCount++;
        break;
      case 'verify':
        this.metrics.verifyPathCount++;
        break;
      case 'llm':
        this.metrics.llmPathCount++;
        break;
    }

    this.metrics.fastPathRate = this.metrics.fastPathCount / this.metrics.totalRoutings;
    this.metrics.verifyPathRate = this.metrics.verifyPathCount / this.metrics.totalRoutings;
    this.metrics.llmPathRate = this.metrics.llmPathCount / this.metrics.totalRoutings;

    // Category distribution
    const catData = this.metrics.categoryDistribution.get(category) || {
      fast: 0,
      verify: 0,
      llm: 0,
    };
    catData[tier]++;
    this.metrics.categoryDistribution.set(category, catData);
  }

  /**
   * Get current metrics
   */
  getMetrics(): RouterMetrics {
    return { ...this.metrics };
  }

  /**
   * Get tool success rates
   */
  getToolSuccessRates(): Map<string, { successRate: number; total: number }> {
    const rates = new Map<string, { successRate: number; total: number }>();
    for (const [category, data] of this.toolSuccessRates) {
      rates.set(category, {
        successRate: data.total > 0 ? data.successes / data.total : 0,
        total: data.total,
      });
    }
    return rates;
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalRoutings: 0,
      fastPathCount: 0,
      verifyPathCount: 0,
      llmPathCount: 0,
      fastPathRate: 0,
      verifyPathRate: 0,
      llmPathRate: 0,
      averageLatencyMs: 0,
      categoryDistribution: new Map(),
      patternMatchCount: 0,
      patternMatchRate: 0,
    };
    this.latencySum = 0;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(updates: Partial<HybridRouterConfig>): void {
    this.config = { ...this.config, ...updates };
    log.info({ updates: Object.keys(updates) }, 'Router config updated');
  }

  /**
   * Get current configuration
   */
  getConfig(): HybridRouterConfig {
    return { ...this.config };
  }
}

// ============================================================================
// SINGLETON
// ============================================================================

let routerInstance: FTISHybridRouter | null = null;

export function getFTISHybridRouter(): FTISHybridRouter {
  if (!routerInstance) {
    routerInstance = new FTISHybridRouter();
  }
  return routerInstance;
}

export async function initializeFTISHybridRouter(
  config?: Partial<HybridRouterConfig>
): Promise<FTISHybridRouter> {
  if (!routerInstance) {
    routerInstance = new FTISHybridRouter(config);
  }
  await routerInstance.initialize();
  return routerInstance;
}

export function resetFTISHybridRouter(): void {
  routerInstance = null;
}

// ============================================================================
// CONVENIENCE FUNCTION
// ============================================================================

/**
 * Quick routing function for use in tool orchestrators
 *
 * @param query - User query
 * @returns Routing decision
 */
export async function routeQuery(query: string): Promise<RoutingDecision> {
  const router = getFTISHybridRouter();
  if (!router.isReady()) {
    await router.initialize();
  }
  return router.route(query);
}
