/**
 * Goal Planner
 *
 * Decomposes complex user requests into multi-step tool execution plans.
 * Inspired by TaskMatrix.AI and AutoGPT-style planning.
 *
 * For complex requests like "Help me prepare for my trip to Paris next week":
 * 1. Decomposes into sub-goals (weather, calendar, packing, etc.)
 * 2. Orders them by dependency
 * 3. Executes with state passing between steps
 *
 * @module semantic-router/advanced/intelligent/goal-planner
 */

import { createLogger } from '../../../../utils/safe-logger.js';

const log = createLogger({ module: 'goal-planner' });

// ============================================================================
// TYPES
// ============================================================================

export interface GoalPlannerConfig {
  /** Maximum steps in a plan */
  maxPlanSteps: number;
  /** Maximum time for planning phase */
  planningTimeoutMs: number;
  /** Enable parallel execution where possible */
  enableParallelExecution: boolean;
  /** Confidence threshold to auto-execute plan */
  autoExecuteThreshold: number;
  /** Model for planning */
  model: 'gemini-2.0-flash' | 'gpt-4o-mini' | 'gpt-4o';
}

export interface PlanStep {
  /** Unique step ID */
  id: string;
  /** Tool to execute */
  toolId: string;
  /** Human-readable description */
  description: string;
  /** Arguments (may reference previous step outputs) */
  args: Record<string, unknown>;
  /** Steps this depends on (must complete first) */
  dependsOn: string[];
  /** Expected output key for subsequent steps */
  outputKey?: string;
  /** Priority (lower = execute first among peers) */
  priority: number;
  /** Estimated execution time */
  estimatedMs?: number;
  /** Is this step optional? */
  optional: boolean;
}

export interface ExecutionPlan {
  /** Original user goal */
  goal: string;
  /** Decomposed sub-goals */
  subGoals: string[];
  /** Ordered execution steps */
  steps: PlanStep[];
  /** Plan confidence (0-1) */
  confidence: number;
  /** Human-readable plan summary */
  summary: string;
  /** Total estimated time */
  estimatedTotalMs: number;
  /** Execution strategy */
  strategy: 'sequential' | 'parallel' | 'mixed';
  /** Created timestamp */
  createdAt: Date;
}

export interface PlanExecutionState {
  /** Current plan */
  plan: ExecutionPlan;
  /** Completed step IDs */
  completedSteps: string[];
  /** Failed step IDs */
  failedSteps: string[];
  /** Currently executing step IDs */
  executingSteps: string[];
  /** Results from completed steps */
  stepResults: Map<string, unknown>;
  /** Overall status */
  status: 'planning' | 'executing' | 'completed' | 'failed' | 'paused';
  /** Start time */
  startTime: Date;
  /** Total execution time so far */
  elapsedMs: number;
  /** Error if failed */
  error?: string;
}

export interface ToolDefinition {
  id: string;
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; required: boolean; description: string }>;
  category?: string;
}

// ============================================================================
// DEFAULT CONFIG
// ============================================================================

const DEFAULT_CONFIG: GoalPlannerConfig = {
  maxPlanSteps: 8,
  planningTimeoutMs: 5000,
  enableParallelExecution: true,
  autoExecuteThreshold: 0.8,
  model: 'gemini-2.0-flash',
};

// ============================================================================
// GOAL PLANNER
// ============================================================================

export class GoalPlanner {
  private config: GoalPlannerConfig;
  private llmProvider: GoalPlannerLLMProvider | null = null;
  private activePlans = new Map<string, PlanExecutionState>();

