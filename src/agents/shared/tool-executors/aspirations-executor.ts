/**
 * Aspirations Executor — JSON-workaround route for the dream tools
 * (recordDream, checkDreams). Goals and habits are routed by the
 * productivity and habits executors; all of them read/write the canonical
 * aspirations store (services/aspirations).
 *
 * @module agents/shared/tool-executors/aspirations-executor
 */

import type { DomainExecutor, ToolExecutionContext } from './types.js';

const HANDLED_TOOLS = ['recorddream', 'checkdreams'] as const;

async function execute(
  fn: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext
): Promise<unknown | null> {
  const fnLower = fn.toLowerCase();
  if (!HANDLED_TOOLS.includes(fnLower as (typeof HANDLED_TOOLS)[number])) return null;
  if (!ctx.userId) return "I'd love to hear about it. Tell me more?";
  const voice = await import('../../../services/aspirations/voice.js');
  const vctx = {
    userId: ctx.userId,
    ...(ctx.sessionId ? { conversationId: ctx.sessionId } : {}),
    ...(ctx.personaId ? { personaId: ctx.personaId } : {}),
  };
  if (fnLower === 'checkdreams') return voice.voiceListDreams(vctx);
  const statement = String(args.statement ?? args.dream ?? '').trim();
  if (!statement) return "What's the dream? I'm listening.";
  return voice.voiceRecordDream(vctx, {
    statement,
    ...(typeof args.type === 'string' ? { type: args.type } : {}),
    ...(typeof args.why === 'string' ? { why: args.why } : {}),
  });
}

export const aspirationsExecutor: DomainExecutor = {
  domain: 'aspirations',
  handles: HANDLED_TOOLS,
  execute,
};
