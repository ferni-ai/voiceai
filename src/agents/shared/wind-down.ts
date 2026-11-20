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
 * rough", "thanks for asking"), a question, or any risk makes it not a
 * wind-down. Risk fails closed (risky below): the only farewell risk forgiven is
 * the time word of a plan to call or text someone named ("I'll call him tonight").
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
/**
 * Plan verbs. No "go", "let", "see", "start", "tell", "check", "write" or "give": each
 * makes a veiled farewell ("I'll go away", "I'll let go", "I'll see my dad soon", "I'll
 * write my note"), found by the PR #4271 verifier.
 */
const CONTACT_VERBS = ['call', 'text', 'ring', 'phone', 'message', 'email', 'facetime'];
const PLAN_VERBS = new Set([...CONTACT_VERBS, 'try', 'look', 'talk', 'think', 'ask', 'figure']);
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

const KIN = [
  ...['mom', 'mum', 'dad', 'brother', 'sister', 'son', 'daughter', 'wife', 'husband'],
  ...['partner', 'boyfriend', 'girlfriend', 'friend', 'boss', 'grandma', 'grandpa'],
  ...['aunt', 'uncle', 'cousin', 'parents', 'kids'],
];
/**
 * The one clause shape whose time word may clear the risk read: a plan to call or text
 * someone named, the whole clause. "I'll call him tonight", "I'm gonna text Sam soon",
 * "I'll call my brother later". The name must be capitalised, and is never a word for God.
 */
const PLAN_TIME = ' (?:tonight|soon|later|tomorrow|in the morning)';
const OPENER = String.raw`(?:[Ii]'?ll|[Ii] will|[Ii]'?m (?:going to|gonna))`;
const CONTACT = `(?:${CONTACT_VERBS.join('|')}|FaceTime)`;
const NAMED = String.raw`(?:him|her|them|my (?:${KIN.join('|')})|(?!(?:God|Jesus|Lord|Heaven)\b)[A-Z][a-z]+)`;
const CONTACT_PLAN = new RegExp(`^${OPENER} ${CONTACT} ${NAMED}(?:${PLAN_TIME})?$`);
const TRAILING_TIME = new RegExp(`${PLAN_TIME}$`);

/**
 * Risk fails closed: crisis language (crisis-guard.ts, as farewell-risk.ts reads it), or any
 * farewell risk on the raw line. The one exception: "tonight" and "soon" are risk words on
 * their own (crisis-agreement.ts), so "Thanks, man. I'll call him tonight" read as risk. When
 * the only thing farewellRisk flags is the time word ending a CONTACT_PLAN clause, it is not
 * risk. Taking "tonight" out of any other clause let "I'll go away tonight" through (#4271).
 */
function risky(text: string): boolean {
  const crisis = scoreCrisisLanguage(text);
  if (crisis.isCrisis || crisis.severity > 0.3) return true;
  if (!farewellRisk(text)) return false;
  const line = text.replace(/[’‘]/g, "'");
  const plans = line
    .split(/[.!?,;:]/)
    .map((c) => c.trim())
    .filter((c) => CONTACT_PLAN.test(c));
  if (plans.length === 0) return true;
  const untimed = plans.reduce((t, plan) => t.replace(plan, plan.replace(TRAILING_TIME, '')), line);
  return farewellRisk(untimed);
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
