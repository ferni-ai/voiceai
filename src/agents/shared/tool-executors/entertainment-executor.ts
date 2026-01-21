/**
 * Entertainment Domain Tool Executor
 *
 * Handles games and humor tools: games, jokes, fun facts, mini stories.
 * Maps FTIS semantic IDs to actual domain tool implementations.
 *
 * @module agents/shared/tool-executors/entertainment-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'EntertainmentExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  // Games domain tools
  'startgame',
  'submitgameanswer',
  'getgamehint',
  'skipgameround',
  'endgame',
  'getgamestatus',
  'getgamehistory',
  'suggestgame',
  'starttextgame',
  'maketextgamemove',
  'gettextgameboard',
  'endtextgame',
  // Humor tools (from simple-utilities)
  'telljoke',
  'getfunfact',
  'tellministory',
  // ===========================================
  // FTIS V3 Semantic Tool IDs (from category_to_tools.json)
  // ===========================================
  // game category
  'game_trivia',
  'game_story',
  'game_wordplay',
  // joke category
  'humor_joke',
  'humor_funfact',
] as const;

/** Map FTIS tool IDs to canonical handler names */
const TOOL_ALIASES: Record<string, string> = {
  // game mapping
  game_trivia: 'startgame',
  game_story: 'starttextgame',
  game_wordplay: 'starttextgame',
  // joke mapping
  humor_joke: 'telljoke',
  humor_funfact: 'getfunfact',
};

/**
 * Execute entertainment-related tools
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

  // Handle humor tools separately (they're in simple-utilities, not games domain)
  if (['telljoke', 'getfunfact', 'tellministory'].includes(fnLower)) {
    return executeHumorTool(fnLower, args, ctx);
  }

  // Handle game tools
  return executeGameTool(fnLower, args, ctx);
}

/**
 * Execute humor tools from simple-utilities
 */
async function executeHumorTool(
  fnLower: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const humorModule = await import('../../../tools/domains/simple-utilities/humor-tools.js');
  const toolDefinitions = humorModule.humorToolDefinitions;

  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fnLower }, '⚠️ Humor tool definition not found');
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
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '🎭 Executing humor tool');

    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    return null;
  } catch (error) {
    log.error({ error: String(error), toolId: toolDef.id }, '❌ Humor tool execution failed');
    throw error;
  }
}

/**
 * Execute game tools from games domain
 */
async function executeGameTool(
  fnLower: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const gamesModule = await import('../../../tools/domains/games/index.js');
  const toolDefinitions = await gamesModule.getToolDefinitions();

  const toolDef = toolDefinitions.find((t: { id: string }) => t.id.toLowerCase() === fnLower);

  if (!toolDef) {
    log.warn({ fnLower }, '⚠️ Game tool definition not found');
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
    log.info({ toolId: toolDef.id, userId: ctx.userId }, '🎮 Executing game tool');

    if (tool && typeof tool === 'object' && 'execute' in tool) {
      const llmTool = tool as {
        execute: (args: Record<string, unknown>, options?: unknown) => Promise<unknown>;
      };
      const result = await llmTool.execute(args, { ctx: toolCtx });
      return result;
    }

    return null;
  } catch (error) {
    log.error({ error: String(error), toolId: toolDef.id }, '❌ Game tool execution failed');
    throw error;
  }
}

/** Entertainment domain executor */
const entertainmentExecutor: DomainExecutor = {
  domain: 'entertainment',
  handles: HANDLED_TOOLS,
  execute,
};

export default entertainmentExecutor;
