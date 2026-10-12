/**
 * Attunement: meet the caller where they are, the way a good friend on the
 * phone does. Each reply gets one target, read from the caller's recent turns
 * (and their voice, when the reading is confident): how long, how many
 * questions, whether advice or stories of his own fit, and at what pace.
 *
 * Seth's dev call 2026-10-11: quiet and tired on a Sunday, three-word answers.
 * The director saw it ("Seth is quiet and giving short answers") but every
 * reply stayed one to three sentences, one was a life lesson ("ignoring those
 * things never makes them smaller"), five were about Ferni, and Seth had 8%
 * of the words. Nothing in the reply request knew the caller's state:
 *   - the turn shape reads only the latest words (turn-shape.ts), so "I'm still
 *     here." is a share and gets the candor, opinion and think-aloud lines;
 *   - the model's understanding has no low-energy mood (always "neutral");
 *   - pace matching skips turns under six words (pace-matching.ts), so a
 *     short-answer caller never moves it;
 *   - director notes sit mid-reminder and the turn shape, which goes last,
 *     wins when they disagree.
 * So the target goes last, after the shape, and says it outranks it.
 *
 * Offline (scripts/voice-eval/attunement, 48 frozen scenarios): see the PR.
 * ATTUNE=on for the states with a measured win, ATTUNE=all for every state;
 * off (the default) adds nothing, so requests are unchanged.
 *
 * @module agents/personas/turn-attunement
 */
import type { llm } from '@livekit/agents';

import { createLogger } from '../../utils/safe-logger.js';
import { TURN_CONTEXT_HEADER } from '../multi-agent/turn-context-header.js';
import { hardNews } from './turn-candor.js';
import { callerLaughed } from './turn-extras.js';

const log = createLogger({ module: 'Attunement' });

type Env = Record<string, string | undefined>;

export function attunementEnabled(env: Env = process.env): boolean {
  return env.ATTUNE === 'on' || env.ATTUNE === 'all';
}

export type CallerState =
  'low' | 'sad' | 'venting' | 'excited' | 'playful' | 'distracted' | 'hurried' | 'neutral';

/**
 * ATTUNE=on attunes only the state where the judge's win replicated offline:
 * tired/short callers, +0.81 to +1.10 on the Gemini judge across four runs,
 * held-out included, every 95% interval above 0. Sad, venting and excited
 * moved the same way but cleared noise in only one run each; distracted,
 * hurried and playful replies moved into band with no judge change. ATTUNE=all
 * attunes every state, for further measurement.
 */
const ON_STATES: ReadonlySet<CallerState> = new Set(['low']);

/** What the caller's voice says, when the reading is confident enough to lean on. */
export interface VoiceCue {
  arousal?: number;
  valence?: number;
  confidence?: number;
  primary?: string;
}

export interface AttuneTarget {
  state: CallerState;
  /** Most words this reply should run to; null when no cap fits (excited, neutral). */
  maxWords: number | null;
  /** Questions this reply may ask. */
  questions: 0 | 1;
  /** Advice or a view on what they should do: only when they asked. */
  advice: boolean;
  /** Stories or news of his own. */
  ownStories: boolean;
  pace: 'slow' | 'match' | 'brisk';
}

const words = (t: string): number => t.split(/\s+/).filter(Boolean).length;
const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Whole words only. Hard news is shared with candor (turn-candor.ts).
const SAD =
  /\b(?:(?:had|have) to put (?:\w+ ){0,2}down|put (?:him|her|them) to sleep|miss (?:him|her|them|it)|lonely|didn'?t get (?:into|in|it|the|picked|chosen)|rejected|heartbroken|crying|cried|would'?ve been|anniversary of|sad|grieving|it was time)\b/i;
const VENTING =
  /\b(?:vent|ugh|so done|fed up|sick of|the worst|drives me|driving me|up the wall|frustrat\w*|annoy\w*|furious|pissed|mad at|can'?t believe (?:he|she|they)|keeps (?:saying|doing|telling)|again\b.*\bagain|nobody (?:knows|cares|listens)|took credit|i just want to go home|can'?t get any worse)\b/i;
