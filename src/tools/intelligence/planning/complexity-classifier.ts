/**
 * Task Complexity Classifier
 *
 * Classifies incoming queries to determine the appropriate handling strategy.
 * Simple tasks go direct, medium tasks use sequence prediction, complex tasks
 * use MCTS planning.
 *
 * @module tools/intelligence/planning/complexity-classifier
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { RouterOutput } from '../router/inference/types.js';

const log = createLogger({ module: 'ftis:complexity-classifier' });

// ============================================================================
// TYPES
// ============================================================================

/**
 * Task complexity levels
 */
export type TaskComplexity = 'simple' | 'medium' | 'complex';

/**
 * Suggested approach based on complexity
 */
export type SuggestedApproach = 'direct' | 'sequence' | 'mcts';

/**
 * Result of complexity classification
 */
export interface ComplexityResult {
  /** Determined complexity level */
  complexity: TaskComplexity;
  /** Confidence in this classification (0-1) */
  confidence: number;
  /** Recommended handling approach */
  suggestedApproach: SuggestedApproach;
  /** Estimated number of tools needed */
  estimatedTools: number;
  /** Reasons for the classification */
  reasons: string[];
}

/**
 * Classification input context
 */
export interface ClassificationInput {
  /** The user's query */
  query: string;
  /** Router model output (if available) */
  routerOutput?: RouterOutput;
  /** Detected intent keywords */
  intentKeywords?: string[];
  /** Previous tool count in session */
  previousToolCount?: number;
  /** Current persona */
  personaId?: string;
}

/**
 * Configuration for the classifier
 */
export interface ClassifierConfig {
  /** Confidence threshold for simple tasks */
  simpleConfidenceThreshold: number;
  /** Keywords that indicate complex tasks */
  complexKeywords: string[];
  /** Keywords that indicate multi-step tasks */
  multiStepKeywords: string[];
  /** Maximum estimated tools for "simple" */
  simpleToolLimit: number;
  /** Maximum estimated tools for "medium" */
  mediumToolLimit: number;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: ClassifierConfig = {
  simpleConfidenceThreshold: 0.85,
  complexKeywords: [
    'plan',
    'planning',
    'help me think through',
    'analyze',
    'compare',
    'decide',
    'strategy',
    'multiple',
    'several',
    'different options',
    'trade-offs',
    'pros and cons',
    'comprehensive',
    'thorough',
    'step by step',
    'walk me through',
    'figure out',
  ],
  multiStepKeywords: [
    'then',
    'after that',
    'and also',
    'first',
    'next',
    'finally',
    'as well as',
    'in addition',
    'plus',
    'both',
    'all of',
  ],
  simpleToolLimit: 1,
  mediumToolLimit: 3,
};

/**
 * FTIS-only mode configuration with lower thresholds.
 *
 * When FTIS_ONLY_MODE=true, we want to handle MORE queries directly
 * since FTIS is the sole tool routing mechanism.
 *
 * Changes from default:
 * - Lower confidence threshold (0.70 vs 0.85) - more direct execution
 * - Higher tool limits (2/5 vs 1/3) - handle multi-tool queries directly
 */
const FTIS_ONLY_CONFIG: ClassifierConfig = {
  simpleConfidenceThreshold: 0.7, // Lower threshold for FTIS-only
  complexKeywords: DEFAULT_CONFIG.complexKeywords,
  multiStepKeywords: DEFAULT_CONFIG.multiStepKeywords,
  simpleToolLimit: 2, // Can handle 2 tools directly
  mediumToolLimit: 5, // Can handle 5 tools via sequence
};

/**
 * Check if FTIS-only mode is enabled.
 */
function isFTISOnlyMode(): boolean {
  return process.env.FTIS_ONLY_MODE === 'true';
}

/**
 * Get the appropriate configuration based on environment.
 */
function getConfig(): ClassifierConfig {
  if (isFTISOnlyMode()) {
    log.info('Using FTIS_ONLY_CONFIG with lower thresholds');
    return FTIS_ONLY_CONFIG;
  }
  return DEFAULT_CONFIG;
}

// ============================================================================
// COMPLEXITY CLASSIFIER
// ============================================================================

export class ComplexityClassifier {
  private config: ClassifierConfig;

  constructor(config: Partial<ClassifierConfig> = {}) {
    // Use FTIS_ONLY_CONFIG when FTIS_ONLY_MODE is enabled
    const baseConfig = getConfig();
    this.config = { ...baseConfig, ...config };

    if (isFTISOnlyMode()) {
      log.info(
        {
          simpleConfidenceThreshold: this.config.simpleConfidenceThreshold,
          simpleToolLimit: this.config.simpleToolLimit,
          mediumToolLimit: this.config.mediumToolLimit,
        },
        '🚀 ComplexityClassifier using FTIS-only configuration'
      );
    }
  }

  // ==========================================================================
  // CLASSIFICATION
  // ==========================================================================

