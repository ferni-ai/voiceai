/**
 * A caller who asks for a moment gets the moment (#3983).
 *
 * rt-1116-let-me-think, dev 2026-11-16: "Hmm. Okay, hold on. Let me think." ends
 * on a full stop, so the unfinished-turn read calls it finished
 * (unfinished-turn.ts) and the reply goes at once. The reply was a 27-word
 * question that pulled the caller off their own thought. The director saw it
 * ("Let Sam think through the pause they just asked for.") 1.1 s later, after
 * the reply was already playing.
 *
 * Holding the turn longer can't fix it: the hold is capped below the turn
 * keeper's grace (about 2.5 s), and a caller thinking takes longer than that,
 * so the same question comes, only later. What a friend does is say "sure,
 * take your time" and wait. So with PAUSE_REQUEST_WAIT=on, a turn that is
 * only a request to wait gets a note asking for a few words that give the
 * moment and no question. The note rides the attunement slot
 * (turn-attunement.ts), after the turn shape, so its "no question" wins, and
 * it reaches the preemptive request as well as the final one.
 *
 * The read is narrow on purpose. The whole turn must be a pause request: at
 * most eight words, every clause one of the pause phrases below with only
 * fillers ("okay", "hmm", "um") around it, no question mark, nothing but
 * English letters and plain punctuation. "Hold on, I don't think I can do this
 * anymore", "let me think about whether it's worth it" and "wait, I need to
 * tell you something" don't match. On top of that the line must pass the
 * farewell and crisis read as it was said (farewell-risk.ts, which runs
 * detectCrisis); a read that throws counts as risk. That read counts "hang"
 * as risk content, so "hang on" is left out of the phrases rather than taken
 * out of the line before the read. A turn held for crisis
 * risk never gets the note (exits-held.ts, via the attunement's `careful`).
 *
 * @module agents/personas/pause-request
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { farewellRisk } from '../shared/farewell-risk.js';
import { createLogger } from '../../utils/safe-logger.js';

const log = createLogger({ module: 'PauseRequest' });

/** The longest turn read as a pause request ("Okay, hold on, let me think about that."). */
const PAUSE_REQUEST_MAX_WORDS = 8;

const PAUSE_REQUEST_NOTE =
  '[They asked for a moment to think. Give it to them: a few warm words at most, ' +
  'such as "Sure, take your time." Ask no question, add nothing else, and let them come back to you.]';

const UNIT = '(?:sec|second|minute|moment)';
/** One clause that is a request to wait, fillers already taken off. */
const PAUSE_CLAUSE = new RegExp(
  `^(?:${[
    `hold on(?: (?:a|one) ${UNIT})?`,
    `wait(?: (?:a|one) ${UNIT})?`,
    `(?:give me|gimme)(?: a| one)? ${UNIT}`,
    `(?:one|a) ${UNIT}`,
    `(?:let me|lemme) think(?: about (?:it|that)| for a ${UNIT})?`,
    '(?:let me|lemme) see',
    `i need a ${UNIT}`,
  ].join('|')})$`
);

/** Words around a pause phrase that add nothing to it. */
// prettier-ignore
const FILLERS = new Set([
  'ok', 'okay', 'oh', 'ah', 'so', 'well', 'alright', 'right', 'yeah', 'sure', 'just',
  'please', 'actually',
]);
const isFiller = (w: string): boolean => FILLERS.has(w) || /^(?:h?m+|u+[hm]+|e+r+m*)$/.test(w);

/** Only English letters, spaces and plain punctuation: anything else is not read. */
const PLAIN_LINE = /^[a-z\s,.;:!'’-]+$/i;

const tokens = (clause: string): string[] =>
  clause
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z]+/)
    .filter(Boolean);

/** The clause with its leading and trailing fillers taken off ("okay, hold on please"). */
function core(ws: readonly string[]): string {
  let start = 0;
  let end = ws.length;
  while (start < end && isFiller(ws[start])) start++;
  while (end > start && isFiller(ws[end - 1])) end--;
  return ws.slice(start, end).join(' ');
}

/** True when the whole turn is a request to wait and nothing else, with no risk in it. */
function isPauseRequest(said: string): boolean {
  const line = said.trim();
  if (!line || !PLAIN_LINE.test(line)) return false;
  if (tokens(line).length > PAUSE_REQUEST_MAX_WORDS) return false;
  const clauses = line.split(/[,.;:!]+/).map((c) => core(tokens(c)));
  if (!clauses.some((c) => PAUSE_CLAUSE.test(c))) return false;
  if (!clauses.every((c) => c === '' || PAUSE_CLAUSE.test(c))) return false;
  try {
    return !farewellRisk(line); // the line as said, nothing taken out
  } catch (error) {
    log.warn({ error: String(error) }, 'PAUSE_REQUEST: risk read failed, no note');
    return false;
  }
}

/** PAUSE_REQUEST_WAIT=on: the note for a turn that only asks for a moment; '' otherwise. */
export function pauseRequestNote(said: string | undefined, env: Env = process.env): string {
  if (!said || !flagOn('PAUSE_REQUEST_WAIT', env) || !isPauseRequest(said)) return '';
  log.info({ callerWords: tokens(said).length }, 'PAUSE_REQUEST_WAIT');
  return PAUSE_REQUEST_NOTE;
}
