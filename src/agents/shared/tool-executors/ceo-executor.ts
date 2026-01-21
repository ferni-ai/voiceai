/**
 * CEO Coaching Domain Tool Executor
 *
 * Handles CEO coaching tools: briefings, tracking, planning, focus sessions.
 * Maps FTIS semantic IDs to actual domain tool implementations.
 *
 * @module agents/shared/tool-executors/ceo-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'CEOExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Domain tool names (lowercase)
  // Briefing tools
  'getmorningbriefing',
  'weeklyreview',
  // Tracking tools
  'trackwin',
  'trackenergy',
  'loggratitude',
  'quickjournal',
  // Planning tools
  'managepriorities',
  'trackblocker',
  'trackdecision',
  'captureidea',
  // Focus tools
  'focussession',
  'dailyreflection',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // briefing category
  'ceo_briefing',
  'briefing_morning',
  // priorities category
  'ceo_priorities',
  'priorities_set',
] as const;

/** Map FTIS tool IDs to canonical handler names */
const TOOL_ALIASES: Record<string, string> = {
  // briefing mapping
  ceo_briefing: 'getmorningbriefing',
  briefing_morning: 'getmorningbriefing',
  // priorities mapping
  ceo_priorities: 'managepriorities',
  priorities_set: 'managepriorities',
};

/**
 * Execute CEO coaching tools
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

  // Dynamically import CEO coaching tools to avoid circular dependencies
  const ceoModule = await import('../../../tools/domains/ceo-coaching/index.js');
  const toolDefinitions = await ceoModule.getToolDefinitions();

  // Find the matching tool definition
  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fn, fnLower }, '⚠️ CEO coaching tool definition not found');
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
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '👔 Executing CEO coaching tool');

    // Tools created by llm.tool have an execute method
    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    log.warn({ toolId: toolDef.id }, '⚠️ CEO coaching tool has unexpected structure');
    return null;
  } catch (error) {
    log.error(
      { error: String(error), toolId: toolDef.id },
      '❌ CEO coaching tool execution failed'
    );
    throw error;
  }
}

/** CEO coaching domain executor */
const ceoExecutor: DomainExecutor = {
  domain: 'ceo-coaching',
  handles: HANDLED_TOOLS,
  execute,
};

export default ceoExecutor;
