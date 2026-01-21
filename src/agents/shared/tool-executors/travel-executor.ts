/**
 * Travel Domain Tool Executor
 *
 * Handles travel and transportation tools: flights, hotels, trips, rides, commute.
 * Maps FTIS semantic IDs to actual domain tool implementations.
 *
 * @module agents/shared/tool-executors/travel-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'TravelExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Travel domain tools
  'searchflights',
  'searchhotels',
  'plantrip',
  'getsavedtrips',
  'gettripsuggestions',
  'getflightprice',
  // Transportation domain tools
  'requestride',
  'compareprices',
  'getridestatus',
  'cancelride',
  'getcommutetime',
  'scheduleride',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // travel_plan category
  'travel_plan',
  'travel_suggestions',
  // flights category
  'travel_flights',
  'flights_search',
  // directions category
  'traffic_directions',
  'navigation',
] as const;

/** Map FTIS tool IDs to canonical handler names */
const TOOL_ALIASES: Record<string, string> = {
  // travel planning mapping
  travel_plan: 'plantrip',
  travel_suggestions: 'gettripsuggestions',
  // flights mapping
  travel_flights: 'searchflights',
  flights_search: 'searchflights',
  // directions mapping
  traffic_directions: 'getcommutetime',
  navigation: 'getcommutetime',
};

/**
 * Execute travel-related tools
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

  // Travel domain tools
  const travelTools = [
    'searchflights',
    'searchhotels',
    'plantrip',
    'getsavedtrips',
    'gettripsuggestions',
    'getflightprice',
  ];

  // Transportation domain tools
  const transportTools = [
    'requestride',
    'compareprices',
    'getridestatus',
    'cancelride',
    'getcommutetime',
    'scheduleride',
  ];

  if (travelTools.includes(fnLower)) {
    return executeTravelTool(fnLower, args, ctx);
  }

  if (transportTools.includes(fnLower)) {
    return executeTransportTool(fnLower, args, ctx);
  }

  return null;
}

/**
 * Execute travel tools from travel domain
 */
async function executeTravelTool(
  fnLower: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const travelModule = await import('../../../tools/domains/travel/index.js');
  const toolDefinitions = await travelModule.getToolDefinitions();

  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fnLower }, '⚠️ Travel tool definition not found');
    return null;
  }

  const toolCtx = {
    userId: ctx.userId || '',
    sessionId: ctx.sessionId,
    agentId: ctx.personaId || 'ferni',
    agentDisplayName: ctx.personaId || 'Ferni',
  };

  try {
    const tool = toolDef.create(toolCtx);
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '✈️ Executing travel tool');

    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    return null;
  } catch (error) {
    log.error({ error: String(error), toolId: toolDef.id }, '❌ Travel tool execution failed');
    throw error;
  }
}

/**
 * Execute transportation tools from transportation domain
 */
async function executeTransportTool(
  fnLower: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const transportModule = await import('../../../tools/domains/transportation/index.js');
  const toolDefinitions = await transportModule.getToolDefinitions();

  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fnLower }, '⚠️ Transportation tool definition not found');
    return null;
  }

  const toolCtx = {
    userId: ctx.userId || '',
    sessionId: ctx.sessionId,
    agentId: ctx.personaId || 'ferni',
    agentDisplayName: ctx.personaId || 'Ferni',
  };

  try {
    const tool = toolDef.create(toolCtx);
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '🚗 Executing transportation tool');

    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    return null;
  } catch (error) {
    log.error(
      { error: String(error), toolId: toolDef.id },
      '❌ Transportation tool execution failed'
    );
    throw error;
  }
}

/** Travel domain executor */
const travelExecutor: DomainExecutor = {
  domain: 'travel',
  handles: HANDLED_TOOLS,
  execute,
};

export default travelExecutor;
