/**
 * HANDOFF_TALK_THROUGH: the handoff tool call's speech is held against interruption while
 * the handoff runs. The SDK applies a tool's `llm.handoff` only if the tool's SpeechHandle
 * wasn't interrupted, and `session.interrupt()` (the barge-in fast path, on a caller who
 * talks through the goodbye) interrupted it while the tool waited, dropping the handoff
 * without a word (dev A/B 2026-10-17; agents/multi-agent/handoff-talk-through.ts).
 *
 * @module tools/handoff/held-handoff-speech
 */
import { flagOn } from '../../config/env-flag.js';

const handoffTalkThrough = (): boolean =>
  flagOn('HANDOFF_TALK_THROUGH') && flagOn('MULTI_AGENT_SINGLE_SESSION');

interface HeldSpeech {
  speechHandle: { allowInterruptions: boolean; interrupted: boolean; done: () => boolean };
  disallowInterruptions: () => void;
}

/**
 * The handoff tool's execute, with its speech held against interruption while it runs
 * (HANDOFF_TALK_THROUGH, single-session handoffs). A result that isn't a handoff (a
 * refusal or a failure) lets the reply that follows be interrupted again.
 */
export function holdHandoffThroughTalk<A, O, R>(
  execute: (args: A, opts: O) => Promise<R>
): (args: A, opts: O) => Promise<R> {
  return async (args, opts) => {
    const ctx = (opts as { ctx?: Partial<HeldSpeech> } | undefined)?.ctx;
    const held = handoffTalkThrough() ? hold(ctx) : undefined;
    let handedOff = false;
    try {
      const result = await execute(args, opts);
      handedOff = typeof result === 'object' && result !== null && 'agent' in result;
      return result;
    } finally {
      if (held && !handedOff) held.allowInterruptions = true;
    }
  };
}

function hold(ctx: Partial<HeldSpeech> | undefined): HeldSpeech['speechHandle'] | undefined {
  const handle = ctx?.speechHandle;
  if (!handle || handle.interrupted || handle.done() || !handle.allowInterruptions)
    return undefined;
  if (ctx?.disallowInterruptions) ctx.disallowInterruptions();
  else handle.allowInterruptions = false;
  return handle;
}