const HURRIED =
  /\b(?:(?:only|just) (?:got|have) a (?:minute|sec|second)|gotta (?:go|run)|got to go|have to (?:go|run)|running (?:late|for)|can'?t (?:talk|stay) long|in a hurry|heading out|on my way out|meeting in|in (?:two|five|ten|\d+) minutes|quick (?:one|question|thing|call)|talk (?:later|tonight|soon)|bye)\b/i;
const DISTRACTED =
  /\b(?:hold on|hang on|one sec(?:ond)?|just a sec|sorry,? what|what'?d you say|say that again|missed (?:it|that)|where were we|i'?m (?:driving|cooking|at the|half)|half (?:on|listening)|typing|merging|put that down|(?:i'?m|i am) (?:kind of|mostly) (?:here|back))\b/i;
const EXCITED =
  /\b(?:guess what|i did it|i got (?:it|the|in)|can'?t believe (?:it|i)|so (?:happy|excited)|best (?:thing|day|news)|amazing|proposed|said yes|we got|i have news|obsessed)\b/i;
const PLAYFUL = /\b(?:if you were|rate my|bet you|nemesis|plotting|career highlight)\b/i;
const TIRED =
  /\b(?:tired|wiped|fried|exhausted|beat|drained|worn out|can'?t sleep|long day|double shift|so sleepy|knackered)\b/i;
const ASKS_ADVICE =
  /\b(?:what (?:would|should|do) (?:you|i)|should i|what do you think|any (?:idea|advice|tips?)|how (?:do|should|long do) i|help me)\b/i;
const ABOUT_HIM =
  /\b(?:what about you|how about you|(?:what are|what're) you (?:up to|doing)|with you|new with you|your (?:day|week|weekend)|do you|don'?t you|are you)\b/i;

/** The caller's turns so far (their words, not pushed context notes), oldest first. */
export function callerTurns(items: readonly unknown[]): string[] {
  const turns: string[] = [];
  let open = false;
  for (const raw of items) {
    const item = raw as { type?: string; role?: string; textContent?: string };
    if (item.type !== 'message') continue;
    if (item.role === 'assistant') open = false;
    if (item.role !== 'user') continue;
    const text = item.textContent ?? '';
    if (text.startsWith(TURN_CONTEXT_HEADER)) continue;
    if (open) turns[turns.length - 1] = `${turns[turns.length - 1]} ${text}`;
    else turns.push(text);
    open = true;
  }
  return turns;
}

function confident(voice: VoiceCue | undefined): VoiceCue | undefined {
  return voice && (voice.confidence ?? 0) >= 0.5 ? voice : undefined;
}

/**
 * The caller's state from their recent turns: laughing or happy news now,
 * then hurting (sad, venting, held for a few turns as a friend would), then
 * how they are talking now (hurried, distracted, playful), then low energy from their words,
 * their short answers or a flat voice. The voice only ever breaks a tie with
 * neutral; it never overrides what they said.
 */
export function readCaller(turns: string[], voice?: VoiceCue): CallerState {
  return fromWords(turns) ?? fromVoice(voice) ?? 'neutral';
}

function fromWords(turns: string[]): CallerState | undefined {
  const now = turns.slice(-2).join(' ');
  const recent = turns.slice(-4).join(' ');
  const excited = EXCITED.test(now) || (now.match(/!/g) ?? []).length >= 2;
  // Laughing, or happy news with tears in it, is not grief.
  if (callerLaughed(now)) return 'playful';
  if (excited && !hardNews(now)) return 'excited';
  if (hardNews(recent) || SAD.test(recent)) return 'sad';
  if (VENTING.test(turns.slice(-3).join(' '))) return 'venting';
  if (HURRIED.test(now)) return 'hurried';
  if (DISTRACTED.test(now)) return 'distracted';
  if (PLAYFUL.test(now)) return 'playful';
  const short = turns.length >= 2 && median(turns.slice(-3).map(words)) <= 5;
  return TIRED.test(recent) || short ? 'low' : undefined;
}

function fromVoice(voice: VoiceCue | undefined): CallerState | undefined {
  const v = confident(voice);
  if (!v) return undefined;
  if (v.primary === 'sad') return 'sad';
  const arousal = v.arousal ?? 0;
  if (arousal <= -0.35) return 'low';
  return arousal >= 0.45 && (v.valence ?? 0) >= 0.2 ? 'excited' : undefined;
}

/** The target for this reply. `askedLast`: Ferni's previous reply asked a question. */
export function targetFor(state: CallerState, turns: string[], askedLast: boolean): AttuneTarget {
  const said = turns[turns.length - 1] ?? '';
  const wantsAdvice = ASKS_ADVICE.test(said);
  const own = ABOUT_HIM.test(said);
  const oneIfNoneLast: 0 | 1 = askedLast ? 0 : 1;
  switch (state) {
    case 'low': {
      const typical = median(turns.slice(-3).map(words));
      const maxWords = Math.min(15, Math.max(8, Math.round(2 * typical) + 6));
      return {
        state,
        maxWords,
        questions: oneIfNoneLast,
        advice: false,
        ownStories: own,
        pace: 'slow',
      };
    }
    case 'distracted':
      return { state, maxWords: 12, questions: 0, advice: false, ownStories: false, pace: 'match' };
    case 'hurried':
      return {
        state,
        maxWords: 15,
        questions: 0,
        advice: wantsAdvice,
        ownStories: false,
        pace: 'brisk',
      };
    case 'sad':
      return {
        state,
        maxWords: 30,
        questions: oneIfNoneLast,
        advice: false,
        ownStories: false,
        pace: 'slow',
      };
    case 'venting':
      return {
        state,
        maxWords: 35,
        questions: oneIfNoneLast,
        advice: wantsAdvice,
        ownStories: false,
        pace: 'match',
      };
    case 'excited':
      return {
        state,
        maxWords: null,
        questions: 1,
        advice: false,
        ownStories: false,
        pace: 'match',
      };
    case 'playful':
      return { state, maxWords: 25, questions: 1, advice: false, ownStories: true, pace: 'brisk' };
    default:
      return { state, maxWords: null, questions: 1, advice: true, ownStories: true, pace: 'match' };
  }
}

const READ: Record<Exclude<CallerState, 'neutral'>, string> = {
  low: "they're low-key and giving short answers",
  sad: "they're hurting",
  venting: "they're frustrated and getting it off their chest",
  excited: "they're excited about their news",
  playful: "they're being playful",
  distracted: "they're distracted, doing something else while you talk",
  hurried: "they're short on time",
};

const HOW: Record<Exclude<CallerState, 'neutral'>, string> = {
  low: 'gentle and unhurried, leave them room',
  sad: 'gentle and present, about the specific thing they said, no silver linings',
  venting: 'stay on their side about the specific thing, reflect it rather than fix it',
  excited: 'match their energy and be glad about the specific thing, nothing about yourself',
  playful: 'play along, quick and light',
  distracted: 'easy to half-hear, nothing that needs an answer',
  hurried: 'get to the point and let them go warmly',
};

/** The target as one line for the end of the reminder; '' for a neutral caller. */
export function attunementLine(t: AttuneTarget, turns: string[]): string {
  if (t.state === 'neutral') return '';
  const parts = [t.maxWords !== null ? `at most ${t.maxWords} words` : '', HOW[t.state]];
  if (!t.advice) parts.push('no advice, lessons or sayings about life');
  else if (t.state === 'venting' || t.state === 'hurried')
    parts.push('they asked, so give your honest take in a sentence, one idea, not a list');
  if (!t.ownStories) parts.push('no stories or news of your own');
  else if (t.state === 'low') parts.push('they asked about you: one short sentence about yourself');
  parts.push(t.questions === 0 ? 'no question' : 'at most one easy question');
  const said = words(turns[turns.length - 1] ?? '');
  return (
    `[Meet them where they are: ${READ[t.state]} (${said} ${said === 1 ? 'word' : 'words'} just now). ` +
    `This reply: ${parts.filter(Boolean).join('; ')}. This outranks any length or extras above.]`
  );
}

const lastSaid = new WeakMap<object, string>();

/**
 * ATTUNE=on: this reply's attunement line for the end of the reminder
 * (turn-request.ts), or ''. None with crisis guidance (careful), where the
 * crisis reply decides its own shape.
 */
export function attunementNote(
  chatCtx: llm.ChatContext,
  session: object,
  options: { careful?: boolean; env?: Env } = {}
): string {
  if (!attunementEnabled(options.env) || options.careful) return '';
  const turns = callerTurns(chatCtx.items);
  if (turns.length === 0) return '';
  const { userData } = session as { userData?: { voiceEmotion?: VoiceCue } };
  const state = readCaller(turns, userData?.voiceEmotion);
  const env = options.env ?? process.env;
  if (env.ATTUNE !== 'all' && !ON_STATES.has(state)) return '';
  const target = targetFor(state, turns, ferniAskedLast(chatCtx.items));
  const said = turns[turns.length - 1];
  // Preemptive and final requests for one turn log once.
  if (lastSaid.get(session) !== said) {
    lastSaid.set(session, said);
    log.info({ ...target, callerWords: words(said) }, 'ATTUNE');
  }
  return attunementLine(target, turns);
}

function ferniAskedLast(items: readonly unknown[]): boolean {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i] as { type?: string; role?: string; textContent?: string };
    if (item.type === 'message' && item.role === 'assistant')
      return /\?/.test(item.textContent ?? '');
  }
  return false;
}
