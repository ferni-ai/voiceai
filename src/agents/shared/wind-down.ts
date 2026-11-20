/**
 * Wind-down lines: the caller is wrapping up without a goodbye word. "Thanks,
 * man. I'll call him tonight", "Thanks. I needed that", "night". The goodbye
 * read (goodbye-phrases.ts callerSaysGoodbye) misses these, so the goodbye note
 * never fired and Ferni opened a new topic with a feelings question (#3197).
 *
 * This read only widens the goodbye NOTE (happy-exits.ts). It never ends a
 * call: the farewell watcher still waits for a goodbye.
 *
 * A wind-down is a whole turn made only of wind-down clauses, whole words:
 * - a goodnight on its own ("night"), or
 * - two signals among thanks, appreciation ("that helps", "I needed that") and
 *   a plan ("I'll call him tonight"), or a closing thanks ("thanks for
 *   listening"), which counts as both.
 * Acks ("ha", "okay"), a name after a thanks ("thanks, Sam") and "man" may sit
 * around them. Anything else in the turn ("but actually", "night shift was
 * rough", "thanks for asking"), a question, or any risk (farewell-risk.ts)
 * makes it not a wind-down.
 *
 * SIGNOFF_READ_WIDE=on turns it on (off by default).
 *
 * @module agents/shared/wind-down
 */
import { flagOn, type Env } from '../../config/env-flag.js';
import { scoreCrisisLanguage } from '../../services/safety/index.js';
import { farewellRisk } from './farewell-risk.js';
import { clauseWords } from './goodbye-phrases.js';

const MAX_CHARS = 200;

const cross = (heads: string[], tails: string[]): string[] =>
  heads.flatMap((h) => tails.map((t) => (t ? `${h} ${t}` : h)));

const THANKS_BASE = ['thanks', 'thank you', 'thank u', 'many thanks'];
const THANKS = new Set([
  ...cross(THANKS_BASE, ['', 'so much', 'a lot', 'a ton', 'again', 'so much again']),
  ...cross(
    ['appreciate', 'i appreciate', 'really appreciate', 'i really appreciate'],
    ['it', 'that', 'you']
  ),
]);
/** A thanks that closes a talk: "thanks for listening". Not "thanks for asking". */
const CLOSING_THANKS = new Set(
  cross(cross(THANKS_BASE, ['', 'so much', 'again']), [
    'for listening',
    'for listening to me',
    'for hearing me out',
    'for letting me vent',
    'for talking',
    'for talking it through',
    'for talking this through',
    'for the talk',
    'for the chat',
    'for the help',
    'for your help',
    'for all the help',
    'for helping',
    'for helping me',
    'for the advice',
  ])
);
/** Words dropped before reading appreciation: "that actually helps" is "that helps". */
const SOFTENERS = new Set(['really', 'actually', 'totally', 'honestly', 'genuinely', 'just', 'so']);
const APPRECIATION = new Set([
  ...cross(['that', 'this'], ['helps', 'helped', 'helps a lot', 'helped a lot', 'was helpful']),
  ...["that's helpful", 'thats helpful', 'that is helpful', 'i needed that', 'needed that'],
  ...['i needed to hear that', "that's what i needed", 'thats what i needed'],
  ...['that was nice', 'this was nice', 'this was good', 'that was good', 'good talk', 'good chat'],
]);
const GOODNIGHTS = new Set(['night', 'nite', 'night night', 'nighty night']);
/** A plan they are off to: "I'll call him tonight", "I'm gonna try that". Never "I'll be ...". */
const PLAN_OPENERS = [
  "i'll",
  'ill',
  'i will',
  "i'm gonna",
  'im gonna',
  "i'm going to",
  'im going to',
];
const PLAN_VERBS = new Set([
  ...['call', 'text', 'try', 'look', 'check', 'talk', 'think', 'give', 'ask', 'tell', 'email'],
  ...['message', 'write', 'start', 'reach', 'follow', 'figure', 'see', 'let', 'go'],
]);
const MAX_PLAN_WORDS = 8;
/** Lead-ins that may open any clause: "ha, okay", "yeah that helps". */
const ACKS = new Set([
  ...['ha', 'haha', 'oh', 'ok', 'okay', 'alright', 'all', 'right', 'well', 'cool'],
  ...['great', 'perfect', 'anyway', 'yeah', 'yep', 'so'],
]);
/** How they may address Ferni at the end of a clause: "thanks, man". */
const ADDRESS = new Set(['man', 'dude', 'buddy', 'bro', 'friend', 'ferni']);
/** A one-word clause after a thanks is a name ("thanks, Sam") unless it carries the talk on. */
const CONTINUERS = new Set([
  ...['but', 'and', 'so', 'or', 'though', 'actually', 'wait', 'also', 'um', 'uh'],
  ...['because', 'cause', 'if', 'except', 'however', 'anyway', 'just', 'still'],
]);

