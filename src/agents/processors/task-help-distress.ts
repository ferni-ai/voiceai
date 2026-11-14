/**
 * Task-help distress (HUMANIZE_DISTRESS_CORROBORATION, off by default).
 *
 * The emotion detector scores a bare "help" as full distress (intelligence/detectors/emotion.ts),
 * so an everyday ask like "can you help me plan dinner" reads as concern level crisis: the avatar
 * holds its crisis face for the rest of the call and the turn switches to holding space. That
 * score also feeds safety context builders, so it stays as it is. Instead, once per turn
 * (process-turn.ts), this module decides whether the humanization layer may read it lower:
 * only when the whole line is an everyday ask built from a closed vocabulary AND nothing else
 * backs the distress up. Any other line, a bare cry for help ("help", "please help me") among
 * them, keeps its full reading.
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
 * The only words a capped turn may use: the line must be an everyday ask built from this set
 * ("can you help me plan dinner for Sam"). Any other word keeps the full reading, so a line
 * the list doesn't foresee is never lowered. Adding a word needs a never-lower row for it in
 * task-help-distress.test.ts. "letter", "note" and a bare "card" or "list" stay out on purpose.
 */
const TASK_HELP_VOCABULARY = {
  help: ['help', 'ayuda', 'ayúdame'],
  taskVerbs: ['write', 'plan', 'pick', 'choose', 'find', 'fix', 'draft', 'make', 'edit', 'check'],
  moreTaskVerbs: ['book', 'cook', 'organize', 'set up'],
  determiners: ['a', 'an', 'the', 'my', 'our', 'this'],
  prepositions: ['with', 'for', 'on', 'to', 'about'],
  politeness: ['please', 'can', 'could', 'you', 'me', 'us', 'i', 'need', 'want', 'out'],
  everydayTasks: [
    'email',
    'emails',
    'dinner',
    'lunch',
    'gift',
    'toast',
    'recipe',
    'resume',
    'homework',
    'essay',
    'slides',
    'schedule',
    'trip',
    'party',
    'playlist',
    'grocery list',
    'shopping list',
    'birthday card',
    'thank-you card',
  ],
} as const;

const HELP_WORDS = new Set<string>(TASK_HELP_VOCABULARY.help);
const TASK_WORDS = new Set<string>(TASK_HELP_VOCABULARY.everydayTasks);
const ALLOWED = new Set<string>(Object.values(TASK_HELP_VOCABULARY).flat());
/** One person may be named, directly after "for": "a gift for Riley". */
const NAME = /^\p{Lu}\p{Ll}+$/u;

/** Above this distress the turn reads as a heavy topic (turn-events.ts, humanizing-context-builder.ts). */
const HEAVY_DISTRESS = 0.6;

const HELP_WORD = /\bhelp\b/gi;

/**
 * The line is an everyday ask for help with a task: every word is in TASK_HELP_VOCABULARY
 * (two-word entries count as one), apart from at most one name after "for", and it names a
 * help word and an everyday task.
 */
function isTaskHelpOnly(text: string): boolean {
  const tokens = text.split(/[^\p{L}\p{N}'-]+/u).filter(Boolean);
  let named = false;
  let help = false;
  let task = false;
  for (let i = 0; i < tokens.length; i++) {
    const word = tokens[i].toLowerCase();
    const pair = i + 1 < tokens.length ? `${word} ${tokens[i + 1].toLowerCase()}` : '';
    const entry = ALLOWED.has(pair) ? pair : word;
    if (entry === pair) i++;
    if (ALLOWED.has(entry)) {
      help ||= HELP_WORDS.has(entry);
      task ||= TASK_WORDS.has(entry);
    } else if (!named && tokens[i - 1]?.toLowerCase() === 'for' && NAME.test(tokens[i])) {
      named = true;
    } else {
      return false;
    }
  }
  return help && task;
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
  crisisSignal: boolean,
  /** Redoes what was decided under the cap (the persona mood) from the full reading. */
  onLift: () => void = () => undefined
): T {
  if (!state.distressCapped || !crisisSignal) return state;
  onLift();
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
