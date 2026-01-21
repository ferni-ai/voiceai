/**
 * Health Domain Tool Executor
 *
 * Handles all health-related tools: exercise, nutrition, hydration, sleep, energy.
 * Maps FTIS semantic IDs to actual domain tool implementations.
 *
 * @module agents/shared/tool-executors/health-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'HealthExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Domain tool names (lowercase)
  'logexercise',
  'suggestworkout',
  'trackfitnessgoal',
  'coachonnutrition',
  'trackhydration',
  'analyzesleeppattern',
  'suggestsleephygiene',
  'logsymptom',
  'preparefordoctorvisit',
  'remindpreventivecare',
  'assessenergylevel',
  'suggestenergyboost',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // exercise_log category
  'health_exercise',
  'fitness_workout',
  'fitness_log',
  // nutrition category
  'health_nutrition',
  'meal_track',
  'calories_count',
  // water category
  'health_water',
  'water_track',
  // sleep category
  'sleep_track',
  'sleep_analyze',
  'sleep_quality',
] as const;

/** Map FTIS tool IDs to canonical handler names */
const TOOL_ALIASES: Record<string, string> = {
  // exercise mapping
  health_exercise: 'logexercise',
  fitness_workout: 'logexercise',
  fitness_log: 'logexercise',
  // nutrition mapping
  health_nutrition: 'coachonnutrition',
  meal_track: 'coachonnutrition',
  calories_count: 'coachonnutrition',
  // hydration mapping
  health_water: 'trackhydration',
  water_track: 'trackhydration',
  // sleep mapping
  sleep_track: 'analyzesleeppattern',
  sleep_analyze: 'analyzesleeppattern',
  sleep_quality: 'analyzesleeppattern',
};

/**
 * Execute health-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  let fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  // Resolve FTIS aliases to canonical tool names
  if (TOOL_ALIASES[fnLower]) {
    log.debug(
      { original: fnLower, resolved: TOOL_ALIASES[fnLower] },
      '🔀 Resolving FTIS tool alias'
    );
    fnLower = TOOL_ALIASES[fnLower];
  }

  // Dynamically import health tools to avoid circular dependencies
  const healthModule = await import('../../../tools/domains/health/index.js');
  const toolDefinitions = await healthModule.getToolDefinitions();

  // Find the matching tool definition
  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fn, fnLower }, '⚠️ Health tool definition not found');
    return null;
  }

  // Create tool context with required fields
  const toolCtx = {
    userId: ctx.userId || '',
    sessionId: ctx.sessionId,
    agentId: ctx.personaId || 'ferni',
    agentDisplayName: ctx.personaId || 'Ferni',
  };

  // Create and execute the tool
  try {
    const tool = toolDef.create(toolCtx);
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '🏃 Executing health tool');

    // Tools created by llm.tool have an execute method
    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    log.warn({ toolId: toolDef.id }, '⚠️ Health tool has unexpected structure');
    return null;
  } catch (error) {
    log.error({ error: String(error), toolId: toolDef.id }, '❌ Health tool execution failed');
    throw error;
  }
}

/** Health domain executor */
const healthExecutor: DomainExecutor = {
  domain: 'health',
  handles: HANDLED_TOOLS,
  execute,
};

export default healthExecutor;
