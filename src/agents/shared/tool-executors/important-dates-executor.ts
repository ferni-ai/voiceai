/**
 * Important Dates Executor — JSON-workaround route for the important-date
 * voice tools (rememberSpecialDate, listSpecialDates, stopDateReminders).
 *
 * The tools live in the family domain; this executor routes JSON calls to
 * them directly with the caller's identity and persona.
 *
 * @module agents/shared/tool-executors/important-dates-executor
 */

import { createLogger } from '../../../utils/safe-logger.js';
import type { DomainExecutor, ToolExecutionContext } from './types.js';

const log = createLogger({ module: 'ImportantDatesExecutor' });

const HANDLED_TOOLS = ['rememberspecialdate', 'listspecialdates', 'stopdatereminders'] as const;

async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();
  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) return null;

  const tools = await import('../../../tools/domains/family/special-dates-tool.js');
  const toolCtx = {
    userId: ctx.userId ?? 'anonymous',
    ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
    ...(ctx.sessionId ? { sessionId: ctx.sessionId } : {}),
  };
  const retry = "I didn't quite catch that. Could you say it again?";

  if (fnLower === 'rememberspecialdate') {
    const parsed = tools.rememberSpecialDateSchema.safeParse(args);
    if (!parsed.success) {
      log.warn({ issues: parsed.error.issues.length }, 'Bad rememberSpecialDate args');
      return retry;
    }
    return tools.rememberSpecialDate(parsed.data, toolCtx);
  }
  if (fnLower === 'listspecialdates') {
    const parsed = tools.listSpecialDatesSchema.safeParse(args);
    return tools.listSpecialDates(parsed.success ? parsed.data : {}, toolCtx);
  }
  const parsed = tools.stopDateRemindersSchema.safeParse(args);
  if (!parsed.success) return retry;
  return tools.stopDateReminders(parsed.data, toolCtx);
}

export const importantDatesExecutor: DomainExecutor = {
  domain: 'important-dates',
  handles: HANDLED_TOOLS,
  execute,
};
