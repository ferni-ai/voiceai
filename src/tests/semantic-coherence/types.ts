/**
 * Semantic Coherence Testing Types
 *
 * These types define the structure for LLM-driven semantic validation
 * of our codebase naming, organization, and architectural alignment.
 */

/**
 * A semantic probe - a question we ask the LLM about our codebase
 */
export interface SemanticProbe {
  id: string;
  category: ProbeCategory;
  question: string;
  context: ProbeContext;
  expectedAlignment: string;
  weight: number; // 1-10, importance of this probe
}

export type ProbeCategory =
  | 'domain-naming'
  | 'semantic-memory'
  | 'integration-wiring'
  | 'architectural-philosophy'
  | 'cross-domain-coherence';

export interface ProbeContext {
  /** The module/file/service being evaluated */
  target: string;
  /** Related code snippets or structure */
  codeContext?: string;
  /** Actual behavior description */
  actualBehavior?: string;
  /** Related modules for cross-reference */
  relatedModules?: string[];
  /** Our core philosophy principles */
  philosophyPrinciples?: string[];
}

/**
 * LLM evaluation result for a single probe
 */
export interface ProbeResult {
  probeId: string;
  coherenceScore: number; // 0-100
  passed: boolean;
  reasoning: string;
  suggestions: string[];
  alignmentGaps: AlignmentGap[];
}

export interface AlignmentGap {
  type: 'naming' | 'organization' | 'philosophy' | 'wiring';
  severity: 'low' | 'medium' | 'high' | 'critical';
  current: string;
  suggested: string;
  rationale: string;
}

/**
 * Domain metadata extracted from the codebase
 */
export interface DomainMetadata {
  name: string;
  path: string;
  type: 'service' | 'context-builder' | 'tool' | 'persona' | 'memory';
  exports: ExportMetadata[];
  dependencies: string[];
  description?: string;
  category?: string;
}

export interface ExportMetadata {
  name: string;
  type: 'function' | 'class' | 'const' | 'type' | 'interface';
  isDefault: boolean;
  jsdoc?: string;
}

/**
 * Test suite configuration
 */
export interface SemanticTestConfig {
  /** LLM model to use for evaluation */
  model: 'gemini-2.0-flash' | 'gpt-4o' | 'claude-sonnet';
  /** Minimum coherence score to pass (0-100) */
  passingThreshold: number;
  /** Categories to include */
  categories: ProbeCategory[];
  /** Generate suggestions for improvements */
  generateSuggestions: boolean;
  /** Verbose output */
  verbose: boolean;
}

/**
 * Full test suite result
 */
export interface SemanticTestSuiteResult {
  timestamp: string;
  config: SemanticTestConfig;
  overallScore: number;
  categoryScores: Record<ProbeCategory, number>;
  results: ProbeResult[];
  criticalGaps: AlignmentGap[];
  summary: string;
  recommendations: string[];
}

/**
 * Philosophy principles we test against
 */
export const CORE_PRINCIPLES = {
  HUMAN_FIRST: 'Making AI feel human, not robotic',
  BETTER_THAN_HUMAN: 'Capabilities no human friend could consistently provide',
  RELATIONSHIP_OVER_TRANSACTION: 'Serve relationships, not just tasks',
  GENTLE_GROWTH: 'Support growth without judgment',
  SEMANTIC_CLARITY: 'Names should imply function intuitively',
  DISCOVERABLE_ARCHITECTURE: 'An intelligent newcomer should navigate easily',
} as const;

export type CorePrinciple = keyof typeof CORE_PRINCIPLES;

/**
 * Naming convention rules
 */
export const NAMING_CONVENTIONS = {
  SERVICES: {
    pattern: '{domain}-{capability}.ts',
    examples: ['commitment-keeper.ts', 'emotional-first-aid.ts'],
    antiPatterns: ['utils.ts', 'helper.ts', 'misc.ts'],
  },
  CONTEXT_BUILDERS: {
    pattern: '{aspect}.ts or {persona}-{aspect}.ts',
    examples: ['emotional.ts', 'peter-research-insights.ts'],
    antiPatterns: ['builder1.ts', 'context.ts'],
  },
  PERSONAS: {
    pattern: '{first-name}/ or {first-name}-{last-name}/',
    examples: ['ferni/', 'peter-john/'],
    antiPatterns: ['persona1/', 'agent/'],
  },
} as const;
