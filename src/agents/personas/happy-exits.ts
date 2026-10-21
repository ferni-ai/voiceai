/**
 * Happy exits: when the caller says goodbye, Ferni is glad they are off to
 * their life and lets them go. Now and then he names what they are heading to
 * ("dinner with your sister, good, go"), and the next call may ask how it went.
 *
 * Companion apps do the opposite to keep people talking: in about 37% of
 * goodbyes they guilted the user, used fear of missing out or ignored the exit
 * (De Freitas et al., Harvard Business School, 2025). Ferni's goodbye has no
 * question, no reason to stay and no guilt.
 *
 * He names the plan only when the call mentioned one (a meal, an errand, a
 * person they are seeing), on at most NAME_ODDS of goodbyes, and never after
 * a heavy call: hard news or venting anywhere on the call (turn-candor.ts,
 * turn-extras.ts), or a careful reading of this turn. The plan is kept as a
 * commitment so the next call's check-in can ask about it once
 * (commitment-follow-up.ts; asked only with COACH_FOLLOW_THROUGH=on).
 *
 * HAPPY_EXITS=on turns it on (off by default).
 *
 * SHORT_GOODBYE=on (off by default) gives every call the same cap: once the
 * caller has said bye, Ferni's goodbye is one or two short sentences. On prod
 * one goodbye ran four sentences, about 17 s, after the caller's "all right,
 * bye". People close in a line or two once the other person has said bye.
 * "Said bye" is call-farewell.ts's caller goodbye, a goodbye in a closing
 * position ("okay, bye"), not "say bye to grandma for me". HAPPY_EXITS's note,
 * when it fires, already has the cap and wins.
 *
 * @module agents/personas/happy-exits
 */
import type { llm } from '@livekit/agents';

import { flagOn, type Env } from '../../config/env-flag.js';
import { rememberGoodbyePlan } from '../../services/superhuman/commitment-follow-up.js';
import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-intelligence.js';
import { callerSaysGoodbye } from '../shared/call-farewell.js';
import { hardNews } from './turn-candor.js';
import { callerVenting } from './turn-extras.js';
import { isMemberIdentity } from '../../services/identity/member-identity.js';

const log = createLogger({ module: 'HappyExits' });

export function happyExitsEnabled(env: Env = process.env): boolean {
  return flagOn('HAPPY_EXITS', env);
}

export function shortGoodbyeEnabled(env: Env = process.env): boolean {
  return flagOn('SHORT_GOODBYE', env);
}

export const SHORT_GOODBYE_NOTE =
  "They've said goodbye. Say yours in one or two short sentences, then stop: no recap, no new topic, no question.";

/** SHORT_GOODBYE's cap for this reply, or '' (flag off, or the caller hasn't said bye). */
export function shortGoodbyeNote(said: string, env: Env = process.env): string {
  return shortGoodbyeEnabled(env) && callerSaysGoodbye(said) ? SHORT_GOODBYE_NOTE : '';
}

/** A goodbye note may be added: HAPPY_EXITS's, or SHORT_GOODBYE's cap. */
export function goodbyeNoteOn(env: Env = process.env): boolean {
  return happyExitsEnabled(env) || shortGoodbyeEnabled(env);
}

/** At most this share of goodbyes name what they are off to. */
export const NAME_ODDS = 0.2;

/**
 * The caller is wrapping up. "have to go to the dentist tomorrow" is a plan,
 * not a goodbye, so "go" followed by "to" or "of" doesn't count, except to bed
 * or to sleep. Whole words only.
 */
const GOODBYE =
  /\b(?:bye|goodbye|good ?night|(?:gotta|got to|have to|need to|i should) (?:go|run|get going|head out|hop off)(?!\s+(?:to|of)\b(?!\s+(?:bed|sleep)\b))|i'?ll let you go|talk (?:to you )?(?:later|soon|tomorrow)|catch you later|see (?:ya|you) (?:later|soon|tomorrow)|signing off|heading out|i'?m off)\b/i;

export function sayingGoodbye(text: string): boolean {
  return GOODBYE.test(text);
}

/** A sentence about what's next for them ("gotta go", "tonight", "I'm meeting"). */
const PLAN_CUE =
  /\b(?:going to|gonna|heading|off to|about to|have to|gotta|got to|need to|on my way|tonight|later|this (?:afternoon|evening)|in a (?:bit|minute|few)|i'?m (?:having|making|cooking|grabbing|getting|meeting|seeing|visiting|picking|taking|off)|we'?re (?:having|making|grabbing|getting|meeting|seeing|going|off))\b/i;
const NEGATED = /\b(?:don'?t|didn'?t|won'?t|can'?t|not|never|no)\b/i;
const WORD = "[a-z][a-z']*";
const TAIL = `(?:\\s+(?:with|at|for)\\s+(?:(?:my|our|the|a)\\s+)?${WORD})?`;
/** Words that end a name rather than continue it ("my sister tonight", "my daughter from"). */
const STOP =
  '(?:tonight|today|tomorrow|later|now|soon|then|this|in|for|at|with|from|and|to|after|before|so|but)';
/** Who they are seeing: "my sister", "my old roommate". */
const WHO = `(?:my|our|the)\\s+(?:${WORD}\\s+(?!${STOP}\\b)(?=[a-z]))?${WORD}`;
/** The plan itself: a meal or outing, or a person or pet they are seeing to. */
const PLAN = new RegExp(
  `\\b(?:(?:dinner|lunch|breakfast|brunch|drinks|coffee|date night|a date|practice|rehearsal|class|the gym|a run|a hike|the game|a movie|a party|a meeting|an appointment|the doctor|the dentist|the airport|church|the store|groceries|errands)${TAIL}|(?:meet|meeting|see|seeing|visit|visiting|pick up|picking up|walk|walking|feed|feeding)\\s+${WHO}${TAIL})\\b`,
  'i'
);