  /**
   * Classify the complexity of a task
   */
  classify(input: ClassificationInput): ComplexityResult {
    const startTime = Date.now();
    const reasons: string[] = [];
    let complexity: TaskComplexity = 'simple';
    let confidence = 0.5;
    let estimatedTools = 1;

    // === Factor 1: Router confidence ===
    if (input.routerOutput) {
      const topConf = input.routerOutput.topConfidence;

      if (topConf >= this.config.simpleConfidenceThreshold) {
        // High confidence = likely simple
        confidence = topConf;
        reasons.push(`High router confidence (${(topConf * 100).toFixed(0)}%)`);
      } else if (topConf >= 0.5) {
        // Medium confidence
        complexity = 'medium';
        confidence = 0.6;
        estimatedTools = 2;
        reasons.push(`Medium router confidence (${(topConf * 100).toFixed(0)}%)`);
      } else {
        // Low confidence = likely complex or unclear
        complexity = 'medium';
        confidence = 0.4;
        estimatedTools = 2;
        reasons.push(`Low router confidence (${(topConf * 100).toFixed(0)}%)`);
      }

      // Check prediction spread
      const { predictions } = input.routerOutput;
      if (predictions.length >= 2) {
        const spread = predictions[0].confidence - predictions[1].confidence;
        if (spread < 0.2) {
          // Close predictions = ambiguous
          if (complexity === 'simple') {
            complexity = 'medium';
          }
          estimatedTools = Math.max(estimatedTools, 2);
          reasons.push('Multiple tools with similar confidence');
        }
      }
    }

    // === Factor 2: Complex keywords ===
    const queryLower = input.query.toLowerCase();

    const complexMatches = this.config.complexKeywords.filter((kw) => queryLower.includes(kw));

    if (complexMatches.length >= 2) {
      complexity = 'complex';
      estimatedTools = Math.max(estimatedTools, 4);
      confidence = 0.7;
      reasons.push(`Complex keywords: ${complexMatches.slice(0, 3).join(', ')}`);
    } else if (complexMatches.length === 1) {
      if (complexity === 'simple') {
        complexity = 'medium';
      }
      estimatedTools = Math.max(estimatedTools, 2);
      reasons.push(`Complex keyword: ${complexMatches[0]}`);
    }

    // === Factor 3: Multi-step keywords ===
    const multiStepMatches = this.config.multiStepKeywords.filter((kw) => queryLower.includes(kw));

    if (multiStepMatches.length >= 2) {
      if (complexity !== 'complex') {
        complexity = 'medium';
      }
      estimatedTools = Math.max(estimatedTools, multiStepMatches.length + 1);
      confidence = Math.max(confidence, 0.65);
      reasons.push(`Multi-step indicators: ${multiStepMatches.slice(0, 3).join(', ')}`);
    } else if (multiStepMatches.length === 1) {
      estimatedTools = Math.max(estimatedTools, 2);
      reasons.push(`Multi-step indicator: ${multiStepMatches[0]}`);
    }

    // === Factor 4: Query length ===
    const wordCount = input.query.split(/\s+/).length;

    if (wordCount > 30) {
      if (complexity === 'simple') {
        complexity = 'medium';
      }
      reasons.push(`Long query (${wordCount} words)`);
    }

    if (wordCount > 50) {
      complexity = 'complex';
      estimatedTools = Math.max(estimatedTools, 3);
      reasons.push('Very long query');
    }

    // === Factor 5: Question count ===
    const questionMarks = (input.query.match(/\?/g) || []).length;
    if (questionMarks >= 2) {
      if (complexity === 'simple') {
        complexity = 'medium';
      }
      estimatedTools = Math.max(estimatedTools, questionMarks);
      reasons.push(`Multiple questions (${questionMarks})`);
    }

    // === Factor 6: Session history ===
    if (input.previousToolCount !== undefined && input.previousToolCount > 3) {
      // User has been using many tools = may need more
      if (complexity === 'simple') {
        complexity = 'medium';
      }
      reasons.push(`Active session (${input.previousToolCount} tools used)`);
    }

    // === Determine suggested approach ===
    let suggestedApproach: SuggestedApproach;

    if (complexity === 'simple' && estimatedTools <= this.config.simpleToolLimit) {
      suggestedApproach = 'direct';
    } else if (complexity === 'complex' || estimatedTools > this.config.mediumToolLimit) {
      suggestedApproach = 'mcts';
    } else {
      suggestedApproach = 'sequence';
    }

    // Clamp estimated tools
    estimatedTools = Math.min(estimatedTools, 10);

    log.debug(
      {
        complexity,
        confidence: confidence.toFixed(2),
        estimatedTools,
        approach: suggestedApproach,
        durationMs: Date.now() - startTime,
      },
      'Task complexity classified'
    );

    return {
      complexity,
      confidence,
      suggestedApproach,
      estimatedTools,
      reasons,
    };
  }

  /**
   * Quick check if task is simple
   */
  isSimple(input: ClassificationInput): boolean {
    const result = this.classify(input);
    return result.complexity === 'simple' && result.confidence >= 0.7;
  }

  /**
   * Quick check if task needs MCTS planning
   */
  needsMCTS(input: ClassificationInput): boolean {
    const result = this.classify(input);
    return result.suggestedApproach === 'mcts';
  }

  // ==========================================================================
  // UTILITIES
  // ==========================================================================

  /**
   * Get complexity from router output alone
   */
  classifyFromRouter(routerOutput: RouterOutput): TaskComplexity {
    if (routerOutput.skipLLM && routerOutput.topConfidence >= 0.9) {
      return 'simple';
    }

    if (routerOutput.topConfidence >= 0.6) {
      return 'medium';
    }

    return 'complex';
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ClassifierConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Get current configuration
   */
  getConfig(): ClassifierConfig {
    return { ...this.config };
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let classifierInstance: ComplexityClassifier | null = null;

export function getComplexityClassifier(): ComplexityClassifier {
  if (!classifierInstance) {
    classifierInstance = new ComplexityClassifier();
  }
  return classifierInstance;
}

export function resetComplexityClassifier(): void {
  classifierInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

/**
 * Quick classification helper
 */
export function classifyComplexity(query: string, routerOutput?: RouterOutput): ComplexityResult {
  const classifier = getComplexityClassifier();
  return classifier.classify({ query, routerOutput });
}