  constructor(config: Partial<GoalPlannerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Set the LLM provider for planning
   */
  setLLMProvider(provider: GoalPlannerLLMProvider): void {
    this.llmProvider = provider;
    log.info({ model: this.config.model }, 'Goal planner LLM provider configured');
  }

  /**
   * Check if a request needs multi-step planning
   */
  needsPlanning(userInput: string): { needs: boolean; reason: string; confidence: number } {
    const lower = userInput.toLowerCase();

    // Patterns that suggest complex goals
    const complexPatterns: Array<{ pattern: RegExp; reason: string; confidence: number }> = [
      {
        pattern: /help\s+me\s+(?:with|to|prepare|plan|organize)/i,
        reason: 'Help request suggests multi-step assistance',
        confidence: 0.8,
      },
      {
        pattern: /(?:and|then|also|after\s+that)\s+/i,
        reason: 'Multiple actions connected',
        confidence: 0.75,
      },
      {
        pattern: /(?:prepare|plan|organize|set\s+up)\s+(?:for|my)/i,
        reason: 'Preparation/planning request',
        confidence: 0.85,
      },
      {
        pattern: /everything\s+(?:for|about|related)/i,
        reason: 'Comprehensive request',
        confidence: 0.9,
      },
      {
        pattern: /(?:trip|travel|vacation|move|event|party|meeting)/i,
        reason: 'Life event usually needs multiple tools',
        confidence: 0.7,
      },
      {
        pattern: /(?:morning|evening|daily|weekly)\s+(?:routine|ritual|schedule)/i,
        reason: 'Routine setup needs multiple steps',
        confidence: 0.8,
      },
    ];

    for (const { pattern, reason, confidence } of complexPatterns) {
      if (pattern.test(lower)) {
        return { needs: true, reason, confidence };
      }
    }

    // Check for multiple entities
    const entityCount = this.countEntities(userInput);
    if (entityCount >= 3) {
      return {
        needs: true,
        reason: `Multiple entities detected (${entityCount})`,
        confidence: 0.7,
      };
    }

    return { needs: false, reason: 'Simple single-tool request', confidence: 0.9 };
  }

  /**
   * Count entities in input (rough heuristic)
   */
  private countEntities(input: string): number {
    let count = 0;

    // Dates/times
    if (/(?:tomorrow|next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i.test(input)) count++;
    if (/\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm)/i.test(input)) count++;

    // Locations
    if (/(?:to|in|at|from)\s+[A-Z][a-z]+/.test(input)) count++;

    // People
    if (/(?:with|for|call|text)\s+[A-Z][a-z]+/.test(input)) count++;

    // Actions (verbs at start)
    const actions = input.match(/(?:^|\.\s+)(?:check|get|find|look|set|play|send|call|book|reserve)/gi);
    if (actions) count += actions.length;

    return count;
  }

  /**
   * Create an execution plan for a complex goal
   */
  async createPlan(
    userGoal: string,
    availableTools: ToolDefinition[],
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      userId?: string;
      personaId?: string;
      constraints?: string[];
    }
  ): Promise<ExecutionPlan> {
    const startTime = performance.now();

    // Quick heuristic plan if no LLM
    if (!this.llmProvider) {
      return this.heuristicPlan(userGoal, availableTools);
    }

    // Build planning prompt
    const prompt = this.buildPlanningPrompt(userGoal, availableTools, context);

    try {
      const response = await Promise.race([
        this.llmProvider.generate(prompt),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Planning timeout')), this.config.planningTimeoutMs);
        }),
      ]);

      const plan = this.parsePlanResponse(response, userGoal, availableTools);

      log.info(
        {
          goal: userGoal.slice(0, 50),
          stepCount: plan.steps.length,
          confidence: plan.confidence,
          durationMs: performance.now() - startTime,
        },
        'Plan created'
      );

