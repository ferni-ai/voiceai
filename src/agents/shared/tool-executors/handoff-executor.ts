/**
 * Handoff Domain Tool Executor
 *
 * Handles all persona handoff tools: handoffToMaya, handoffToAlex, handoffToPeter,
 * handoffToJordan, handoffToNayan, handoffToFerni.
 *
 * Routes to the proper handoff executor which emits voiceSwitch events
 * for voice/LLM switching.
 *
 * @module agents/shared/tool-executors/handoff-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'HandoffExecutor' });

/** All persona handoff tool names (lowercase) */
const HANDLED_TOOLS = [
  // Direct persona handoffs
  'handofftomaya',
  'handofftoalex',
  'handofftopeter',
  'handofftojordan',
  'handofftonayan',
  'handofftoferni',
  // Semantic IDs from FTIS router (underscore style)
  'handoff_maya',
  'handoff_alex',
  'handoff_peter',
  'handoff_jordan',
  'handoff_nayan',
  'handoff_ferni',
  // Transfer variants
  'transfertomaya',
  'transfertoalex',
  'transfertopeter',
  'transfertojordan',
  'transfertonayan',
  'transfertoferni',
  // Generic handoff
  'handoffto',
  'transferto',
  // Legacy aliases
  'handoff',
  'transfer',
  'switchto',
  'connectto',
  'switchtomaya',
  'switchtoalex',
  'switchtopeter',
  'switchtojordan',
  'switchtonayan',
  'switchtoferni',
] as const;

/** Persona name mapping for normalized lookup */
const PERSONA_ALIASES: Record<string, string> = {
  maya: 'maya',
  alex: 'alex',
  peter: 'peter',
  jordan: 'jordan',
  nayan: 'nayan',
  ferni: 'ferni',
  // Common variations
  'maya-santos': 'maya',
  'alex-chen': 'alex',
  'peter-john': 'peter',
  'peter-lynch': 'peter', // Legacy alias
  'jordan-brooks': 'jordan',
  'nayan-patel': 'nayan',
};

/**
 * Extract target persona from tool name or args
 */
function extractTarget(fn: string, args: Record<string, unknown>): string {
  const fnLower = fn.toLowerCase();

  // Check semantic IDs from FTIS router: handoff_maya -> maya
  const semanticMatch = fnLower.match(/^handoff_(\w+)$/);
  if (semanticMatch) {
    const persona = semanticMatch[1];
    return PERSONA_ALIASES[persona] || persona;
  }

  // Check direct handoff tools: handofftomaya -> maya
  for (const persona of Object.keys(PERSONA_ALIASES)) {
    if (fnLower.endsWith(persona)) {
      return PERSONA_ALIASES[persona] || persona;
    }
  }

  // Check args for target
  const targetArg = (args.target as string) || (args.persona as string) || (args.to as string);
  if (targetArg) {
    const normalized = targetArg.toLowerCase();
    return PERSONA_ALIASES[normalized] || normalized;
  }

  // Fallback: try to extract from tool name pattern
  // handoffto{persona} or transferto{persona}
  const match = fnLower.match(/(?:handoff|transfer|switch|connect)to(\w+)/);
  if (match) {
    const extracted = match[1];
    return PERSONA_ALIASES[extracted] || extracted;
  }

  return 'ferni'; // Default to Ferni (coordinator)
}

/**
 * Execute handoff-related tools
 */
async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();

  // Check if this is a handoff tool
  const isHandoffTool =
    HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number]) ||
    fnLower.startsWith('handoffto') ||
    fnLower.startsWith('transferto') ||
    fnLower.startsWith('handoff_'); // Semantic IDs from FTIS router

  if (!isHandoffTool) {
    return null;
  }

  const target = extractTarget(fn, args);
  const reason = (args.reason as string) || 'User requested handoff';

  log.info(
    { target, reason, sessionId: ctx.sessionId },
    '🤝 Handoff requested via modular executor'
  );

  // If a custom handler is provided, use it (for specific integrations)
  if (ctx.onHandoff) {
    await ctx.onHandoff(target, reason);
    return { success: true, target, reason, action: 'handoff' };
  }

  // Execute handoff via the proper executor
  // This emits the voiceSwitch event which triggers voice/LLM switch
  try {
    const { executeHandoff } = await import('../../../tools/handoff/executor.js');

    log.info(
      { target, reason, sessionId: ctx.sessionId },
      '🎭 Executing handoff via executor (will emit voiceSwitch event)'
    );

    const result = await executeHandoff(target, reason, {
      sessionId: ctx.sessionId,
    });

    if (result.success) {
      log.info(
        { target, greeting: result.greeting?.slice(0, 50), sessionId: ctx.sessionId },
        '✅ Handoff executed successfully'
      );
      return {
        success: true,
        target,
        reason,
        action: 'handoff',
        greeting: result.greeting,
        // Tell sanitizer not to speak - greeting already spoken by handler
        handoffComplete: true,
      };
    } else {
      log.warn({ target, error: result.error, sessionId: ctx.sessionId }, '⚠️ Handoff failed');
      return {
        success: false,
        target,
        reason,
        action: 'handoff',
        error: result.error,
      };
    }
  } catch (err) {
    log.error(
      { target, reason, error: String(err), sessionId: ctx.sessionId },
      '❌ Failed to execute handoff'
    );
    // Return a speakable error message
    return {
      success: false,
      target,
      reason,
      error: `Couldn't connect you with ${target}. Let me try again in a moment.`,
    };
  }
}

/**
 * Handoff domain executor
 */
export const handoffExecutor: DomainExecutor = {
  domain: 'handoff',
  handles: HANDLED_TOOLS,
  execute,
};
