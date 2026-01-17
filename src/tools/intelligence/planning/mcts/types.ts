/**
 * MCTS Planner Types
 *
 * Type definitions for Monte Carlo Tree Search planning.
 *
 * @module tools/intelligence/planning/mcts/types
 */

// ============================================================================
// CORE TYPES
// ============================================================================

/**
 * A node in the MCTS tree
 */
export interface MCTSNode {
  /** Unique node ID */
  id: string;
  /** Tool at this node (null for root) */
  toolId: string | null;
  /** Parent node ID */
  parentId: string | null;
  /** Child node IDs */
  children: string[];
  /** Number of times visited */
  visits: number;
  /** Total value accumulated */
  totalValue: number;
  /** Average value (totalValue / visits) */
  averageValue: number;
  /** UCB1 score for selection */
  ucb1Score: number;
  /** Depth in tree */
  depth: number;
  /** State at this node */
  state: PlanState;
}

/**
 * State of the plan at a given node
 */
export interface PlanState {
  /** Tools executed so far */
  executedTools: string[];
  /** Remaining user intent to satisfy */
  remainingIntent: string;
  /** Accumulated context from tool outputs */
  context: Record<string, unknown>;
  /** Current confidence */
  confidence: number;
}

/**
 * A complete plan (path through tree)
 */
export interface MCTSPlan {
  /** Ordered list of tools */
  tools: string[];
  /** Total value of this plan */
  value: number;
  /** Number of simulations that led to this plan */
  simulationCount: number;
  /** Confidence in this plan */
  confidence: number;
  /** Execution strategy */
  strategy: 'sequential' | 'parallel' | 'mixed';
  /** Estimated duration in ms */
  estimatedDurationMs: number;
}

/**
 * Result of an MCTS simulation
 */
export interface SimulationResult {
  /** Path taken in this simulation */
  path: string[];
  /** Final value achieved */
  value: number;
  /** Was this a terminal state */
  terminal: boolean;
  /** Reason for termination */
  terminationReason?: 'goal_achieved' | 'max_depth' | 'no_options' | 'timeout';
}

/**
 * Configuration for the MCTS planner
 */
export interface MCTSConfig {
  /** Maximum simulations to run */
  maxSimulations: number;
  /** Maximum depth of tree */
  maxDepth: number;
  /** UCB1 exploration constant */
  explorationConstant: number;
  /** Timeout for planning in ms */
  timeoutMs: number;
  /** Minimum visits before expansion */
  minVisitsForExpansion: number;
  /** Discount factor for future rewards */
  discountFactor: number;
  /** Use value estimator (vs random rollout) */
  useValueEstimator: boolean;
}

/**
 * Planning context
 */
export interface PlanningContext {
  /** Original user query */
  query: string;
  /** Detected intent */
  intent?: string;
  /** Active persona */
  personaId: string;
  /** Available tools */
  availableTools: string[];
  /** User ID for personalization */
  userId?: string;
  /** Previous tools in session */
  sessionTools?: string[];
}

// ============================================================================
// VALUE ESTIMATION TYPES
// ============================================================================

/**
 * Input to value estimator
 */
export interface ValueEstimatorInput {
  /** Current plan state */
  state: PlanState;
  /** Candidate next tool */
  nextTool: string;
  /** Planning context */
  context: PlanningContext;
}

/**
 * Output from value estimator
 */
export interface ValueEstimatorOutput {
  /** Estimated value (0-1) */
  value: number;
  /** Confidence in estimate */
  confidence: number;
  /** Features used for estimation */
  features?: Record<string, number>;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

export const DEFAULT_MCTS_CONFIG: MCTSConfig = {
  maxSimulations: 100,
  maxDepth: 5,
  explorationConstant: 1.41, // sqrt(2)
  timeoutMs: 500,
  minVisitsForExpansion: 2,
  discountFactor: 0.95,
  useValueEstimator: true,
};
