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
 * [laughter], and a written laugh opening the reply ("Haha, oh no.") goes
 * too. Otherwise the text passes through exactly as before.
 *
 * LAUGH_CAP (agents/personas/laugh-ledger.ts, the turn's `laughGate`): a
 * reply the call's ledger says may not laugh loses its laugh cues the same
 * way, and a laugh that does reach the voice is recorded there.
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
import type { LaughGate, TurnContext } from './types.js';

const log = createLogger({ module: 'HeavyLaughterGuard' });

/** Every laugh cue the model writes, as brackets, asterisks or parentheses. */
const LAUGH_CUE =
  /(?:\[(?:[a-z]+\s+)?(?:laugh(?:s|ter|ing)?|chuckl(?:e|es|ing)|giggl(?:e|es|ing))(?:\s+[a-z]+)?\]|\*(?:laughs?|chuckles?|giggles?)\*|\((?:laughs?|laughing|chuckles?|chuckling|giggles?)\))\s*/gi;
/** A laugh written as words at the very start, after any leading tags: "Haha, ", "Ha! ", "Heh. ". */
const LEADING_LAUGH = /^((?:\s|<[^>]*>)*)(?:ha(?:ha)*h?|hah|heh(?:eh)*)\b[,.!]*\s*/i;
/** The reply's first word is complete (or tags only so far): the opening can be read. */
const FIRST_WORD = /^(?:\s|<[^>]*>)*[^\s<]+[\s,.!?]/;
/** An opening bracket or asterisk near the end with no close yet: a cue may be splitting. */
const OPEN_TAIL = /[[*(][^\]*)]{0,24}$/;

export interface GuardOptions {
  sessionId?: string;
  turnContext?: Pick<TurnContext, 'userRequest' | 'turnNumber' | 'laughGate'>;
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

/** The reply's opening without a written laugh; what follows starts with a capital. */
export function withoutLeadingLaugh(text: string): string {
  const m = LEADING_LAUGH.exec(text);
  if (!m || m[0].length === m[1].length) return text;
  const rest = text.slice(m[0].length);
  return m[1] + rest.charAt(0).toUpperCase() + rest.slice(1);
}

/** LAUGH_CAP: whether the ledger lets this reply laugh, counting the reply; true if it fails. */
function capMayLaugh(gate: LaughGate, opts: GuardOptions): boolean {
  const said = opts.turnContext?.userRequest;
  try {
    return gate.beginReply(said, `${opts.turnContext?.turnNumber ?? ''}|${said}`);
  } catch (err) {
    log.warn({ err: String(err), sessionId: opts.sessionId }, 'laugh ledger failed');
    return true;
  }
}

/** Whether `text`, the reply so far, has a laugh in it: a cue anywhere or a written one opening it. */
function laughIn(text: string): boolean {
  return text.search(LAUGH_CUE) >= 0 || (FIRST_WORD.test(text) && LEADING_LAUGH.test(text));
}

/**
 * The reply's raw text stream, seen by `cues` (raw-cues.ts) as before; on a
 * heavy moment, or a reply LAUGH_CAP keeps from laughing, with every laugh cue
 * taken out first.
 */
export function laughterGuard(opts: GuardOptions, cues: RawCues): TransformStream<string, string> {
  let heavy = false;
  try {
    heavy = replyIsHeavy(opts);
  } catch (err) {
    log.warn({ err: String(err), sessionId: opts.sessionId }, 'heavy-moment check failed');
  }
  // Decided at the first words: an opening clip plays only before any reach the voice.
  const gate = opts.turnContext?.laughGate;
  let strip: boolean | undefined = gate ? undefined : heavy;
  let seen: string | null = gate ? '' : null;
  let held = '';
  let opening = true;
  const pass = (text: string, controller: TransformStreamDefaultController<string>): void => {
    cues.see(text); // never throws; see raw-cues.ts
    controller.enqueue(text);
  };
  return new TransformStream<string, string>({
    transform(chunk, controller) {
      // The ledger first: a heavy reply is still counted, and holds the laughs after it.
      strip ??= (gate !== undefined && !capMayLaugh(gate, opts)) || heavy;
      if (!strip) {
        if (seen !== null && laughIn((seen += chunk))) {
          seen = null;
          gate?.laughed();
        }
        return pass(chunk, controller);
      }
      let text = held + chunk;
      if (opening) {
        held = text;
        if (!FIRST_WORD.test(withoutLaughter(text))) return; // read the first word whole
        opening = false;
        text = withoutLeadingLaugh(withoutLaughter(text));
      }
      const open = OPEN_TAIL.exec(text);
      held = open ? open[0] : '';
      if (open) text = text.slice(0, open.index);
      const spoken = withoutLaughter(text);
      if (spoken) pass(spoken, controller);
    },
    flush(controller) {
      const rest = withoutLaughter(held);
      const spoken = opening ? withoutLeadingLaugh(rest) : rest;
      if (spoken) pass(spoken, controller);
    },
  });
}