type Kind = 'ack' | 'thanks' | 'closing' | 'appreciation' | 'plan' | 'goodnight' | 'name';

function isPlan(words: readonly string[]): boolean {
  if (words.length > MAX_PLAN_WORDS) return false;
  return PLAN_OPENERS.some((opener) => {
    const n = opener.split(' ').length;
    return words.slice(0, n).join(' ') === opener && PLAN_VERBS.has(words[n] ?? '');
  });
}

/** The clause without its lead-in acks and a trailing "man": "okay thanks man" is "thanks". */
function coreOf(clause: readonly string[]): string[] {
  let from = 0;
  while (from < clause.length && ACKS.has(clause[from] ?? '')) from++;
  let to = clause.length;
  while (to > from && ADDRESS.has(clause[to - 1] ?? '')) to--;
  return clause.slice(from, to);
}

/** A one-word clause right after a thanks: "thanks, Sam". */
function isName(clause: readonly string[], previous: Kind | undefined): boolean {
  const word = clause[0] ?? '';
  if (clause.length !== 1 || !/^[a-z]+$/.test(word) || CONTINUERS.has(word)) return false;
  return previous === 'thanks' || previous === 'closing';
}

function kindOf(clause: readonly string[], previous: Kind | undefined): Kind | null {
  const words = coreOf(clause);
  const said = words.join(' ');
  if (!said) return 'ack';
  if (GOODNIGHTS.has(said)) return 'goodnight';
  if (THANKS.has(said)) return 'thanks';
  if (CLOSING_THANKS.has(said)) return 'closing';
  if (APPRECIATION.has(words.filter((w) => !SOFTENERS.has(w)).join(' '))) return 'appreciation';
  if (isPlan(words)) return 'plan';
  return isName(clause, previous) ? 'name' : null;
}

/**
 * "tonight" and "soon" are risk words on their own (crisis-agreement.ts), so "I'll call him
 * tonight" read as risk. Only a plan clause can hold them here, as its time; the crisis read
 * still sees the whole line ("I'll end it tonight" is never a plan: no such verb, and crisis).
 */
const PLAN_TIMES = /\b(?:tonight|soon)\b/gi;

/** Crisis language (crisis-guard.ts, as farewell-risk.ts reads it) or any farewell risk. */
function risky(text: string): boolean {
  const crisis = scoreCrisisLanguage(text);
  return crisis.isCrisis || crisis.severity > 0.3 || farewellRisk(text.replace(PLAN_TIMES, ' '));
}

/** The caller's turn is a wind-down with no goodbye word (see the module doc). */
function callerWindsDown(text: string): boolean {
  if (text.length > MAX_CHARS || text.trim().endsWith('?')) return false;
  const kinds = new Set<Kind>();
  let previous: Kind | undefined;
  for (const clause of clauseWords(text)) {
    const kind = kindOf(clause, previous);
    if (!kind) return false;
    kinds.add(kind);
    previous = kind;
  }
  const signals =
    (kinds.has('thanks') ? 1 : 0) +
    (kinds.has('closing') ? 2 : 0) +
    (kinds.has('appreciation') ? 1 : 0) +
    (kinds.has('plan') ? 1 : 0);
  return (kinds.has('goodnight') || signals >= 2) && !risky(text);
}

/** SIGNOFF_READ_WIDE=on and the caller is winding down: the goodbye note applies. */
export function windingDown(said: string, env: Env = process.env): boolean {
  return flagOn('SIGNOFF_READ_WIDE', env) && callerWindsDown(said);
}
