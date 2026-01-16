/**
 * MCTS Planner
 *
 * Monte Carlo Tree Search for complex multi-tool planning.
 * Used for complex tasks that require exploring multiple tool sequences.
 *
 * Algorithm:
 * 1. Selection: Use UCB1 to select promising nodes
 * 2. Expansion: Add child nodes for unexplored tools
 * 3. Simulation: Use value estimator to evaluate state
 * 4. Backpropagation: Update values up the tree
 *
 * @module tools/intelligence/planning/mcts/planner
 */

import { createLogger } from '../../../../utils/safe-logger.js';
import { getTransitionMatrix } from '../../transitions/transition-matrix.js';
import { getValueEstimator, type ValueEstimator } from './value-estimator.js';
import type {
  MCTSNode,
  MCTSPlan,
  MCTSConfig,
  PlanState,
  PlanningContext,
  SimulationResult,
  DEFAULT_MCTS_CONFIG,
} from './types.js';

const log = createLogger({ module: 'ftis:mcts-planner' });

// ============================================================================
// MCTS PLANNER
// ============================================================================

export class MCTSPlanner {
  private config: MCTSConfig;
  private valueEstimator: ValueEstimator;

  // Tree storage
  private nodes = new Map<string, MCTSNode>();
  private rootId: string | null = null;

  // Statistics
  private simulationCount = 0;
  private startTime = 0;

  constructor(config: Partial<MCTSConfig> = {}) {
    this.config = {
      maxSimulations: 100,
      maxDepth: 5,
      explorationConstant: 1.41,
      timeoutMs: 500,
      minVisitsForExpansion: 2,
      discountFactor: 0.95,
      useValueEstimator: true,
      ...config,
    };
    this.valueEstimator = getValueEstimator();
  }

  // ==========================================================================
  // MAIN API
  // ==========================================================================

  /**
   * Plan a tool sequence for the given context
   */
  plan(context: PlanningContext): MCTSPlan {
    this.startTime = Date.now();
    this.simulationCount = 0;
    this.nodes.clear();

    // Initialize root node
    this.rootId = this.createNode(null, null, {
      executedTools: [],
      remainingIntent: context.query,
      context: {},
      confidence: 1.0,
    });

    // Run MCTS iterations
    while (
      this.simulationCount < this.config.maxSimulations &&
      Date.now() - this.startTime < this.config.timeoutMs
    ) {
      this.runIteration(context);
      this.simulationCount++;
    }

    // Extract best plan
    const plan = this.extractBestPlan(context);

    log.info(
      {
        simulations: this.simulationCount,
        durationMs: Date.now() - this.startTime,
        planLength: plan.tools.length,
        planValue: plan.value.toFixed(2),
      },
      'MCTS planning complete'
    );

    return plan;
  }

  // ==========================================================================
  // MCTS CORE
  // ==========================================================================

  /**
   * Run one MCTS iteration (select, expand, simulate, backpropagate)
   */
  private runIteration(context: PlanningContext): void {
    // 1. Selection - traverse to promising leaf
    const selectedId = this.select(this.rootId!);
    const selectedNode = this.nodes.get(selectedId)!;

    // 2. Expansion - add children if not fully expanded
    let nodeToSimulate = selectedNode;
    if (
      selectedNode.visits >= this.config.minVisitsForExpansion &&
      selectedNode.depth < this.config.maxDepth
    ) {
      const childId = this.expand(selectedId, context);
      if (childId) {
        nodeToSimulate = this.nodes.get(childId)!;
      }
    }

    // 3. Simulation - estimate value
    const value = this.simulate(nodeToSimulate, context);

    // 4. Backpropagation - update ancestors
    this.backpropagate(nodeToSimulate.id, value);
  }

  /**
   * Select: Use UCB1 to traverse to a promising leaf
   */
  private select(nodeId: string): string {
    let currentId = nodeId;

    while (true) {
      const node = this.nodes.get(currentId)!;

      // If no children or at max depth, return this node
      if (node.children.length === 0 || node.depth >= this.config.maxDepth) {
        return currentId;
      }

      // Select child with highest UCB1 score
      let bestChildId: string | null = null;
      let bestScore = -Infinity;

      for (const childId of node.children) {
        const child = this.nodes.get(childId)!;
        const score = this.computeUCB1(child, node.visits);

        if (score > bestScore) {
          bestScore = score;
          bestChildId = childId;
        }
      }

      if (!bestChildId) {
        return currentId;
      }

      currentId = bestChildId;
    }
  }

