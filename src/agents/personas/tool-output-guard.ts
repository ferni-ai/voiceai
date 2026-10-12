/**
 * No tool result reaches the model empty.
 *
 * Dev call 2026-10-12 (session-AJ_FhDLDpE3gTFu): Seth asked Peter to play
 * music. playMusic started "Late Night" by Antonius B & Krynoze and queued four
 * more, then returned '' (its ambient replies included an empty one), so the
 * model read `""` as the result and said "I don't actually have a way to spin
 * tunes" while the music started. In the 7 days before, 18 tool results
 * reached the model as `""`: rememberAboutUser 11, playMusic 7.
 *
 * Every LLM request of a persona agent passes through here (ferni-agent.ts
 * llmNode): an empty, `""` or `null` result becomes "<tool> ran; no details
 * returned.", logged once per call as TOOL_EMPTY_RESULT. A handoff's empty
 * result is the switch to the teammate, not a missing answer, so it stays.
 * TOOL_EMPTY_RESULT_GUARD=off turns the guard off.
 *
 * @module agents/personas/tool-output-guard
 */

import type { llm } from '@livekit/agents';

import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'ToolOutputGuard' });

/** What the model reads in place of an empty result. */
export function emptyToolOutputText(name: string): string {
  return `${name || 'The tool'} ran; no details returned.`;
}

export function toolOutputGuardEnabled(env: Record<string, string | undefined> = process.env) {
  return flagOn('TOOL_EMPTY_RESULT_GUARD', env);
}

/** Tool outputs reach the model as JSON strings: `""` is an empty string result. */
function isEmptyOutput(output: unknown): boolean {
  if (output === undefined || output === null) return true;
  if (typeof output !== 'string') return false;
  const text = output.trim();
  return text === '' || text === '""' || text === 'null' || text === 'undefined';
}

/** A handoff returns no output by design: the teammate's agent takes over. */
const HANDOFF = /^(handoff|transfer)/i;

/** Calls already logged, so llmNode running again for one reply doesn't log twice. */
const logged = new Set<string>();
const MAX_LOGGED = 500;

type OutputItem = { type?: string; name?: string; callId?: string; output?: unknown };

/**
 * Fills in every empty tool result in the context, in place, so the call's
 * history keeps the honest text too. Returns how many it filled.
 */
export function fillEmptyToolOutputs(
  chatCtx: Pick<llm.ChatContext, 'items'>,
  sessionId?: string,
  env: Record<string, string | undefined> = process.env
): number {
  if (!toolOutputGuardEnabled(env)) return 0;
  let filled = 0;
  for (const item of chatCtx.items as unknown as OutputItem[]) {
    if (item.type !== 'function_call_output' || !isEmptyOutput(item.output)) continue;
    const name = item.name ?? '';
    if (HANDOFF.test(name)) continue;
    const raw = item.output;
    item.output = JSON.stringify(emptyToolOutputText(name));
    filled++;
    const key = `${sessionId ?? ''}:${item.callId ?? name}`;
    if (logged.has(key)) continue;
    if (logged.size >= MAX_LOGGED) logged.clear();
    logged.add(key);
    log.warn({ sessionId, tool: name, callId: item.callId, raw }, 'TOOL_EMPTY_RESULT');
  }
  return filled;
}
