/**
 * Task-help distress (HUMANIZE_DISTRESS_CORROBORATION, off by default).
 *
 * The emotion detector scores a bare "help" as full distress (intelligence/detectors/emotion.ts),
 * so an everyday ask like "can you help me plan dinner" reads as concern level crisis: the avatar
 * holds its crisis face for the rest of the call and the turn switches to holding space. That
 * score also feeds safety context builders, so it stays as it is. Instead, once per turn
 * (process-turn.ts), this module decides whether the humanization layer may read it lower:
 * only when every "help" in the turn asks for help with a task AND nothing else backs the
 * distress up. A bare cry for help ("help", "please help me", "help, my dad isn't breathing")
 * is never lowered.
 *
 * @module agents/processors/task-help-distress
 */

import {
  EMOTION_THRESHOLDS,
  getConcernLevelFromDistress,
  type ConcernLevel,
} from '../../config/emotion-thresholds.js';
import { flagOn, type Env } from '../../config/env-flag.js';
import { EmotionDetector, type EmotionResult } from '../../intelligence/detectors/index.js';

/**
 * Verbs that make "help (me) <verb> …" a request for help with a task. Narrow on purpose:
 * each takes a concrete object (a dinner, a gift, a toast, a trip). Verbs that take a process
 * or an abstract complement (get, make, find, figure out, decide) are left out, because
 * "help me make it stop" or "help me find a way to end it" must keep the crisis reading.
 */
const TASK_HELP_VERBS = [
  'plan',
  'pick',
  'choose',
  'write',
  'draft',
  'book',
  'send',
  'finish',
  'set up',
  'learn',
] as const;

/** People the caller may need help with: "help me with my dad" is not a task. */
const RELATIONS = [
  'mom',
  'mother',
  'dad',
  'father',
  'husband',
  'wife',
  'partner',
  'boyfriend',
  'girlfriend',
  'ex',
  'son',
  'daughter',
  'kid',
  'kids',
  'child',
  'brother',
  'sister',
  'family',
  'friend',
  'roommate',
  'boss',
] as const;

/**
 * Words that keep a task-help request at its full reading when they follow the task verb or
 * "with": an ending or an escape ("help me write a note so they understand why"), or a person
 * or the caller themself ("help me with my dad", "help me with myself").
 */
const TASK_HELP_NEVER_LOWER = [
  'it',
  'through',
  'away',
  'a way',
  'how to',
  'whether',
  'why',
  'goodbye',
  'note',
  'letter',
  'him',
  'her',
  'them',
  'myself',
  'me',
  ...RELATIONS.map((relation) => `my ${relation}`),
] as const;

/** Above this distress the turn reads as a heavy topic (turn-events.ts, humanizing-context-builder.ts). */
const HEAVY_DISTRESS = 0.6;

const words = (list: readonly string[]): string =>
  list.map((w) => w.replace(/ /g, '\\s+')).join('|');
const HELP_WORD = /\bhelp\b/gi;
/** "help (me|us) (out) with|on" or "help (me|us) (to) <task verb>", from the clause start. */
const TASK_HELP_PREFIX = new RegExp(
  `^help(?:\\s+(?:me|us))?(?:\\s+out)?\\s+(?:(?:with|on)(?=\\s+\\S)|(?:to\\s+)?(?:${words(TASK_HELP_VERBS)})\\b)`,
  'i'
);
/** An empty list guards nothing (an empty alternation would match everywhere). */
const NEVER_LOWER =
  TASK_HELP_NEVER_LOWER.length > 0
    ? new RegExp(`\\b(?:${words(TASK_HELP_NEVER_LOWER)})\\b`, 'i')
    : /(?!)/;
/** A clause ends at punctuation or a joining word, so "help me plan dinner, I can't cope" is two. */
const CLAUSE_END = /[,.;:!?]|\b(?:and|but|because|cause|so)\b/i;

/** Every "help" in the text asks for help with a task, in its own clause. */
function isTaskHelpOnly(text: string): boolean {
  const helps = [...text.matchAll(HELP_WORD)];
  if (helps.length === 0) return false;
  return helps.every(({ index }) => {
    const clause = text.slice(index).split(CLAUSE_END)[0] ?? '';
    const prefix = TASK_HELP_PREFIX.exec(clause);
    return prefix !== null && !NEVER_LOWER.test(clause.slice(prefix[0].length));
  });
}

export interface TurnDistress {
  /** The caller's words this turn. */
  text: string;
  /** The detector's reading of them (analysis.emotion). */
  emotion: Pick<EmotionResult, 'valence' | 'distressLevel'>;
  /** The turn's own crisis read has a signal (hasCrisisSignal, turn-crisis.ts). */
  crisisSignal: boolean;
}

/**
 * Something besides a lone "help" backs the distress up: a negative emotion, a crisis signal on
 * the same turn, or distress that stays at least elevated once "help" is taken out (the real
 * detector, rerun).
 */
function isCorroboratedDistress(turn: TurnDistress): boolean {
  if (turn.emotion.valence === 'negative' || turn.crisisSignal) return true;
  const withoutHelp = new EmotionDetector().detect(turn.text.replace(HELP_WORD, ' '));
  return withoutHelp.distressLevel >= EMOTION_THRESHOLDS.elevated.distress;
}

/**
 * Whether the humanization layer reads this turn's distress lower (flag on, task help only,
 * not corroborated). False whenever the flag is off.
 */
export function taskHelpDistressCapped(turn: TurnDistress, env: Env = process.env): boolean {
  if (!flagOn('HUMANIZE_DISTRESS_CORROBORATION', env)) return false;
  if (turn.emotion.distressLevel <= HEAVY_DISTRESS) return false;
  return isTaskHelpOnly(turn.text) && !isCorroboratedDistress(turn);
}

/** The turn's final crisis summary (classifier included) has a signal: the cap comes off. */
export function keepCapUnlessCrisis<T extends { distressCapped?: boolean }>(
  state: T,
  crisisSignal: boolean
): T {
  if (!state.distressCapped || !crisisSignal) return state;
  const uncapped = { ...state };
  delete uncapped.distressCapped;
  return uncapped;
}

/** Heavy topic: distress above HEAVY_DISTRESS and not capped. */
export function readsHeavy(distressLevel: number, distressCapped?: boolean): boolean {
  return distressLevel > HEAVY_DISTRESS && !distressCapped;
}

/** The concern level the avatar is sent: a capped turn goes no higher than elevated. */
export function humanizationConcernLevel(
  distressLevel: number,
  distressCapped?: boolean
): ConcernLevel {
  const level = getConcernLevelFromDistress(distressLevel);
  return distressCapped && level === 'crisis' ? 'elevated' : level;
}
