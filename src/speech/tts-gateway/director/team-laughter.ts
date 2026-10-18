/**
 * Laughter the teammates can actually reach (TEAM_VOICES=on, off by default).
 *
 * The laughter lever never fired: 0 laughs in 2,680 dev plans. Its rules
 * (adaptive-ssml/contextual-laughter.ts) score a moment as
 * `pattern confidence x persona base (<= 0.25) x (rapport + 0.5)` and then
 * require that score to reach 0.3. At the default rapport of 0.5 the best
 * possible is 0.9 x 0.25 x 1 = 0.225, so no moment ever qualifies. The score
 * was also the roll's probability, so it mixed two questions: is this a
 * moment for a laugh, and how often does this persona laugh at one.
 *
 * Here they are separate. A moment qualifies on its own (the caller laughed
 * or was playful; the reply's first phrase carries the persona's own joke),
 * with the same blocks as before (heavy topic, upset caller, supportive or
 * heavy words, the persona's minimum turns between laughs, at most 4 a call).
 * Then the persona laughs at it with its own frequency (its manifest's
 * laughter_frequency), more readily with rapport and twice as readily when
 * the caller laughed first: most laughter in conversation is shared
 * (Provine). Each persona keeps its style: Peter and Nayan don't laugh at
 * their own jokes, and the legends have their own instead of Ferni's.
 *
 * Ferni is unchanged by default: he already writes his own [laughter] (57 on
 * dev in the same window), and the lever keeps its old rules for him. Those
 * rules top out at 0.18 x 1.5 = 0.27 against the 0.3 threshold, so on prod
 * the lever added 0 laughs in 415 plans. FERNI_LIGHT_TOUCH=on (off by default)
 * gives him the same reachable path as the team: his own base and spacing
 * (0.18, 6 turns), a chance that never drops below 0.15 at a moment that
 * qualifies, the same blocks and the same cap of 4 a call, his own written
 * [laughter] counted toward both.
 *
 * @module speech/tts-gateway/director/team-laughter
 */

import {
  AGENT_HUMOR_PATTERNS,
  BLOCK_LAUGHTER_PATTERNS,
  PERSONA_LAUGH_STYLES,
  SUPPORTIVE_PATTERNS,
  USER_PLAYFUL_PATTERNS,
  getSessionHistory,
  recordLaugh,
} from '../../adaptive-ssml/contextual-laughter.js';
import {
  isHeavyMoment,
  noteCallerTurn,
  recentCallerTurns,
} from '../../adaptive-ssml/heavy-moment.js';
import type { LaughPlacement, LaughterInput } from './laughter.js';

export interface TeamLaughStyle {
  /** Chance of laughing at a moment that fits, at default rapport (manifest laughter_frequency). */
  frequency: number;
  /** Laughs after their own joke. */
  ownJokes: boolean;
  /** Laughs along when the caller laughs or plays. */
  withUser: boolean;
  /** Minimum turns between two laughs. */
  minTurns: number;
  /** The chance at a qualifying moment never drops below this (FERNI_LIGHT_TOUCH). */
  floor?: number;
}

/** Frequencies from each persona's manifest (laughter_frequency); a test keeps them equal. */
const FREQUENCY: Readonly<Record<string, number>> = {
  'maya-santos': 0.15,
  'jordan-taylor': 0.22,
  'alex-chen': 0.15,
  'peter-john': 0.18,
  'nayan-patel': 0.06,
  'joel-dickson': 0.2,
};

/**
 * The legends, in their own manner rather than Ferni's: Henry grandfatherly
 * and dry (a rare warm chuckle, never at his own line), Tom the storyteller
 * who laughs at his own anecdotes, Nate quick-witted and laughs easily.
 */
const LEGENDS: Readonly<Record<string, TeamLaughStyle>> = {
  'john-bogle': { frequency: 0.08, ownJokes: false, withUser: true, minTurns: 8 },
  'peter-lynch': { frequency: 0.16, ownJokes: true, withUser: true, minTurns: 5 },
  'joel-dickson': { frequency: 0.2, ownJokes: true, withUser: true, minTurns: 4 },
};

/** Patterns at or above this confidence read as the persona's own joke. */
const OWN_JOKE_MIN = 0.6;
const MAX_LAUGHS = 4;
const MAX_P = 0.6;
const DISTRESSED = new Set(['sad', 'distressed', 'angry', 'grief', 'anxious']);
/**
 * The caller was playful, minus "??" and "!!": "what do I even do now??" is
 * distress, not play, and got a laugh along.
 */
