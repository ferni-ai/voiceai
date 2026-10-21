/**
 * No dead air between "Let me look." and the answer.
 *
 * The answer after a look-up only starts once the lead-in has been spoken and
 * the tool has returned (LiveKit's pipelineReplyTask waits for the lead-in's
 * playout before it asks the model again), so the model's whole wait for its
 * first word plus the TTS start is silence. On the prod lookups calls of
 * 2026-10-21 that silence ran 1.3-2.5 s (9/9 over 1.2 s), and the two past
 * 2 s lost their answer: the caller spoke first and cut it off. Two moves,
 * both behind LOOKUP_BRIDGE (off by default):
 *
 * 1. The reply after a tool result hedges sooner (afterToolHedgeMs, read by
 *    cartesia-cascade.ts for HedgedLLM): the backup starts at 500 ms instead
 *    of 1.3 s, which cuts the slow-primary tail that lost both answers.
 * 2. If that reply still has no word after LOOKUP_BRIDGE_MS, a short line
 *    ("Okay, got it.") goes ahead of it, the way a person reading a result
 *    off their phone fills the beat. It is spoken while the model finishes,
 *    and it lands in the answer's own words, so the answer follows on from it.
 *    Later requests leave it out (withoutPastBridges), as with the lead-ins.
 *
 * findBusiness is a look-up too: under the flag it gets a lead-in (live, the
 * taco turn sat silent 3.9 s before the first word).
 *
 * @module agents/personas/lookup-bridge
 */

import type { llm } from '@livekit/agents';
import { ReadableStream } from 'node:stream/web';
import { lookupBridgeOn, msFromEnv } from '../model-provider/after-tool-hedge.js';
import { callerTurn } from '../model-provider/fast-lane.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'LookupBridge' });

type Env = Record<string, string | undefined>;
type Chunk = llm.ChatChunk | string | object;

/** Neutral about what the result says: "found it" would clash with "no game last night". */
export const BRIDGES = ['Okay, got it.', 'Alright.', 'Got it.', 'Okay.'] as const;

/** Look-ups the lead-in list missed, given one under the flag. */
export const EXTRA_LOOKUP_TOOLS: ReadonlySet<string> = new Set(['findBusiness']);

export { afterToolHedgeMs, lookupBridgeOn } from '../model-provider/after-tool-hedge.js';

/** How long the reply after a tool result may say nothing before the bridge. */
export function bridgeAfterMs(env: Env = process.env): number {
  return msFromEnv(env.LOOKUP_BRIDGE_MS, 700);
}

interface ItemView {
  type?: string;
  role?: string;
  name?: string;
  textContent?: string;
}

/** The tool whose result this reply answers, or undefined when it answers the caller. */
function answeredTool(request: llm.ChatContext): string | undefined {
  const items = ((request as unknown as { items?: ItemView[] }).items ?? []) as ItemView[];
  if (callerTurn(items as never) !== null) return undefined;
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.type === 'function_call_output') return items[i].name ?? '';
  }
  return undefined;
}

const nextBridge = new WeakMap<object, number>();

function pickBridge(session: object): string {
  const n = nextBridge.get(session) ?? 0;
  nextBridge.set(session, n + 1);
  return BRIDGES[n % BRIDGES.length];
}

/** Text or a tool call: the reply has started (an empty delta has not). */
function commits(chunk: Chunk): boolean {
  if (typeof chunk === 'string') return chunk.trim().length > 0;
  const delta = (chunk as llm.ChatChunk | undefined)?.delta;
  return Boolean(delta?.content?.trim() || delta?.toolCalls?.length);
}

/**
 * Wrap the reply after a tool result: a bridge line goes ahead of it when the
 * model has said nothing after LOOKUP_BRIDGE_MS. Any other reply passes through.
 */
export function withLookupBridge(
  input: ReadableStream<Chunk>,
  request: llm.ChatContext,
  session: object,
  env: Env = process.env
): ReadableStream<Chunk> {
  if (!lookupBridgeOn(env)) return input;
  const tool = answeredTool(request);
  if (tool === undefined) return input;
  const waitMs = bridgeAfterMs(env);
  const startedAt = Date.now();
  const reader = input.getReader();
  let timer: NodeJS.Timeout | undefined;
  let decided = false;
  let open = true;
  const report = (bridged: boolean) =>
    log.info({ tool, firstWordMs: Date.now() - startedAt, bridged, waitMs }, 'AFTER_TOOL_REPLY');
  return new ReadableStream<Chunk>({
    async start(controller) {
      timer = setTimeout(() => {
        if (decided || !open) return;
        decided = true;
        controller.enqueue(`${pickBridge(session)} `);
        report(true);
      }, waitMs);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!decided && commits(value)) {
            decided = true;
            clearTimeout(timer);
            report(false);
          }
          controller.enqueue(value);
        }
        open = false;
        controller.close();
      } catch (error) {
        open = false;
        controller.error(error);
      } finally {
        clearTimeout(timer);
      }
    },
    cancel(reason) {
      open = false;
      clearTimeout(timer);
      return reader.cancel(reason);
    },
  });
}

/** The words left once a bridge opening an answer after a tool result is cut, or undefined. */
export function afterBridge(text: string, afterToolResult: boolean): string | undefined {
  if (!afterToolResult) return undefined;
  const t = text.trim();
  const line = BRIDGES.find((l) => t === l || t.startsWith(`${l} `));
  return line === undefined ? undefined : t.slice(line.length).trim();
}
