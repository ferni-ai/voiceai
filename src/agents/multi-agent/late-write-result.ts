/**
 * The live call's side of LATE_WRITE_RESULT_KEPT (tools/registry/write-results.ts): a write
 * tool's result that arrived after the caller's barge-in aborted its reply goes into the
 * agent's chat context, right after its call, the way the SDK records any other result.
 *
 * Only the agent whose context still holds the call gets it, once, placed right after the
 * call: a call that is gone (a handoff swapped the agent, a context rebuild dropped it) or
 * already answered is left alone.
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

/** Put `result` in the context of the agent that still holds its call, unanswered. */
function keepLateWriteResult(opts: unknown, result: unknown): void {
  const run = (opts as { ctx?: unknown } | undefined)?.ctx;
  if (!(run instanceof voice.RunContext) || !recordable(result)) return;
  const call = run.functionCall;
  const agent = currentAgentOf(run.session);
  if (!agent) return;
  const chat = agent.chatCtx.copy();
  const mine = (type: string) => (i: llm.ChatItem) =>
    i.type === type && 'callId' in i && i.callId === call.callId;
  const at = chat.items.findIndex(mine('function_call'));
  const skip =
    at < 0
      ? 'call gone'
      : chat.items.some(mine('function_call_output'))
        ? 'already recorded'
        : null;
  if (skip) {
    log.info({ tool: call.name, callId: call.callId, skip }, 'Late write result not kept');
    return;
  }
  const output = llm.FunctionCallOutput.create({
    name: call.name,
    callId: call.callId,
    output: JSON.stringify(result), // as the SDK writes every result
    isError: false,
    createdAt: chat.items[at]?.createdAt,
  });
  // Right after its call by position: the interrupted reply can share the call's millisecond,
  // and insert() would then put the result after the reply.
  chat.items.splice(at + 1, 0, output);
  agent.updateChatCtx(chat).catch((error: unknown) => {
    log.warn({ tool: call.name, error: String(error) }, 'Late write result not kept');
  });
  log.info({ tool: call.name, callId: call.callId }, 'Late write result kept');
}

/** Install the port for this process's live calls (live-call-behaviors.ts). */
export function installLateWriteResultPort(): void {
  setLateWriteResultPort(keepLateWriteResult);
}