/** The plan in the caller's words, from the latest sentence on the call that has one. */
export function mentionedPlan(callerTurns: readonly string[]): string | undefined {
  let plan: string | undefined;
  for (const turn of callerTurns) {
    for (const sentence of turn.split(/[.!?]+/)) {
      if (!PLAN_CUE.test(sentence) || NEGATED.test(sentence)) continue;
      const found = PLAN.exec(sentence);
      if (found) plan = found[0].toLowerCase().trim();
    }
  }
  return plan;
}

/** A heavy call: hard news or venting anywhere on it. */
export function heavyCall(callerTurns: readonly string[]): boolean {
  return callerTurns.some((t) => hardNews(t) || callerVenting(t));
}

/** "dinner with my sister" as Ferni would say it: "dinner with your sister". */
const yours = (plan: string): string => plan.replace(/\b(?:my|our)\b/gi, 'your');

const EXIT =
  'If they are wrapping up the call, let them go happily: be genuinely glad they are off to their life and say a warm goodbye in one or two short sentences, calmly and with no exclamation marks, then stop. ' +
  'No question of any kind (not even "okay?" or "right?"), nothing to keep them on the line, no guilt about them going. ' +
  'Never say "I\'ll miss you", "come back soon", "I\'ll be here when you need me", "you know where to find me" or anything like them.';
/** `scriptFree` (SCRIPT_FREE_REMINDER, script-free.ts): their words, but no line to say. */
const nameIt = (plan: string, scriptFree = false): string =>
  `They mentioned what they are off to (their words: "${plan}"). This time you may name it in a few glad words as you let them go${scriptFree ? '' : `, the way a friend would ("${yours(plan)}, good, go.")`}, without asking about it.`;
const SIMPLE = 'A warm, simple goodbye: nothing about what they are doing next.';
const HEAVY =
  'It has been a heavy call: a warm, simple goodbye, gentle and short, nothing about what they are doing next.';

export interface ExitInput {
  /** The caller's words this reply answers. */
  said: string;
  /** Every caller message on the call, oldest first, this one included. */
  callerTurns: readonly string[];
  /** This turn reads as venting, bad news or tender (turn-extras.ts). */
  careful: boolean;
  /** The model's reading that they are wrapping up (TURN_UNDERSTANDING). */
  wantsToEnd?: boolean;
  rng: () => number;
  /** SCRIPT_FREE_REMINDER=on (script-free.ts). */
  scriptFree?: boolean;
}

export interface Exit {
  note: string;
  /** What was decided, for the log and the tests. */
  fired: 'none' | 'heavy' | 'simple' | 'named';
  /** The plan to carry to the next call, when the goodbye is a happy one. */
  plan?: string;
}

/** The goodbye note for one reply, or none when they aren't saying goodbye or the flag is off. */
export function happyExitFor(input: ExitInput, env: Env = process.env): Exit {
  if (!happyExitsEnabled(env)) return { note: '', fired: 'none' };
  if (!sayingGoodbye(input.said) && !input.wantsToEnd) return { note: '', fired: 'none' };
  if (input.careful || heavyCall(input.callerTurns))
    return { note: `${EXIT} ${HEAVY}`, fired: 'heavy' };
  const plan = mentionedPlan(input.callerTurns);
  if (plan && input.rng() < NAME_ODDS)
    return { note: `${EXIT} ${nameIt(plan, input.scriptFree)}`, fired: 'named', plan };
  return { note: `${EXIT} ${SIMPLE}`, fired: 'simple', ...(plan && { plan }) };
}

/** Every caller message in the context, oldest first, per-turn notes aside. */
export function callerTurnsOf(chatCtx: llm.ChatContext): string[] {
  return chatCtx.items.flatMap((item) => {
    if (item.type !== 'message' || item.role !== 'user') return [];
    const text = item.textContent ?? '';
    return text && !text.startsWith(TURN_CONTEXT_HEADER) ? [text] : [];
  });
}

type Remember = (userId: string, plan: string) => Promise<unknown>;

/** Plans already kept, per call: the preemptive and final requests both see the goodbye. */
const kept = new WeakMap<object, Set<string>>();

function userIdOf(session: object): string | undefined {
  const data = (session as { userData?: unknown }).userData as
    { userId?: string; services?: { userId?: string } } | undefined;
  return data?.userId ?? data?.services?.userId;
}

/**
 * The goodbye note for this reply, keeping a mentioned plan for the next call
 * (once per call, never after a heavy one, never for an anonymous caller).
 */
export function happyExitNote(
  session: object,
  input: ExitInput,
  env: Env = process.env,
  remember: Remember = async (userId, plan) => rememberGoodbyePlan(userId, plan)
): string {
  const exit = happyExitFor(input, env);
  if (exit.fired === 'none') {
    const short = shortGoodbyeNote(input.said, env);
    if (short) log.info('SHORT_GOODBYE');
    return short;
  }
  log.info({ fired: exit.fired, planned: Boolean(exit.plan) }, 'HAPPY_EXIT');
  const userId = userIdOf(session);
  if (exit.plan && isMemberIdentity(userId)) {
    const plans = kept.get(session) ?? new Set<string>();
    kept.set(session, plans);
    if (!plans.has(exit.plan)) {
      plans.add(exit.plan);
      remember(userId, exit.plan).catch((error: unknown) =>
        log.warn({ error: String(error) }, 'Goodbye plan not kept')
      );
    }
  }
  return exit.note;
}

// QUESTION_PACE (question-pace.ts): the other late "no question" note, read where the goodbye note is.
export { questionPaceNote } from './question-pace.js';