      return plan;
    } catch (error) {
      log.error({ error }, 'Plan creation failed, using heuristic');
      return this.heuristicPlan(userGoal, availableTools);
    }
  }

  /**
   * Build the planning prompt
   */
  private buildPlanningPrompt(
    userGoal: string,
    tools: ToolDefinition[],
    context?: {
      conversationHistory?: Array<{ role: string; content: string }>;
      userId?: string;
      personaId?: string;
      constraints?: string[];
    }
  ): string {
    const toolList = tools
      .slice(0, 20)
      .map((t) => `- ${t.id}: ${t.description} (params: ${t.parameters.map((p) => p.name).join(', ')})`)
      .join('\n');

    const constraintsStr = context?.constraints?.length
      ? `Constraints: ${context.constraints.join(', ')}`
      : '';

    return `You are a goal-decomposition planner. Break down complex user goals into executable steps.

**User Goal:** "${userGoal}"

${constraintsStr}

**Available Tools:**
${toolList}

**Instructions:**
1. Identify sub-goals (what needs to happen to fulfill the main goal?)
2. Map sub-goals to tools
3. Determine dependencies (what must complete before what?)
4. Order steps by priority and dependency

**Output Format (JSON):**
{
  "subGoals": ["Sub-goal 1", "Sub-goal 2", ...],
  "steps": [
    {
      "id": "step1",
      "toolId": "tool_id",
      "description": "What this step does",
      "args": {"param": "value"},
      "dependsOn": [],
      "priority": 1,
      "optional": false
    },
    {
      "id": "step2", 
      "toolId": "another_tool",
      "description": "What this step does",
      "args": {"param": "{{step1.output}}"},
      "dependsOn": ["step1"],
      "priority": 2,
      "optional": false
    }
  ],
  "summary": "One-line summary of the plan",
  "confidence": 0.0-1.0
}

**Guidelines:**
- Use "{{stepId.output}}" to reference previous step outputs
- Mark nice-to-have steps as "optional": true
- Max ${this.config.maxPlanSteps} steps
- Group independent steps (same priority) for parallel execution
- If goal is too vague, include a clarification step

Respond ONLY with valid JSON:`;
  }

  /**
   * Parse LLM plan response
   */
  private parsePlanResponse(
    response: string,
    userGoal: string,
    availableTools: ToolDefinition[]
  ): ExecutionPlan {
    try {
      // Extract JSON
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, response];
      const jsonStr = jsonMatch[1] || response;
      const parsed = JSON.parse(jsonStr.trim());

      // Validate and fix steps
      const validSteps: PlanStep[] = [];
      const toolIds = new Set(availableTools.map((t) => t.id));

      for (const step of parsed.steps || []) {
        if (toolIds.has(step.toolId)) {
          validSteps.push({
            id: step.id || `step_${validSteps.length + 1}`,
            toolId: step.toolId,
            description: step.description || `Execute ${step.toolId}`,
            args: step.args || {},
            dependsOn: Array.isArray(step.dependsOn) ? step.dependsOn : [],
            priority: step.priority || validSteps.length + 1,
            optional: Boolean(step.optional),
          });
        }
      }

      // Determine execution strategy
      const hasDependencies = validSteps.some((s) => s.dependsOn.length > 0);
      const hasParallelizable = this.findParallelGroups(validSteps).some((g) => g.length > 1);

      let strategy: ExecutionPlan['strategy'] = 'sequential';
      if (this.config.enableParallelExecution && hasParallelizable && hasDependencies) {
        strategy = 'mixed';
      } else if (this.config.enableParallelExecution && hasParallelizable) {
        strategy = 'parallel';
      }

      return {
        goal: userGoal,
        subGoals: parsed.subGoals || [],
        steps: validSteps.slice(0, this.config.maxPlanSteps),
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        summary: parsed.summary || `Execute ${validSteps.length} steps`,
        estimatedTotalMs: validSteps.length * 500, // Rough estimate
        strategy,
        createdAt: new Date(),
      };
    } catch (error) {
      log.warn({ error }, 'Failed to parse plan response');
      return this.heuristicPlan(userGoal, availableTools);
    }
  }

  /**
   * Create a heuristic plan without LLM
   */
  private heuristicPlan(userGoal: string, availableTools: ToolDefinition[]): ExecutionPlan {
    const lower = userGoal.toLowerCase();
    const steps: PlanStep[] = [];

    // Keyword-based tool matching
    const toolMatches = availableTools.filter((tool) => {
      const toolWords = tool.description.toLowerCase().split(/\s+/);
      const goalWords = lower.split(/\s+/);
      return toolWords.some((tw) => goalWords.includes(tw));
    });

    for (let i = 0; i < Math.min(toolMatches.length, 3); i++) {
      steps.push({
        id: `step_${i + 1}`,
        toolId: toolMatches[i].id,
        description: `Use ${toolMatches[i].name}`,
        args: {},
        dependsOn: i > 0 ? [`step_${i}`] : [],
        priority: i + 1,
        optional: false,
      });
    }

    return {
      goal: userGoal,
      subGoals: steps.map((s) => s.description),
      steps,
      confidence: steps.length > 0 ? 0.5 : 0.2,
      summary: steps.length > 0 ? `Execute ${steps.length} matched tools` : 'No matching tools found',
      estimatedTotalMs: steps.length * 500,
      strategy: 'sequential',
      createdAt: new Date(),
    };
  }

  /**
   * Find groups of steps that can run in parallel
   */
  private findParallelGroups(steps: PlanStep[]): PlanStep[][] {
    const groups: PlanStep[][] = [];
    const completed = new Set<string>();

    while (completed.size < steps.length) {
      // Find all steps whose dependencies are satisfied
      const ready = steps.filter(
        (s) => !completed.has(s.id) && s.dependsOn.every((d) => completed.has(d))
      );

      if (ready.length === 0) break; // Circular dependency or done

      groups.push(ready);
      ready.forEach((s) => completed.add(s.id));
    }

    return groups;
  }

  /**
   * Execute a plan
   */
  async executePlan(
    plan: ExecutionPlan,
    toolExecutor: ToolExecutor,
    options?: {
      onStepComplete?: (stepId: string, result: unknown) => void;
      onStepError?: (stepId: string, error: Error) => void;
      userId?: string;
    }
  ): Promise<PlanExecutionState> {
    const state: PlanExecutionState = {
      plan,
      completedSteps: [],
      failedSteps: [],
      executingSteps: [],
      stepResults: new Map(),
      status: 'executing',
      startTime: new Date(),
      elapsedMs: 0,
    };

    // Store active plan
    const planId = `plan_${Date.now()}`;
    this.activePlans.set(planId, state);

    try {
      // Execute by parallel groups
      const groups = this.findParallelGroups(plan.steps);

      for (const group of groups) {
        // Execute group in parallel (or sequential if disabled)
        if (this.config.enableParallelExecution && group.length > 1) {
          await Promise.all(
            group.map((step) => this.executeStep(step, state, toolExecutor, options))
          );
        } else {
          for (const step of group) {
            await this.executeStep(step, state, toolExecutor, options);
          }
        }

        // Check for critical failures
        const criticalFailed = group.filter(
          (s) => !s.optional && state.failedSteps.includes(s.id)
        );
        if (criticalFailed.length > 0) {
          state.status = 'failed';
          state.error = `Critical step failed: ${criticalFailed[0].id}`;
          break;
        }
      }

      if (state.status === 'executing') {
        state.status = 'completed';
      }
    } finally {
      state.elapsedMs = Date.now() - state.startTime.getTime();
      this.activePlans.delete(planId);
    }

    log.info(
      {
        goal: plan.goal.slice(0, 50),
        status: state.status,
        completed: state.completedSteps.length,
        failed: state.failedSteps.length,
        elapsedMs: state.elapsedMs,
      },
      'Plan execution finished'
    );

    return state;
  }

  /**
   * Execute a single step
   */
  private async executeStep(
    step: PlanStep,
    state: PlanExecutionState,
    executor: ToolExecutor,
    options?: {
      onStepComplete?: (stepId: string, result: unknown) => void;
      onStepError?: (stepId: string, error: Error) => void;
    }
  ): Promise<void> {
    state.executingSteps.push(step.id);

    try {
      // Resolve argument references
      const resolvedArgs = this.resolveArgs(step.args, state.stepResults);

      // Execute tool
      const result = await executor.execute(step.toolId, resolvedArgs);

      state.completedSteps.push(step.id);
      state.stepResults.set(step.id, result);
      options?.onStepComplete?.(step.id, result);

      log.debug({ stepId: step.id, toolId: step.toolId }, 'Step completed');
    } catch (error) {
      state.failedSteps.push(step.id);
      options?.onStepError?.(step.id, error instanceof Error ? error : new Error(String(error)));

      log.warn({ stepId: step.id, error }, 'Step failed');
    } finally {
      state.executingSteps = state.executingSteps.filter((s) => s !== step.id);
    }
  }

  /**
   * Resolve argument references like {{step1.output}}
   */
  private resolveArgs(
    args: Record<string, unknown>,
    results: Map<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        // Check for {{stepId.output}} pattern
        const match = value.match(/\{\{(\w+)\.output\}\}/);
        if (match) {
          const stepId = match[1];
          resolved[key] = results.get(stepId) ?? value;
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Get active plans
   */
  getActivePlans(): Map<string, PlanExecutionState> {
    return this.activePlans;
  }
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface GoalPlannerLLMProvider {
  generate(prompt: string): Promise<string>;
}

export interface ToolExecutor {
  execute(toolId: string, args: Record<string, unknown>): Promise<unknown>;
}

// ============================================================================
// SINGLETON
// ============================================================================

let goalPlannerInstance: GoalPlanner | null = null;

export function getGoalPlanner(): GoalPlanner {
  if (!goalPlannerInstance) {
    goalPlannerInstance = new GoalPlanner();
  }
  return goalPlannerInstance;
}

export function initializeGoalPlanner(
  config?: Partial<GoalPlannerConfig>,
  provider?: GoalPlannerLLMProvider
): GoalPlanner {
  goalPlannerInstance = new GoalPlanner(config);

  if (provider) {
    goalPlannerInstance.setLLMProvider(provider);
  }

  return goalPlannerInstance;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Generate a human-readable plan description
 */
export function describePlan(plan: ExecutionPlan): string {
  const stepDescriptions = plan.steps
    .map((s, i) => `${i + 1}. ${s.description}${s.optional ? ' (optional)' : ''}`)
    .join('\n');

  return `**Plan: ${plan.summary}**

Steps:
${stepDescriptions}

Strategy: ${plan.strategy} execution
Confidence: ${(plan.confidence * 100).toFixed(0)}%
Estimated time: ${Math.round(plan.estimatedTotalMs / 1000)}s`;
}

/**
 * Check if a plan should auto-execute
 */
export function shouldAutoExecute(plan: ExecutionPlan, threshold = 0.8): boolean {
  return plan.confidence >= threshold && plan.steps.every((s) => !s.optional || s.dependsOn.length === 0);
}