  /**
   * Expand: Add a child node for an unexplored tool
   */
  private expand(nodeId: string, context: PlanningContext): string | null {
    const node = this.nodes.get(nodeId)!;

    // Get candidate tools
    const candidates = this.getCandidateTools(node, context);

    // Filter out already-expanded children
    const existingTools = new Set(
      node.children.map((cid) => this.nodes.get(cid)?.toolId).filter(Boolean)
    );
    const unexplored = candidates.filter((t) => !existingTools.has(t));

    if (unexplored.length === 0) {
      return null;
    }

    // Select best unexplored tool using value estimator
    let bestTool = unexplored[0];
    let bestValue = 0;

    if (this.config.useValueEstimator) {
      for (const tool of unexplored) {
        const estimate = this.valueEstimator.estimate({
          state: node.state,
          nextTool: tool,
          context,
        });
        if (estimate.value > bestValue) {
          bestValue = estimate.value;
          bestTool = tool;
        }
      }
    }

    // Create child node
    const childState: PlanState = {
      executedTools: [...node.state.executedTools, bestTool],
      remainingIntent: this.updateRemainingIntent(node.state.remainingIntent, bestTool),
      context: { ...node.state.context },
      confidence: node.state.confidence * 0.95, // Slight decay
    };

    const childId = this.createNode(nodeId, bestTool, childState);
    node.children.push(childId);

    return childId;
  }

  /**
   * Simulate: Estimate value of this state
   */
  private simulate(node: MCTSNode, context: PlanningContext): number {
    if (this.config.useValueEstimator) {
      // Use value estimator for fast estimation
      return this.valueEstimator.estimateState(node.state, context);
    }

    // Random rollout (slower but doesn't require estimator)
    return this.randomRollout(node, context);
  }

