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
 * three turns (the hard one and the two after it), and lists the hard things, mishaps left out. Suicidal and
 * self-harm language is also scored by the crisis guard's own detector
 * (services/safety), so the two sides never disagree on what is a crisis.
 * It errs toward heavy: a missed laugh costs nothing, a laugh at grief costs
 * the friendship. Light idioms ("dying laughing", "my phone died", "crying
 * laughing") are taken out before the hard words are read.
 *
 * @module speech/adaptive-ssml/heavy-moment
 */

import { scoreCrisisLanguage } from '../../services/safety/index.js';
import { BLOCK_LAUGHTER_PATTERNS } from './contextual-laughter.js';

const PEOPLE =
  'mom|mum|mother|dad|father|grandma|grandmother|granny|nana|grandpa|grandfather|papa|brother|sister|son|daughter|wife|husband|aunt|auntie|uncle|cousin|nephew|niece|friend|best friend|bestie|boyfriend|girlfriend|partner|fiance|fiancee|coworker|co-worker|colleague|neighbor|neighbour|teacher|baby|dog|cat|pet|puppy|kitty';
const PARTNER = 'wife|husband|girlfriend|boyfriend|partner|fiance|fiancee';
const PET = 'dog|cat|pet|puppy|kitten|kitty|horse|bunny|rabbit';
/** What follows "passed" when nobody died: "she passed her exam", "he passed me the salt". */
const PASSED_OBJECT =
  'my|her|his|their|our|your|the|a|an|me|him|them|it|us|out|by|over|through|up|on|along|around|this|that';

/** Light idioms, taken out before the hard words are read: none of these is grief. */
const LIGHT_IDIOMS: readonly RegExp[] = [
  /\b(?:dying|died|dead) (?:of )?laugh(?:ing|ter)\b/gi,
  /\bi (?:almost|nearly|literally) died\b/gi,
  /\b(?:phone|battery|laptop|computer|car|tv|wifi|internet|charger|headphones|airpods|controller|plant|plants|flowers|basil|game|character|server)(?:'s)?\s+(?:just\s+|finally\s+|totally\s+)?(?:died|dead|is dead)\b/gi,
  /\b(?:crying|cried|cry) laughing\b|\blaughing so hard i (?:cried|was crying)\b/gi,
  /\b(?:tears of joy|happy tears)\b/gi,
  /\bfired up\b/gi,
  /\bnot (?:exactly )?(?:brain|rocket) surgery\b/gi,
];

/** Hard things the older lists miss. Whole words; curly apostrophes are normalised first. */
const HEAVY: readonly RegExp[] = [
  // Loss. "passed" only after a person and with no object: never "I passed my exam".
  new RegExp(
    `\\b(?:${PEOPLE})(?:'s)?\\s+(?:just\\s+|recently\\s+|finally\\s+)?passed\\b(?!\\s+(?:${PASSED_OBJECT})\\b)`,
    'i'
  ),
  /\bpassed away\b/i,
  /\bpassed on\b(?!\s+(?:the|it|that|this|a|an|my|his|her|their|to)\b)/i,
  /\b(?:died|dying|death|miscarriage|miscarried|stillborn)\b/i,
  new RegExp(`\\blost (?:my|the|our|her|his|their) (?:${PEOPLE}|pregnancy)\\b`, 'i'),
  new RegExp(`\\b(?:${PEOPLE})(?:\\s+is|'s) gone\\b(?!\\s+(?:to|for|out|on|off)\\b)`, 'i'),
  new RegExp(`\\bput (?:my|our|the|her|his) (?:${PET}) (?:down|to sleep)\\b`, 'i'),
  /\b(?:we|i|they) buried\b/i,
  new RegExp(`\\bmiss(?:ing)? (?:him|her|them|my (?:${PEOPLE}))\\b`, 'i'),
  // Illness.
  /\b(?:icu|intensive care|chemo|chemotherapy|tumou?r|heart attack|life support|hospice)\b/i,
  /\b(?:leukemia|leukaemia|dementia|alzheimer'?s|biopsy|surgery|relapsed?|relapsing|rehab|overdos(?:e|ed|ing))\b/i,
  /\bstage (?:4|iv|four)\b/i,
  /\b(?:found|felt|has|have|had) a lump\b|\ba lump in\b/i,
  /\b(?:in|at|to|from) the e\.?r\.?\b/i,
  /\b(?:had|has|having) a stroke\b/i,
  // Work and money.
  /\b(?:got|was|been|were|getting) let go\b/i,
  /\b(?:they|he|she|boss|manager|company|work|job|just|finally) (?:just )?let me go\b(?!\s+(?:grab|get|check|see|look|ask|try|do|and|to|home|early|first|now|on|with|in|out|play)\b)/i,
  /\blaid (?:me|us) off\b|\blost my job\b/i,
  /\b(?:got|been|was|were|i'?m|im) (?:sacked|canned)\b/i,
  /\b(?:foreclos\w*|debt|evict(?:ed|ion))\b/i,
  /\b(?:i'?m|im|so|flat|totally|completely|dead) broke\b/i,
  /\bcan'?t (?:make|pay|afford) (?:the |my )?rent\b/i,
  // Love.
  new RegExp(
    `\\b(?:she|he|they|my (?:${PARTNER}))\\s+(?:just\\s+)?left me\\b(?!\\s+(?:a|an|the|some|with)\\b)`,
    'i'
  ),
  /\b(?:break ?up|broke up|breaking up|dumped)\b/i,
  /\bsplit up\b(?!\s+the\b)/i,
  /\b(?:we'?re|we are|we|got|getting|are|just) separat(?:ed|ing)\b(?!\s+the\b)/i,
  /\b(?:divorc\w*|cheated|cheating on)\b/i,
  // Violence and abuse. "beats me" alone is "no idea".
  new RegExp(
    `\\b(?:he|she|they|my (?:${PARTNER}|dad|mom|father|mother|stepdad|stepmom|brother|boss)) (?:hit|hits|beat|beats|punched|slapped|kicked|choked|hurts?) me\\b(?!\\s+up\\b)`,
    'i'
  ),
  /\b(?:suicid\w*|abus\w*|assault\w*|rap(?:e|ed|ist)|molest\w*)\b/i,
  // Despair and self-harm.
  /\bcan'?t (?:do this|take (?:it|this)) any ?more\b/i,
  /\bcan'?t (?:go on|cope)\b/i,
  /\b(?:want(?:ed)? to|wanna|going to|gonna|ready to) die\b/i,
  /\bdon'?t (?:want to|wanna) (?:live|be alive|be here|exist)\b/i,
  /\bkill(?:ing)? myself\b|\bkms\b|\bunaliv\w*/i,
  /\b(?:end it all|end my life|(?:want to|wanna|going to|gonna) end it)\b/i,
  /\b(?:hopeless|no point)\b/i,
  /\bbetter off without me\b/i,
  /\b(?:want(?:ed)? to|wanna|gonna|going to|ready to|about to) give up\b|\bgiv(?:e|ing) up on (?:life|everything|myself)\b/i,
  /\b(?:cut|cutting|hurt|hurting|burned|burning) myself\b/i,
  /\btook (?:too many|a bunch of|all (?:my|the)) (?:pills|meds|tablets)\b/i,
  /\b(?:cried|crying|sobbing|sobbed|in tears)\b/i,
  /\bwhat (?:do|am) i (?:even )?(?:supposed to )?(?:do|going to do|gonna do) now\b/i,
];

/** "ER" said as the emergency room: only in capitals, "er" is a filler. */
const ER = /\bE\.?R\b/;

/** Every pattern this check uses: the laughter blocks and the hard things above. */
export const HEAVY_MOMENT_PATTERNS: readonly RegExp[] = [...BLOCK_LAUGHTER_PATTERNS, ...HEAVY];

/**
 * How many of the caller's latest turns count: hard news and the two turns
 * after it. At 2, "my dad died last week", "haha anyway", "lol okay" got a
 * laugh on the third (verified on Ferni, Maya and Jordan, 2026-10-17).
 */
export const HEAVY_LOOKBACK = 3;

function heavyTurn(text: string): boolean {
  if (ER.test(text)) return true;
  let t = text.replace(/[‘’]/g, "'");
  for (const idiom of LIGHT_IDIOMS) t = t.replace(idiom, ' ');
  return HEAVY_MOMENT_PATTERNS.some((p) => p.test(t)) || scoreCrisisLanguage(t).severity > 0;
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

interface NotedTurn {
  text: string;
  turn?: number | string;
}

/** The caller's latest turns per session, for the laughter lever, which sees one turn a reply. */
const turnsBySession = new Map<string, NotedTurn[]>();
const MAX_SESSIONS = 500;

/**
 * Whether `said` is the latest noted turn again, not a new one. With a turn id,
 * only the same turn (a partial and its final) is merged. Without one, a
 * transcript extending the last is merged. Neither ever drops a heavy turn
 * for light words that don't carry it on: "she left me" then "she left me a
 * voicemail lol" are two turns, and so are "my dad died" then a fresh
 * segment "haha anyway" of the same turn.
 */
function sameTurn(last: NotedTurn, said: string, turn: number | string | undefined): boolean {
  if (said === last.text) return true;
  const extends_ = said.startsWith(last.text);
  const keepsHeavy = !heavyTurn(last.text) || heavyTurn(said);
  if (turn !== undefined && last.turn !== undefined)
    return turn === last.turn && (keepsHeavy || extends_);
  return extends_ && keepsHeavy;
}

/**
 * Note the caller's turn. The same words again, or the same turn's final
 * transcript after its partial, replace the latest turn instead of adding one.
 */
export function noteCallerTurn(
  sessionId: string,
  text: string | undefined,
  turn?: number | string
): void {
  const said = text?.trim();
  if (!said) return;
  const turns = turnsBySession.get(sessionId) ?? [];
  const last = turns.at(-1);
  if (last !== undefined && sameTurn(last, said, turn))
    turns[turns.length - 1] = { text: said, turn: turn ?? last.turn };
  else turns.push({ text: said, turn });
  turnsBySession.delete(sessionId); // re-insert: the map's order is least recently used first
  turnsBySession.set(sessionId, turns.slice(-HEAVY_LOOKBACK));
  if (turnsBySession.size > MAX_SESSIONS) {
    const oldest = turnsBySession.keys().next().value;
    if (oldest !== undefined) turnsBySession.delete(oldest);
  }
}

/** The caller's latest noted turns, oldest first. */
export function recentCallerTurns(sessionId: string): readonly string[] {
  return (turnsBySession.get(sessionId) ?? []).map((t) => t.text);
}

/** Forget a session's turns (the call ended). */
export function forgetCallerTurns(sessionId: string): void {
  turnsBySession.delete(sessionId);
}
