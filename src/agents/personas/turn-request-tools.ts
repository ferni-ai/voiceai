/**
 * The request's tools, cut to this turn's pick when tool retrieval is on, and
 * the taps on the reply and caption streams (barge-in echo guard, empty-response
 * watchdog). Split out of turn-request.ts, which uses them; no behaviour change.
 */

import type { llm } from '@livekit/agents';
import { TransformStream, type ReadableStream } from 'node:stream/web';

import { staticCoreToolsEnabled } from '../../config/tool-config.js';
import { getBargeInFastPath } from '../multi-agent/barge-in-fastpath.js';
import {
  getTurnToolRetrieval,
  latestUserText,
  toolRetrievalMode,
} from '../../tools/retrieval/turn-tool-retrieval.js';
import { signalToolCallRequested } from '../voice-agent/empty-response-watchdog.js';
import { filterCaptionStream, type Caption } from './caption-filter.js';
import { tapSpokenBursts } from './vocal-bursts.js';

/** For toolsForTurn: this turn's topic tools go into its request (TOOLS_SAME_TURN). */
export { withSameTurnTools } from './same-turn-tools.js';

/** Live tool retrieval waits this long for the pick before falling back (see toolsForTurn). */
const LIVE_PICK_WAIT_MS = 150;

/**
 * Shadow mode only logs what would be picked (nothing awaited); live mode sends
 * core + recent + retrieved tools, waiting at most LIVE_PICK_WAIT_MS for the
 * pick, then using a close pick from this turn, and otherwise sending them all.
 * See tools/retrieval/turn-tool-retrieval.ts.
 */
export async function retrievedTools(
  session: object,
  chatCtx: llm.ChatContext,
  toolCtx: llm.ToolContext
): Promise<llm.ToolContext> {
  // TOOL_CORE_STATIC keeps one set per call: retrieval may only observe.
  const mode = staticCoreToolsEnabled() ? 'shadow' : toolRetrievalMode();
  if (toolRetrievalMode() === 'off') return toolCtx;
  const retrieval = getTurnToolRetrieval(session);
  if (!retrieval) return toolCtx; // the full catalog is only loaded with retrieval
  const text = latestUserText(chatCtx);
  if (!text) {
    // Greetings, check-ins, recovered turns: no words to retrieve for. In
    // live mode the agent may hold the whole catalog; don't send all of it.
    return mode === 'live' ? retrieval.withoutPick(toolCtx) : toolCtx;
  }
  if (mode === 'shadow') {
    retrieval.observe(text, toolCtx);
    return toolCtx;
  }
  return retrieval.selectLive(text, toolCtx, LIVE_PICK_WAIT_MS);
}

/**
 * The captions the app shows from a reply's transcription. Bursts are read first,
 * because the caption filter drops [laughter] (vocal-bursts.ts); the spoken text
 * then feeds the barge-in fast path.
 */
export function spokenCaptions(
  text: ReadableStream<Caption> | AsyncIterable<Caption>,
  session: object
): ReadableStream<Caption> {
  return tapSpokenText(filterCaptionStream(tapSpokenBursts(text, session)), session);
}

/** Captions, reporting what Ferni is saying to the barge-in echo guard (barge-in-fastpath.ts). */
export function tapSpokenText(
  captions: ReadableStream<Caption>,
  session: object
): ReadableStream<Caption> {
  const fastPath = getBargeInFastPath(session);
  if (!fastPath) return captions;
  return captions.pipeThrough(
    new TransformStream<Caption, Caption>({
      transform(chunk, controller) {
        fastPath.onSpokenText(typeof chunk === 'string' ? chunk : chunk.text);
        controller.enqueue(chunk);
      },
    })
  );
}

/**
 * The LLM reply, reporting its first tool call to the empty-response watchdog
 * so a tool lookup isn't mistaken for a turn with no reply (empty-response-watchdog.ts).
 */
export function tapToolCalls<T>(
  reply: ReadableStream<T> | null,
  session: object
): ReadableStream<T> | null {
  if (!reply) return reply;
  let signalled = false;
  return reply.pipeThrough(
    new TransformStream<T, T>({
      transform(chunk, controller) {
        const names = signalled ? [] : toolCallNames(chunk);
        if (names.length) {
          signalled = true;
          signalToolCallRequested(session, names);
        }
        controller.enqueue(chunk);
      },
    })
  );
}

/** LiveKit runs only `function_call` entries (generation.js), so only those count. */
function toolCallNames(chunk: unknown): string[] {
  if (typeof chunk !== 'object') return [];
  const delta = (
    chunk as { delta?: { toolCalls?: Array<{ type?: string; name?: string }> } } | null
  )?.delta;
  return (delta?.toolCalls ?? [])
    .filter((call) => call.type === 'function_call')
    .map((call) => call.name ?? '');
}

/**
 * TOOL_CORE_STATIC: tools findTools added to the agent mid-reply go into the
 * reply's own tool context, which the SDK runs the reply's next step against.
 */
export function withPinnedTools(toolCtx: llm.ToolContext, agent: object | undefined): void {
  const own = (agent as { toolCtx?: llm.ToolContext } | undefined)?.toolCtx?.functionTools;
  if (!own) return;
  const added = Object.entries(own)
    .filter(([name]) => !(name in toolCtx.functionTools))
    .map(([, tool]) => tool);
  if (added.length > 0) toolCtx.updateTools([...toolCtx.tools, ...added]);
}
