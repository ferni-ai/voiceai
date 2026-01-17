/**
 * Reflection Games Domain Tool Executor
 *
 * Handles reflection game tools: startReflectionGame, threeWordDay,
 * valuesCardSort, headlineWriter, and their response handlers.
 *
 * @module agents/shared/tool-executors/reflection-games-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'ReflectionGamesExecutor' });

/** Tools handled by this executor */
const HANDLED_TOOLS = [
  'startreflectiongame',
  'threewordday',
  'threeworddayrespond',
  'valuescardSort',
  'valuescardsortrespond',
  'headlinewriter',
  'headlinewriterrespond',
] as const;

/**
 * Execute reflection-games-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) {
    return null;
  }

  log.info({ fn, userId: ctx.userId }, '🎮 Executing reflection game tool');

  try {
    // Dynamically import the reflection-games domain to get actual tool implementations
    const { getToolDefinitions } = await import('../../../tools/domains/reflection-games/index.js');
    const toolDefs = await getToolDefinitions();

    // Map lowercase function names to tool IDs
    const toolIdMap: Record<string, string> = {
      startreflectiongame: 'startReflectionGame',
      threewordday: 'threeWordDay',
      threeworddayrespond: 'threeWordDayRespond',
      valuescardSort: 'valuesCardSort',
      valuescardsortrespond: 'valuesCardSortRespond',
      headlinewriter: 'headlineWriter',
      headlinewriterrespond: 'headlineWriterRespond',
    };

    const toolId = toolIdMap[fnLower];
    const toolDef = toolDefs.find((t) => t.id === toolId);

    if (!toolDef) {
      log.warn({ fn, toolId }, '⚠️ Tool definition not found');
      return `I'd love to play that game with you, but I'm having trouble setting it up right now.`;
    }

    // Create the tool with context
    const tool = toolDef.create({
      userId: ctx.userId || 'anonymous',
      agentId: ctx.personaId || 'ferni',
      agentDisplayName: ctx.personaId
        ? ctx.personaId.charAt(0).toUpperCase() + ctx.personaId.slice(1)
        : 'Ferni',
      services: {
        has: () => false,
        get: () => {
          throw new Error('Not available');
        },
        getOptional: () => undefined,
      },
    });

    // Execute the tool
    const result = await tool.execute(args);

    log.info({ fn, success: true }, '✅ Reflection game tool executed');

    // Format the result for voice output
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      // Return the message field if present, or the instructions
      if (r.message) return r.message;
      if (r.prompt) return r.prompt;
      if (r.instructions) return r.instructions;
      return JSON.stringify(result);
    }

    return result;
  } catch (err) {
    log.error({ fn, error: String(err) }, '❌ Reflection game tool failed');
    return `I ran into a small hiccup with that game. Want to try again?`;
  }
}

export const reflectionGamesExecutor: DomainExecutor = {
  domain: 'reflection-games',
  handles: HANDLED_TOOLS,
  execute,
};

export default reflectionGamesExecutor;
