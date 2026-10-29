/**
 * CALL_ME_VOCATIVE=on: a new name is never saved from one utterance, and an
 * unclear "call me <name>" is asked about, never guessed.
 *
 * PR #2698 round 1 guessed from the words alone and the held-out set showed
 * why that fails: "Could you call me Ferney" renamed the owner, "Actually,
 * call me Fern from now on" got a note to phone him, and "Just call me Pete"
 * was dropped. A friend who isn't sure asks. So two questions wait here, one
 * turn each, per session:
 * - `rename`: "call me Sam", "my name is Sam", "just call me Pete". Ferni
 *   checks in one line ("Sam from now on?"); the name is used and saved only
 *   on a yes the next turn (outreach-confirm.ts isClearYes, the same yes that
 *   sends a text), or when they say the name again. Anything else drops it.
 * - `either`: "call me Fern" (a word like a team name, utils/call-me-vocative.ts).
 *   Ferni asks "ring your phone, or call you Fern?" and the answer decides.
 * Settling is idempotent per turn: the preemptive and final requests of one
 * turn carry the same words and get the same outcome.
 *
 * @module agents/personas/name-confirm
 */

import { getPersonaDisplayName } from '../../personas/voice-registry.js';
import { isClearYes } from '../../tools/domains/communication/outreach/outreach-confirm.js';

export type PendingKind = 'rename' | 'either';

export interface Pending {
  kind: PendingKind;
  name: string;
  /**
   * The caller turn it was asked on (callerTurns). By turn, not words: a turn's
   * preemptive and final requests can hear different words.
   */
  askedOn: number;
  /** `either` where the word is their own name already: only "ring or not" is open. */
  ownName?: boolean;
}

export type Outcome = 'waiting' | 'yes' | 'name' | 'ring' | 'dropped';

export interface Settled {
  pending: Pending;
  outcome: Outcome;
}

const open = new WeakMap<object, Map<PendingKind, Pending>>();
const done = new WeakMap<object, Map<PendingKind, Settled & { on: number }>>();

const mapOf = <T>(
  store: WeakMap<object, Map<PendingKind, T>>,
  session: object
): Map<PendingKind, T> => {
  const found = store.get(session);
  if (found) return found;
  const made = new Map<PendingKind, T>();
  store.set(session, made);
  return made;
};

/** The speaking persona's first name ("Ferni", "Maya"), as locked-teammates.ts reads it. */
export function personaFirstNameOf(session: object): string {
  const id = (session as { userData?: { personaId?: string } }).userData?.personaId ?? 'ferni';
  return getPersonaDisplayName(id).split(/\s+/)[0] || 'Ferni';
}

export function pendingOf(session: object, kind: PendingKind): Pending | undefined {
  return open.get(session)?.get(kind);
}

/** Ask about `pending.name` this turn; it is settled by the caller's next words. */
export function propose(session: object, pending: Pending): void {
  mapOf(open, session).set(pending.kind, pending);
}

const NO_FIRST = /^\W*(?:no|nope|nah|not|don['’]?t|never|wait|stop|cancel)\b/i;
const YES_FIRST =
  /^\W*(?:yes|yeah|yep|yup|ya|sure|correct|right|exactly|ok(?:ay)?|that['’]?s right|absolutely|definitely|perfect)\b/i;
const ASSENT = /^\W*(?:mhm+|mm-?hmm+|uh[- ]?huh)\W*$/i;
const RING_ANSWER =
  /\b(?:ring|phone|cell|give\s+me\s+a\s+call|a\s+call|the\s+call|the\s+first(?:\s+one)?|first\s+one|call\s+me(?:\s+back)?(?=\s*(?:[?.!,]|$|now\b|please\b)))/i;
const NAME_ANSWER =
  /\b(?:(?:the|a|my)\s+(?:nick)?name|nickname|the\s+second(?:\s+one)?|second\s+one|the\s+other\s+one)\b/i;

const said = (words: string, name: string): boolean =>
  new RegExp(`(?:^|[^\\p{L}])${name.replace(/[^\p{L}-]/gu, '')}(?![\\p{L}])`, 'iu').test(words);
const bare = (words: string): string => words.replace(/[^\p{L}-]/gu, '').toLowerCase();

/** A yes to "Sam from now on?": a plain yes, "yes, Sam", "yeah, Sam's good", "Sam.", or the name stated again. */
function renameAnswer(p: Pending, words: string, restated: string | null): Outcome {
  if (NO_FIRST.test(words)) return 'dropped';
  const name = p.name.toLowerCase();
  if (isClearYes(words, [name]) || ASSENT.test(words) || bare(words) === name) return 'yes';
  if (restated?.toLowerCase() === name) return 'yes';
  return YES_FIRST.test(words) && said(words, p.name) ? 'yes' : 'dropped';
}

/** The answer to "ring your phone, or call you Fern?": one of the two, or neither. */
function eitherAnswer(p: Pending, words: string): Outcome {
  const ring = RING_ANSWER.test(words);
  if (p.ownName) return ring || isClearYes(words) ? 'ring' : 'dropped';
  const name = NAME_ANSWER.test(words) || said(words, p.name);
  if (ring === name) return 'dropped';
  return ring ? 'ring' : 'name';
}

/** A caller turn: their words and its number (callerTurns), shared by its preemptive and final requests. */
export interface CallerTurn {
  words: string;
  count: number;
}

/**
 * Settles the open `kind` question with this turn's words, or returns what this
 * same turn settled already. By turn number, never by words: a later "yes" is a
 * new answer, not the earlier one again, and the final request can hear more
 * words than the preemptive one. `restated`: a name they stated this turn.
 * Null with nothing open, or no words.
 */
export function settle(
  session: object,
  kind: PendingKind,
  turn: CallerTurn,
  restated: string | null = null
): Settled | null {
  if (!turn.words.trim()) return null;
  const last = done.get(session)?.get(kind);
  if (last?.on === turn.count) return { pending: last.pending, outcome: last.outcome };
  const pending = pendingOf(session, kind);
  if (!pending) return null;
  if (pending.askedOn === turn.count) return { pending, outcome: 'waiting' };
  const outcome =
    kind === 'rename'
      ? renameAnswer(pending, turn.words, restated)
      : eitherAnswer(pending, turn.words);
  open.get(session)?.delete(kind);
  mapOf(done, session).set(kind, { pending, outcome, on: turn.count });
  return { pending, outcome };
}

/** The turn line while a new name waits for their yes. `plain`: no quoted example. */
export function confirmNameNote(name: string, current: string | undefined, plain = false): string {
  return current
    ? `They may have asked to be called ${name} instead of ${current}. Don't switch yet: check in one ` +
        `short line${plain ? '' : ` ("${name} from now on?")`}, and keep calling them ${current} until they say yes.`
    : `They may have said their name is ${name}. Check you heard it right in one short line` +
        `${plain ? '' : ` ("${name}, did I get that right?")`} before you use it.`;
}

/** The turn line for "call me <a name like yours>": ask, don't guess. */
export function eitherNote(p: Pending, persona: string, plain = false): string {
  if (p.ownName) {
    return (
      `"Call me ${p.name}" could be a phone call. Ask once${plain ? '' : ' ("On your phone?")'}, ` +
      `and call callUser only on a yes.`
    );
  }
  return (
    `"Call me ${p.name}" could mean ring their phone (${p.name} sounds like your name, ${persona}) ` +
    `or call them ${p.name}. Don't guess and don't call callUser yet: ask one short either-or question` +
    `${plain ? '' : ` ("Want me to ring your phone, or should I call you ${p.name}?")`}.`
  );
}
