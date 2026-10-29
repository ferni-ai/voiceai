/**
 * CALL_ME_VOCATIVE=on: the name rememberName is confirming, tracked from the
 * tool calls themselves (remember-name.ts), never from a reading of the
 * transcript.
 *
 * PR #2886 tracked "the name the caller said last" with a regex over their
 * words. Lower-case or unusual corrections ("actually call me jamie", "no
 * wait, make it Jamie") fell back to the old name, so a late call for Sam
 * plus "yes" saved Sam. Here:
 * - the newest name the tool is called with is the one being confirmed; an
 *   older open question is dropped when a newer name is asked about or saved;
 * - the caller's next turn answers the open question, and only it: a yes is
 *   for that name on that turn, and is gone the turn after;
 * - a question the next turn didn't answer is dropped, so an old name asked
 *   about again later starts over and never inherits an old yes.
 * Turns are counted from the request (call-me-note.ts noteCallerTurn): runs of
 * the caller's messages, so one turn's preemptive, final and tool-reply
 * requests are one turn, and "yes" then "yes" are two.
 *
 * @module tools/domains/conversation/name-confirm-calls
 */

interface Turn {
  turn: number;
  words: string;
  /** The verified owner is on the line: a save may rename the account. */
  owner: boolean;
}

interface Asked {
  name: string;
  turn: number;
  /** A name like a team name, asked about twice (name-likeness.ts). */
  twice: boolean;
  /** This is the second question. */
  second: boolean;
}

interface Answer extends Asked {
  /** The turn that answered it. */
  on: number;
  yes: boolean;
}

const turns = new WeakMap<object, Turn>();
const asked = new WeakMap<object, Asked>();
const answered = new WeakMap<object, Answer>();
/** agreeTo's decision for a turn; no name: that turn's yes didn't count. */
const agreed = new WeakMap<object, { turn: number; name?: string }>();

/** Notes the caller's turn: `turn` counts their turns so far on this call, `words` are this turn's. */
export function noteCallerTurn(session: object, words: string, turn: number, owner = false): void {
  if (words.trim()) turns.set(session, { turn, words, owner });
}

/** Whether this turn's caller may rename the account (the agents layer decides; turn-request.ts). */
export const ownerOnTheLine = (session: object): boolean => turns.get(session)?.owner === true;

const first = (name: string): string => name.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
export const sameName = (a: string, b: string | undefined): boolean => !!b && first(a) === first(b);

/**
 * Name-correction got a yes to its own "Sam from now on?" on caller turn `turn`:
 * rememberName may save Sam on that turn. The turn's first request decides for
 * the rest of it, and a yes while this tool asks about another name doesn't count.
 */
export function agreeTo(session: object, name: string, turn: number): boolean {
  const before = agreed.get(session);
  if (before?.turn === turn) return before.name !== undefined && sameName(before.name, name);
  const open = asked.get(session);
  const toolAsksOther = !!open && turn - open.turn <= 1 && !sameName(open.name, name);
  agreed.set(session, { turn, name: toolAsksOther ? undefined : name });
  return !toolAsksOther;
}

export type Step = { kind: 'ask'; second: boolean } | { kind: 'save' } | { kind: 'no' };

/** The open question meets the caller's next turn: answered there, or dropped if that turn passed. */
function settle(session: object, now: Turn, isYes: (words: string, name: string) => boolean): void {
  const open = asked.get(session);
  if (!open || now.turn <= open.turn) return; // the same turn: still waiting
  asked.delete(session);
  if (now.turn !== open.turn + 1) return; // their next turn passed with no tool call: start over
  answered.set(session, { ...open, on: now.turn, yes: isYes(now.words, open.name) });
}

function ask(session: object, name: string, now: Turn, twice: boolean, second: boolean): Step {
  asked.set(session, { name, turn: now.turn, twice, second });
  return { kind: 'ask', second };
}

/**
 * What a rememberName call for `name` does this turn. `twice`: ask twice;
 * `onFile`: the account's name (saved again as before, never asked about).
 */
export function stepFor(
  session: object,
  name: string,
  opts: { twice: boolean; onFile?: string; isYes: (words: string, name: string) => boolean }
): Step {
  const now = turns.get(session) ?? { turn: -1, words: '', owner: false };
  settle(session, now, opts.isYes);
  const reply = answered.get(session);
  const open = asked.get(session);
  if (reply && reply.on === now.turn && sameName(reply.name, name)) {
    if (open && !sameName(open.name, name)) asked.delete(session); // the newer call wins
    if (!reply.yes) return { kind: 'no' };
    if (reply.twice && !reply.second) {
      answered.delete(session);
      return ask(session, name, now, true, true);
    }
    return { kind: 'save' };
  }
  if (open && open.turn === now.turn && sameName(open.name, name))
    return { kind: 'ask', second: open.second };
  const yes = agreed.get(session);
  if (yes?.turn === now.turn && yes.name !== undefined && sameName(yes.name, name)) {
    if (open) asked.delete(session);
    return { kind: 'save' };
  }
  if (sameName(name, opts.onFile)) {
    if (open) asked.delete(session);
    return { kind: 'save' };
  }
  return ask(session, name, now, opts.twice, false);
}
