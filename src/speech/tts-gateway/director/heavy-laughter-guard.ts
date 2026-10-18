/**
 * No laugh reaches the voice on a heavy moment, whoever wrote it.
 *
 * The laughter lever never adds one there (laughter.ts), but the model writes
 * its own: LAUGH_ALONG (live on prod) asks for "[laughter] at the start of
 * your reply" whenever the caller laughed, and several prompt hints
 * (persona-playful.ts, dynamic-speech-guidance.ts) show it lines with
 * [laughter] in them. "my dad died last week" then "haha anyway" read as a
 * laugh to every one of those. So on a heavy moment (isHeavyMoment, over the
 * caller's last two turns) every laugh cue the model writes is taken out of
 * the reply's text before the SSML processor maps it to Cartesia's
 * [laughter]. Otherwise the text passes through exactly as before.
 *
 * Runs in every Director mode but off, shadow included: it is a harm fix, not
 * a plan. A cue split across chunks ("[laugh" + "s]") is held until it
 * closes; never throws (a text-stream error cancels the reply).
 *
 * @module speech/tts-gateway/director/heavy-laughter-guard
 */

import { TransformStream, type TransformStreamDefaultController } from 'node:stream/web';

import { createLogger } from '../../../utils/safe-logger.js';
import {
  isHeavyMoment,
  noteCallerTurn,
  recentCallerTurns,
} from '../../adaptive-ssml/heavy-moment.js';
import type { RawCues } from './raw-cues.js';
import type { TurnContext } from './types.js';

const log = createLogger({ module: 'HeavyLaughterGuard' });

/** Every laugh cue the model writes, as brackets, asterisks or parentheses. */
const LAUGH_CUE =
  /(?:\[(?:[a-z]+\s+)?(?:laugh(?:s|ter|ing)?|chuckl(?:e|es|ing)|giggl(?:e|es|ing))(?:\s+[a-z]+)?\]|\*(?:laughs?|chuckles?|giggles?)\*|\((?:laughs?|laughing|chuckles?|chuckling|giggles?)\))\s*/gi;
/** An opening bracket or asterisk near the end with no close yet: a cue may be splitting. */
const OPEN_TAIL = /[[*(][^\]*)]{0,24}$/;

export interface GuardOptions {
  sessionId?: string;
  turnContext?: Pick<TurnContext, 'userRequest' | 'turnNumber'>;
}

/** Whether this reply answers a heavy moment: the caller's turn noted, then their last two read. */
export function replyIsHeavy(opts: GuardOptions): boolean {
  const said = opts.turnContext?.userRequest;
  if (!opts.sessionId) return isHeavyMoment([said]);
  noteCallerTurn(opts.sessionId, said, opts.turnContext?.turnNumber);
  return isHeavyMoment(recentCallerTurns(opts.sessionId));
}

/** The text with every laugh cue taken out. */
export function withoutLaughter(text: string): string {
  return text.replace(LAUGH_CUE, '');
}

/**
 * The reply's raw text stream, seen by `cues` (raw-cues.ts) as before; on a
 * heavy moment with every laugh cue taken out first.
 */
export function laughterGuard(opts: GuardOptions, cues: RawCues): TransformStream<string, string> {
  let heavy = false;
  try {
    heavy = replyIsHeavy(opts);
  } catch (err) {
    log.warn({ err: String(err), sessionId: opts.sessionId }, 'heavy-moment check failed');
  }
  let held = '';
  const pass = (text: string, controller: TransformStreamDefaultController<string>): void => {
    cues.see(text); // never throws; see raw-cues.ts
    controller.enqueue(text);
  };
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      if (!heavy) return pass(chunk, controller);
      let text = held + chunk;
      const open = OPEN_TAIL.exec(text);
      held = open ? open[0] : '';
      if (open) text = text.slice(0, open.index);
      const spoken = withoutLaughter(text);
      if (spoken) pass(spoken, controller);
    },
    flush(controller) {
      const spoken = withoutLaughter(held);
      if (spoken) pass(spoken, controller);
    },
  });
}
