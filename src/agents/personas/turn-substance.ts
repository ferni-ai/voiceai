/**
 * Whether this reply needs substance, for TURN_LENGTH=adaptive (turn-length.ts).
 *
 * Learned length draws from friends' next turns in casual talk, so a real question got the same
 * few words as a passing remark. Three kinds of turn need a real answer instead, each read by a
 * classifier that already exists rather than a new word list:
 *
 *   question  something shared that ends on a real question, not about him (the fast lane's
 *             asksAQuestion, fast-lane.ts): "should I just tell her?". Ending the turn on it
 *             hands him the floor; mid-turn ("remember? we went...") it is a check, and on
 *             friends' talk lifting those cost Ferni 25 points against the real friend.
 *   tool      the reply after a tool that found something out (not an action: a timer is "done")
 *   beat      a specialist asked about their own beat (team-by-need-note.ts): Maya on a habit
 *
 * Requests and look-ups keep their own rules (no learned length); a quick yes, or a question about
 * him, keeps learned, and so does a caller on their way out ("talk tomorrow?", "I should get to bed,
 * can we pick this up tomorrow?"). So does a quick reaction or a "say that again" ("really?",
 * "huh?", "wait what?", "¿en serio?"): it ends on a question mark but asks for no answer. A call
 * with crisis risk keeps learned: its length rules stay.
 *
 * @module agents/personas/turn-substance
 */

import { onOwnBeat } from '../../tools/handoff/team-by-need-note.js';
import { asksAQuestion, callerTurn } from '../model-provider/fast-lane.js';
import type { CallerMove } from './caller-move.js';
import { LEAVING } from '../shared/call-farewell.js';
import { sayingGoodbye } from './happy-exits.js';
import { ACTION_TOOLS, WIDE_ACTION_TOOLS } from './tool-lead-in.js';

export type Substance = 'question' | 'tool' | 'beat';

interface ItemView {
  type?: string;
  role?: string;
  name?: string;
  textContent?: string;
}

/** The tools whose results this reply answers (since the caller last spoke), or none. */
function toolsAnswered(items: readonly ItemView[]): string[] {
  if (callerTurn(items) !== null) return [];
  const names: string[] = [];
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type === 'message' && item.role === 'user') break;
    if (item.type === 'function_call_output') names.push(item.name ?? '');
  }
  return names;
}

const isAction = (tool: string): boolean => ACTION_TOOLS.has(tool) || WIDE_ACTION_TOOLS.has(tool);

/**
 * Off to bed, which the shared LEAVING misses: "I should get to bed, can we pick this up tomorrow?".
 * Kept here, for adaptive only: LEAVING also ends first calls, presence sounds and invites under
 * every TURN_LENGTH, and "I should go to sleep, but I keep thinking about ending it all" must not
 * read as a goodbye there (verify of #3151).
 */
const OFF_TO_BED =
  /\bi (?:should|need to|have to|gotta|better) (?:probably |really |just )?(?:go|get) to (?:bed|sleep)(?=\s*(?:$|[.,!?;:]|(?:now|soon|right now|for now|in a (?:bit|minute|sec|second|few))\b))/i;
const onTheirWayOut = (said: string): boolean =>
  sayingGoodbye(said) || LEAVING.test(said) || OFF_TO_BED.test(said);

/**
 * Words that react or ask to hear it again, and carry nothing to answer: "really?", "huh?",
 * "wait what?", "isn't it?", "¿en serio?", "quoi ?". Not "why", "how" or "pourquoi": those ask
 * for a real answer. Whole words only, so "whatever" or "pourquoi" never reads as "what"/"quoi".
 */
const REACTION_WORDS = new Set(
  [
    // English: reactions, asking to hear it again, tag questions
    'really seriously srsly huh what wait sorry pardon come again say for real no way lol lmao haha',
    "omg wow whoa oh ooh ah uh um hm hmm mm eh yeah yes yep nope ok okay right true so is isn't it",
    "was wasn't that you are aren't serious sure do don't did didn't does doesn't mean",
    // Spanish
    'qué que cómo en serio de verdad neta sí si perdón perdon mande cierto ajá así',
    // French
    "quoi hein comment vraiment sérieux serieux sérieusement bon non oui c'est vrai n'est ce pas",
  ]
    .join(' ')
    .split(' ')
);

/** A short reaction or "say that again", three words at most, every one from REACTION_WORDS. */
function quickReaction(said: string): boolean {
  const words =
    said
      .normalize('NFC')
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}]+)*/gu) ?? [];
  return words.length <= 3 && words.every((w) => REACTION_WORDS.has(w));
}

const endsOnQuestion = (said: string): boolean =>
  said.trimEnd().endsWith('?') && asksAQuestion(said) && !quickReaction(said);

/** What makes this turn need a real answer, or undefined for a social moment. */
export function substanceOf(
  said: string,
  move: CallerMove,
  { items = [], speaker = 'ferni' }: { items?: readonly ItemView[]; speaker?: string } = {}
): Substance | undefined {
  if (move !== 'share' || onTheirWayOut(said)) return undefined;
  if (toolsAnswered(items).some((tool) => !isAction(tool))) return 'tool';
  if (onOwnBeat(speaker, said)) return 'beat';
  return endsOnQuestion(said) ? 'question' : undefined;
}
