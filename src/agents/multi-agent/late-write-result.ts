/**
 * The live call's side of LATE_WRITE_RESULT_KEPT (tools/registry/write-results.ts): a write
 * tool's result that arrived after the caller's barge-in aborted its reply goes into the
 * agent's chat context, right after its call, the way the SDK records any other result.
 *
 * Only the agent whose context still holds the call gets it, once: a call that is gone (a
 * handoff swapped the agent, a context rebuild dropped it) or already answered is left alone.
 * updateChatCtx assigns the context before its first await, so nothing the SDK adds meanwhile
 * is lost. Logs ids and the tool name only, never the result.
 *
 * @module agents/multi-agent/late-write-result
 */
import { llm, voice } from '@livekit/agents';
import { setLateWriteResultPort } from '../../tools/registry/index.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LateWriteResult' });

/** The slice of the SDK Agent this needs. */
type ResultAgent = Pick<voice.Agent, 'chatCtx' | 'updateChatCtx'>;

function currentAgentOf(session: voice.AgentSession): ResultAgent | undefined {
  try {
    return session.currentAgent;
  } catch {
    return undefined; // the session isn't running
  }
}

/** A result the SDK would record as a success (createToolOutput, voice/generation.js). */
const recordable = (result: unknown): boolean =>
  result !== undefined &&
  result !== null &&
  !(result instanceof Error) &&
  !(typeof result === 'object' && 'agent' in result); // a handoff

/** Why `result` isn't kept, or null once it is in the agent's context. */
export function keepLateWriteResult(opts: unknown, result: unknown): string | null {
  const run = (opts as { ctx?: unknown } | undefined)?.ctx;
  if (!(run instanceof voice.RunContext)) return 'not a live run';
  if (!recordable(result)) return 'nothing to record';
  const call = run.functionCall;
  const agent = currentAgentOf(run.session);
  if (!agent) return 'no agent';
  const chat = agent.chatCtx.copy();
  const has = (type: string): boolean =>
    chat.items.some((i) => i.type === type && 'callId' in i && i.callId === call.callId);
  const skip = !has('function_call')
    ? 'call gone'
    : has('function_call_output')
      ? 'already recorded'
      : null;
  if (skip) {
    log.info({ tool: call.name, callId: call.callId, skip }, 'Late write result not kept');
    return skip;
  }
  const output = llm.FunctionCallOutput.create({
    name: call.name,
    callId: call.callId,
    output: JSON.stringify(result), // as the SDK writes every result
    isError: false,
    createdAt: call.createdAt, // goes in right after its call
  });
  chat.insert(output);
  agent.updateChatCtx(chat).catch((error: unknown) => {
    log.warn({ tool: call.name, error: String(error) }, 'Late write result not kept');
  });
  log.info({ tool: call.name, callId: call.callId }, 'Late write result kept');
  return null;
}

/** Install the port for this process's live calls (live-call-behaviors.ts). */
export function installLateWriteResultPort(): void {
  setLateWriteResultPort((opts, result) => void keepLateWriteResult(opts, result));
}
