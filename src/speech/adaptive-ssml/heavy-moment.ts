/**
 * Is this a heavy moment? One check for everything that must never answer
 * hard news with a laugh or a joke: the laughter lever (team-laughter.ts) and
 * Ferni's playful turns (agents/personas/ferni-playful-turn.ts).
 *
 * The checks it replaces each missed something a critic found (2026-10-17):
 * - BLOCK_LAUGHTER_PATTERNS (contextual-laughter.ts) has no "kill myself",
 *   "ICU", "chemo", "let go", "can't do this anymore" or "my grandma passed",
 *   so "kill myself lol" read as playful and got a laugh along.
 * - The backchannel cues (agents/integrations/backchannel-context.ts) read
 *   only the last 12 words, so grief early in a long turn was missed; and
 *   they count everyday mishaps ("spilled", "knocked", "long day"), which are
 *   often the funniest thing a caller says.
 * - Both looked at one turn: "haha anyway" right after "my dad died last
 *   week" read as light.
 *
 * So this reads every word of each turn, looks back over the caller's last
 * two turns, and lists the hard things, mishaps left out. It errs toward
 * heavy: a missed laugh costs nothing, a laugh at grief costs the friendship.
 *
 * @module speech/adaptive-ssml/heavy-moment
 */

import { BLOCK_LAUGHTER_PATTERNS } from './contextual-laughter.js';

const PEOPLE =
  'mom|mum|mother|dad|father|grandma|grandmother|granny|nana|grandpa|grandfather|papa|brother|sister|son|daughter|wife|husband|aunt|uncle|cousin|friend|boyfriend|girlfriend|partner|baby|dog|cat|pet|he|she|they';
const PARTNER = 'wife|husband|girlfriend|boyfriend|partner|fiance|fiancee';

/** Hard things the older lists miss. Whole words; curly apostrophes are normalised first. */
const HEAVY: readonly RegExp[] = [
  // Loss and illness. "passed" alone after a person, never "I passed my exam".
  new RegExp(`\\b(?:${PEOPLE})(?:'s)?\\s+(?:just\\s+|recently\\s+|finally\\s+)?passed\\b`, 'i'),
  /\bpassed (?:away|on)\b/i,
  /\b(?:died|dying|death|miscarriage|stillborn)\b/i,
  /\b(?:icu|intensive care|chemo|chemotherapy|tumou?r|heart attack|life support|hospice)\b/i,
  /\b(?:had|has|having) a stroke\b/i,
  // Work and money.
  /\b(?:got|was|been|were|getting) let go\b/i,
  /\blost my job\b/i,
  /\b(?:i'?m|im|so|flat|totally|completely|dead) broke\b/i,
  /\bcan'?t (?:make|pay|afford) (?:the |my )?rent\b/i,
  /\bevict(?:ed|ion)\b/i,
  // Love.
  new RegExp(
    `\\b(?:she|he|they|my (?:${PARTNER}))\\s+(?:just\\s+)?left me\\b(?!\\s+(?:a|an|the|some|with)\\b)`,
    'i'
  ),
  /\b(?:break ?up|broke up|breaking up|dumped)\b/i,
  // Despair and self-harm.
  /\bcan'?t (?:do this|take (?:it|this)) any ?more\b/i,
  /\bcan'?t (?:go on|cope)\b/i,
  /\b(?:want(?:ed)? to|wanna|going to|gonna|ready to) die\b/i,
  /\bkill(?:ing)? myself\b/i,
  /\b(?:end it all|end my life|(?:want to|wanna|going to|gonna) end it)\b/i,
  /\b(?:hopeless|no point (?:in )?(?:living|going on))\b/i,
  /\bwhat (?:do|am) i (?:even )?(?:supposed to )?(?:do|going to do|gonna do) now\b/i,
];

/** Every pattern this check uses: the laughter blocks and the hard things above. */
export const HEAVY_MOMENT_PATTERNS: readonly RegExp[] = [...BLOCK_LAUGHTER_PATTERNS, ...HEAVY];

/** How many of the caller's latest turns count. */
export const HEAVY_LOOKBACK = 2;

function heavyTurn(text: string): boolean {
  const t = text.replace(/[‘’]/g, "'");
  return HEAVY_MOMENT_PATTERNS.some((p) => p.test(t));
}

/**
 * Whether any of the caller's last `lookback` turns (oldest first, latest last)
 * says something hard, anywhere in the turn.
 */
export function isHeavyMoment(
  utterances: readonly (string | undefined)[],
  opts: { lookback?: number } = {}
): boolean {
  const lookback = opts.lookback ?? HEAVY_LOOKBACK;
  return utterances.slice(-lookback).some((u) => !!u && heavyTurn(u));
}

/** The caller's latest turns per session, for the laughter lever, which sees one turn a reply. */
const turnsBySession = new Map<string, string[]>();
const MAX_SESSIONS = 500;

/**
 * Note the caller's turn. The same words again, or the final transcript
 * extending a partial, replace the latest turn instead of adding one.
 */
export function noteCallerTurn(sessionId: string, text: string | undefined): void {
  const said = text?.trim();
  if (!said) return;
  const turns = turnsBySession.get(sessionId) ?? [];
  const last = turns.at(-1);
  if (last !== undefined && (said === last || said.startsWith(last)))
    turns[turns.length - 1] = said;
  else turns.push(said);
  turnsBySession.delete(sessionId); // re-insert: the map's order is least recently used first
  turnsBySession.set(sessionId, turns.slice(-HEAVY_LOOKBACK));
  if (turnsBySession.size > MAX_SESSIONS) {
    const oldest = turnsBySession.keys().next().value;
    if (oldest !== undefined) turnsBySession.delete(oldest);
  }
}

/** The caller's latest noted turns, oldest first. */
export function recentCallerTurns(sessionId: string): readonly string[] {
  return turnsBySession.get(sessionId) ?? [];
}

/** Forget a session's turns (the call ended). */
export function forgetCallerTurns(sessionId: string): void {
  turnsBySession.delete(sessionId);
}