  /**
   * Backpropagate: Update values up the tree
   */
  private backpropagate(nodeId: string, value: number): void {
    let currentId: string | null = nodeId;
    let discountedValue = value;

    while (currentId) {
      const currentNode: MCTSNode | undefined = this.nodes.get(currentId);
      if (!currentNode) break;

      currentNode.visits++;
      currentNode.totalValue += discountedValue;
      currentNode.averageValue = currentNode.totalValue / currentNode.visits;

      currentId = currentNode.parentId;
      discountedValue *= this.config.discountFactor;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /**
   * Create a new node
   */
  private createNode(parentId: string | null, toolId: string | null, state: PlanState): string {
    const id = `node_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const parentNode = parentId ? this.nodes.get(parentId) : null;

    const node: MCTSNode = {
      id,
      toolId,
      parentId,
      children: [],
      visits: 0,
      totalValue: 0,
      averageValue: 0,
      ucb1Score: Infinity, // Unexplored nodes have infinite UCB1
      depth: parentNode ? parentNode.depth + 1 : 0,
      state,
    };

    this.nodes.set(id, node);
    return id;
  }

  /**
   * Compute UCB1 score for a node
   */
  private computeUCB1(node: MCTSNode, parentVisits: number): number {
    if (node.visits === 0) {
      return Infinity;
    }

    const exploitation = node.averageValue;
    const exploration =
      this.config.explorationConstant * Math.sqrt(Math.log(parentVisits) / node.visits);

    return exploitation + exploration;
  }

  /**
   * Get candidate tools for expansion
   */
  private getCandidateTools(node: MCTSNode, context: PlanningContext): string[] {
    const candidates: string[] = [];
    const executedSet = new Set(node.state.executedTools);

    // Add tools from transition matrix
    if (node.toolId) {
      const matrix = getTransitionMatrix();
      const transitions = matrix.getPredictions(node.toolId, undefined, 10);

      for (const t of transitions) {
        if (!executedSet.has(t.toolId) && context.availableTools.includes(t.toolId)) {
          candidates.push(t.toolId);
        }
      }
    }

    // Add available tools not yet explored
    for (const tool of context.availableTools) {
      if (!executedSet.has(tool) && !candidates.includes(tool)) {
        candidates.push(tool);
      }
    }

    // Limit candidates for efficiency
    return candidates.slice(0, 15);
  }

  /**
   * Update remaining intent after using a tool
   */
  private updateRemainingIntent(intent: string, tool: string): string {
    // Simple heuristic: reduce intent by removing matched keywords
    const toolParts = tool.toLowerCase().split('_');
    let remaining = intent.toLowerCase();

    for (const part of toolParts) {
      if (part.length >= 3) {
        remaining = remaining.replace(new RegExp(part, 'gi'), '').trim();
      }
    }

    return remaining;
  }

  /**
   * Random rollout for simulation (when value estimator not available)
   */
  private randomRollout(node: MCTSNode, context: PlanningContext): number {
    let state = { ...node.state };
    let { depth } = node;

    // Random steps until max depth
    while (depth < this.config.maxDepth) {
      const candidates = context.availableTools.filter((t) => !state.executedTools.includes(t));

      if (candidates.length === 0) break;

      // Pick random tool
      const tool = candidates[Math.floor(Math.random() * candidates.length)];
      state = {
        ...state,
        executedTools: [...state.executedTools, tool],
        confidence: state.confidence * 0.9,
      };
      depth++;
    }

    // Simple value based on coverage
    return state.executedTools.length / this.config.maxDepth;
  }

  /**
   * Extract best plan from tree
   */
  private extractBestPlan(context: PlanningContext): MCTSPlan {
    const tools: string[] = [];
    let currentId = this.rootId!;

    // Follow best children
    while (true) {
      const node = this.nodes.get(currentId)!;

      if (node.children.length === 0) {
        break;
      }

      // Find best child
      let bestChildId: string | null = null;
      let bestValue = -Infinity;

      for (const childId of node.children) {
        const child = this.nodes.get(childId)!;
        if (child.visits > 0 && child.averageValue > bestValue) {
          bestValue = child.averageValue;
          bestChildId = childId;
        }
      }

      if (!bestChildId) break;

      const bestChild = this.nodes.get(bestChildId)!;
      if (bestChild.toolId) {
        tools.push(bestChild.toolId);
      }
      currentId = bestChildId;
    }

    // Calculate plan metrics
    const finalNode = this.nodes.get(currentId)!;
    const value = finalNode.averageValue;
    const confidence = tools.length > 0 ? value * (finalNode.visits / this.simulationCount) : 0;

    return {
      tools,
      value,
      simulationCount: this.simulationCount,
      confidence,
      strategy: tools.length <= 2 ? 'sequential' : 'mixed',
      estimatedDurationMs: tools.length * 300,
    };
  }

  // ==========================================================================
  // STATISTICS
  // ==========================================================================

  /**
   * Get planner statistics
   */
  getStats(): {
    nodeCount: number;
    simulationCount: number;
    maxDepthReached: number;
    avgBranchingFactor: number;
  } {
    let maxDepth = 0;
    let totalBranches = 0;
    let nodesWithChildren = 0;

    for (const node of this.nodes.values()) {
      maxDepth = Math.max(maxDepth, node.depth);
      if (node.children.length > 0) {
        totalBranches += node.children.length;
        nodesWithChildren++;
      }
    }

    return {
      nodeCount: this.nodes.size,
      simulationCount: this.simulationCount,
      maxDepthReached: maxDepth,
      avgBranchingFactor: nodesWithChildren > 0 ? totalBranches / nodesWithChildren : 0,
    };
  }

  /**
   * Clear the tree
   */
  clear(): void {
    this.nodes.clear();
    this.rootId = null;
    this.simulationCount = 0;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let plannerInstance: MCTSPlanner | null = null;

export function getMCTSPlanner(): MCTSPlanner {
  if (!plannerInstance) {
    plannerInstance = new MCTSPlanner();
  }
  return plannerInstance;
}

export function resetMCTSPlanner(): void {
  if (plannerInstance) {
    plannerInstance.clear();
  }
  plannerInstance = null;
}

// ============================================================================
// CONVENIENCE EXPORT
// ============================================================================

/**
 * Quick planning helper
 */
export function planTools(
  query: string,
  availableTools: string[],
  options?: {
    personaId?: string;
    userId?: string;
    maxSimulations?: number;
    timeoutMs?: number;
  }
): MCTSPlan {
  const planner =
    options?.maxSimulations || options?.timeoutMs
      ? new MCTSPlanner({
          maxSimulations: options.maxSimulations,
          timeoutMs: options.timeoutMs,
        })
      : getMCTSPlanner();

  return planner.plan({
    query,
    availableTools,
    personaId: options?.personaId || 'ferni',
    userId: options?.userId,
  });
}