const PLAYFUL = USER_PLAYFUL_PATTERNS.filter((p) => p.source !== '[!?]{2,}');
/** The caller laughed, as speech-to-text writes it: "hahaha" and "[laughter]" too, which the playful patterns miss. */
const CALLER_LAUGHED = /\[laughter\]|\b(?:ha){2,}h?\b|\bha ha\b|\b(?:he){2,}\b|\b(?:lol|lmao)\b/i;

/** The lowest chance Ferni laughs at a qualifying moment, with FERNI_LIGHT_TOUCH on. */
export const FERNI_LAUGH_FLOOR = 0.15;

/** Ferni's style with FERNI_LIGHT_TOUCH on: his own base and spacing, and a reachable floor. */
export function ferniLightStyle(personaId: string | undefined): TeamLaughStyle | undefined {
  if (personaId !== 'ferni') return undefined;
  const style = PERSONA_LAUGH_STYLES.ferni;
  return {
    frequency: style.laughProbabilityBase,
    ownJokes: style.laughAfterOwnJokes,
    withUser: style.laughWithUser,
    minTurns: style.minTurnsBetweenLaughs,
    floor: FERNI_LAUGH_FLOOR,
  };
}

/** A teammate's or legend's laugh style; undefined for Ferni or an unknown persona. */
export function teamLaughStyle(personaId: string | undefined): TeamLaughStyle | undefined {
  if (!personaId || personaId === 'ferni') return undefined;
  if (LEGENDS[personaId]) return LEGENDS[personaId];
  const style = PERSONA_LAUGH_STYLES[personaId];
  if (!style) return undefined;
  return {
    frequency: FREQUENCY[personaId] ?? style.laughProbabilityBase,
    ownJokes: style.laughAfterOwnJokes,
    withUser: style.laughWithUser,
    minTurns: style.minTurnsBetweenLaughs,
  };
}

function blocked(input: LaughterInput, style: TeamLaughStyle): boolean {
  const emotion = input.userEmotion?.toLowerCase();
  if (emotion && DISTRESSED.has(emotion)) return true;
  if (SUPPORTIVE_PATTERNS.some((p) => p.test(input.phrase))) return true;
  if (BLOCK_LAUGHTER_PATTERNS.some((p) => p.test(input.phrase))) return true;
  // Anything hard in the caller's last two turns (noted just before), however they laughed.
  if (isHeavyMoment(recentCallerTurns(input.sessionId!))) return true;
  const history = getSessionHistory(input.sessionId!);
  return (
    (input.turn ?? 0) - history.lastLaughTurn < style.minTurns || history.laughCount >= MAX_LAUGHS
  );
}

/** The chance of laughing at a moment that qualifies: more with rapport, twice when the caller played. */
function chance(style: TeamLaughStyle, rapport: number, callerPlayed: boolean): number {
  const p = style.frequency * (rapport + 0.5) * (callerPlayed ? 2 : 1);
  return Math.min(MAX_P, Math.max(style.floor ?? 0, p));
}

/**
 * Where a teammate laughs in this reply, if anywhere. The caller (the lever)
 * has already ruled out a heavy reply and one that already laughs.
 */
export function decideTeamLaughter(
  input: LaughterInput,
  style: TeamLaughStyle,
  rng: () => number = Math.random
): LaughPlacement | undefined {
  if (!input.sessionId) return undefined;
  noteCallerTurn(input.sessionId, input.userText);
  if (blocked(input, style)) return undefined;
  const user = input.userText ?? '';
  const callerPlayed =
    style.withUser && (CALLER_LAUGHED.test(user) || PLAYFUL.some((p) => p.test(user)));
  const ownJoke =
    style.ownJokes &&
    AGENT_HUMOR_PATTERNS.some((h) => h.confidence >= OWN_JOKE_MIN && h.pattern.test(input.phrase));
  if (!callerPlayed && !ownJoke) return undefined;
  if (rng() >= chance(style, input.comfortLevel ?? 0.5, callerPlayed)) return undefined;
  recordLaugh(input.sessionId, input.turn ?? 0);
  return callerPlayed ? 'before' : 'after';
}

/**
 * The LLM wrote its own [laughter]: count it toward the persona's spacing and
 * cap, and note the caller's turn, which the next reply looks back on.
 */
export function noteWrittenLaughter(
  sessionId: string | undefined,
  turn: number | undefined,
  userText?: string
): void {
  if (!sessionId) return;
  recordLaugh(sessionId, turn ?? 0);
  noteCallerTurn(sessionId, userText);
}
