/**
 * NAME_GATE_V2: scripted lines get the name gate too.
 *
 * Replies the model writes pass the name gate (name-gate.ts, wired in
 * crisis-gate.ts), but lines spoken with session.say() never did: the
 * greeting and its fallbacks ("Hi Seth, it's Ferni. How's it going?"), the
 * proactive opener ("Hey Seth, it's Ferni, just calling to check in."),
 * handoff lines, the legacy greeting handler. Every one of them reaches the
 * voice through session.say(), so the gate goes there, once per session,
 * rather than at each of the ~80 call sites. The falling delivery for an
 * opening "Hey Seth," still comes from the TTS gateway (name-intonation.ts),
 * which say() text passes through like any reply.
 *
 * @module agents/personas/scripted-name-gate
 */

import type { ReadableStream } from 'node:stream/web';

import { flagOn, type Env } from '../../config/env-flag.js';
import { firstNameOf, nameGateText, type HistoryItem } from './name-gate.js';

interface SayingSession {
  say: (text: string | ReadableStream<string>, options?: never) => unknown;
  userData?: unknown;
  history?: { items?: readonly unknown[] };
}

/** Route a session's say() text through the name gate, as the call stands when it is said. */
export function gateScriptedSay(session: SayingSession, env: Env = process.env): void {
  if (!flagOn('NAME_GATE_V2', env)) return;
  const say = session.say.bind(session);
  session.say = (text, options) => {
    if (typeof text !== 'string') return say(text, options);
    const name = firstNameOf((session.userData as { userName?: unknown } | undefined)?.userName);
    const history = (session.history?.items ?? []) as readonly HistoryItem[];
    return say(nameGateText(text, { name, history, env }), options);
  };
}
