/**
 * Registers the end-of-call write for RETURNING_CALLER (returning-caller.ts):
 * an unverified phone caller's first name, if they gave it for themselves on
 * the call, and one filtered line from the call summary's topics. Only a
 * session that started the lookup at call start (an `anon:` SIP caller, see
 * caller-recognition.ts startReturningCaller) has anything to write.
 * Imported for its side effect by gce/job-executor.ts.
 *
 * @module agents/voice-agent-entry/returning-caller-register
 */
import {
  registerAfterCallTask,
  type AfterCallContext,
} from '../../services/session/after-call-tasks.js';
import { recordReturningCall } from '../../services/identity/returning-caller.js';
import { statedName } from '../personas/name-correction.js';

export const RETURNING_CALLER_TASK = 'returning-caller';

/** The last name the caller gave for themselves on this call (name-correction.ts's narrow cues). */
export function nameTheyGave(turns: AfterCallContext['turns']): string | undefined {
  let name: string | undefined;
  let agentLast = '';
  for (const turn of turns) {
    if (turn.role === 'assistant') agentLast = turn.content;
    else if (turn.role === 'user') name = statedName(turn.content, undefined, agentLast) ?? name;
  }
  return name;
}

export async function recordReturningCallAfterCall(ctx: AfterCallContext): Promise<void> {
  const summary = ctx.summary as { mainTopics?: unknown[] } | undefined;
  await recordReturningCall({
    sessionId: ctx.sessionId,
    firstName: nameTheyGave(ctx.turns),
    topics: summary?.mainTopics,
    callerLines: ctx.turns.filter((t) => t.role === 'user').map((t) => t.content),
  });
}

registerAfterCallTask(RETURNING_CALLER_TASK, recordReturningCallAfterCall, { timeoutMs: 10_000 });
// TODO(#1897 fix/minor-caller-care): registerMinorSignal(memoryHeld) from src/utils/minor-care.ts
// once it merges. Until a minor-signal check is registered, recordReturningCall writes nothing.
