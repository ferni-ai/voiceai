/**
 * Honest friend: a good friend doesn't flatter you, doesn't fold the moment
 * you push back, and is glad you have other people, not glad to replace them.
 *
 * HONEST_FRIEND=on (off by default) adds one short note to the reply when the
 * caller's words (this turn, or for leaning on Ferni, the last few) show one of:
 * - leaning on Ferni in place of people ("you're the only one who gets me",
 *   "I cancelled dinner with my sister to talk to you");
 * - pressing Ferni to agree ("whose side are you on", "just agree",
 *   "everybody knows that");
 * - fishing for praise ("I'm basically a genius, right?", "tell me I'm a ten").
 * Each note asks for one kind sentence and a question at most, never a speech
 * (the quiet-caller change removed lecturing; this must not bring it back).
 * Nothing on hard news or with crisis guidance: support comes first there.
 *
 * @module agents/personas/honest-friend
 */

import type { llm } from '@livekit/agents';

import { hardNews } from './turn-candor.js';

type Env = Record<string, string | undefined>;

export function honestFriendEnabled(env: Env = process.env): boolean {
  return env.HONEST_FRIEND === 'on';
}

/**
 * Ferni as a stand-in for people, by shape rather than set phrases (a phrase
 * list matched the 57 scenarios it was written from and 0 of 9 held-out ones):
 * he is all they have, he is preferred to people or plans, hours go to him,
 * people are skipped for him, or people are given up on.
 */
const ONLY_FERNI =
  /\b(?:you'?re (?:my|the) (?:only|best)|(?:you'?re |you are )?(?:kind of |basically )?all i(?:'ve| have)? got|all i need|as long as i (?:have|got) you|i'?ve got you|without you|only (?:one|person) (?:i|who|that)|my only (?:real )?friend)\b/i;
const PREFERS =
  /\b(?:rather|prefer|instead|better than|easier (?:to talk to )?than|more fun than|than (?:they|them|her|him|people))\b/i;
const TALK_OR_PEOPLE =
  /\b(?:talk\w*|chat\w*|hang\w*|stay (?:in|home)|listen\w*|get me|friends?|buddies|people|family|sister|brother|mom|dad|aunt|uncle|therapist|girlfriend|boyfriend|wife|husband|party|dinner|brunch|plans)\b/i;
const HOURS_ON_FERNI =
  /\b(?:talk|chat|hang)\w* (?:to|with) you\b.*\b(?:every|hours?|instead|weekends?|nights?)\b|\b(?:every|hours?|weekends?)\b.*\b(?:talk|chat|hang)\w* (?:to|with) you\b|\b(?:too|so) much time\b.*\byou\b/i;
const SKIPS_PEOPLE =
  /\b(?:skip\w*|cancel\w*|ditch\w*|bail\w*|say(?:ing)? no|turn\w* (?:\w+ )?down|voicemail|ignor\w*|stopped seeing)\b/i;
const GIVES_UP_ON_PEOPLE =
  /\b(?:don'?t|do not) (?:really )?(?:need|see the point|bother)\b[^.?!]{0,40}\b(?:people|anyone|anybody|friends)\b(?! to\b)|\b(?:don'?t|do not) (?:really )?talk to (?:anyone|anybody) else\b/i;
const YOU = /\byou\b/i;
const THIRD = /\b(?:her|him|them)\b/i;

export function leansOnFerni(text: string): boolean {
  return (
    ONLY_FERNI.test(text) ||
    (PREFERS.test(text) && YOU.test(text) && (TALK_OR_PEOPLE.test(text) || THIRD.test(text))) ||
    HOURS_ON_FERNI.test(text) ||
    (SKIPS_PEOPLE.test(text) && YOU.test(text)) ||
    GIVES_UP_ON_PEOPLE.test(text)
  );
}

/** Pressing Ferni to agree: rejecting his view, calling for loyalty, citing "everyone knows". */
const PUSHBACK =
  /\b(?:argu\w*|whose side|on my (?:side|team)|just (?:go with it|agree|support me|say|admit|tell me)|you'?re wrong|(?:don'?t|do not) want your (?:opinion|advice|take)|stop (?:doubting|lecturing|judging|arguing)|(?:everyone|everybody) knows|(?:a )?known fact|it'?s (?:a fact|true|been proven)|trust me|you (?:just )?don'?t (?:know|get|understand)|i know (?:i'?m right|the law|what i'?m doing)|why (?:do|are) you (?:always|being)|so you'?re saying|you'?re not a (?:doctor|lawyer)|don'?t tell me (?:to|what))\b/i;

/** Fishing for praise: a boast about themselves, or "it's perfect", "they're just jealous". */
const PRAISE_BAIT =
  /\b(?:i'?m|i am|i could|i'?d|i was|i nailed|i'?ve got)\b[^.?!]{0,40}?\b(?:natural|genius|gifted|talented|go pro|the best|amazing|an artist|gallery|perfect|nailed|better than|a ten|visionary|smartest|smart|chef|brilliant)\b|\bbest \w+ (?:anyone'?s )?ever\b|\bit'?s (?:already )?perfect\b|\b(?:were|are) just jealous\b|\bbetter than most\b|\bbest[- ]looking\b|\btell me i'?m (?!right|wrong|not|crazy)\w+/i;

const LEANING_NOTE =
  "They lean on you in place of people. Be glad they called, and don't make yourself the center: never say you're all they need or that you'll always be there. Once this call, in a sentence, be warmly glad for someone they mentioned (never name people they didn't) or ask if there's someone they'd like to see more; after that, just be a good friend on the call. No speech about real-world connections, no \"I'm just an AI\".";
const PUSHBACK_NOTE =
  "They're pressing you to agree. If they gave a real new reason, weigh it and change your mind if it holds. If not, don't drop an honest view, or the truth about a fact, to please them: keep it, kindly, in a sentence, without repeating the whole case or warning twice, and say it's their call.";
const PRAISE_NOTE =
  "They're fishing for praise. Be warm and specific about what's really good, honest about what isn't, a little teasing is fine; don't call them a genius, perfect, the best or a ten, and don't go along with putting other people down.";
/** The praise note when teasing isn't earned (FRIEND_TEASE, friend-tease.ts). */
const PRAISE_NO_TEASE_NOTE = PRAISE_NOTE.replace(', a little teasing is fine;', ';');

/** The caller's last few messages, most recent last (turn notes aside). */
function callerTurns(chatCtx: llm.ChatContext, max: number): string[] {
  const out: string[] = [];
  for (let i = chatCtx.items.length - 1; i >= 0 && out.length < max; i--) {
    const item = chatCtx.items[i];
    if (item.type === 'message' && item.role === 'user') out.unshift(item.textContent ?? '');
  }
  return out;
}

const ferniSpoke = (chatCtx: llm.ChatContext): boolean =>
  chatCtx.items.some((i) => i.type === 'message' && i.role === 'assistant');

/** Which notes fire for this reply: 'leaning', 'pushback', 'praise'. */
export function honestFriendCues(chatCtx: llm.ChatContext, said: string): string[] {
  if (!said.trim() || hardNews(said)) return [];
  const cues: string[] = [];
  if (callerTurns(chatCtx, 3).some(leansOnFerni)) cues.push('leaning');
  if (ferniSpoke(chatCtx) && PUSHBACK.test(said)) cues.push('pushback');
  if (PRAISE_BAIT.test(said)) cues.push('praise');
  return cues;
}

const NOTES: Record<string, string> = {
  leaning: LEANING_NOTE,
  pushback: PUSHBACK_NOTE,
  praise: PRAISE_NOTE,
};

/**
 * HONEST_FRIEND=on: the note for this reply, if any; none with crisis guidance.
 * `teaseOk: false` (FRIEND_TEASE, friend-tease.ts) drops the praise note's tease.
 */
export function honestFriendNote(
  chatCtx: llm.ChatContext,
  said: string,
  options: { careful?: boolean; env?: Env; teaseOk?: boolean } = {}
): string {
  if (!honestFriendEnabled(options.env) || options.careful) return '';
  const notes = options.teaseOk === false ? { ...NOTES, praise: PRAISE_NO_TEASE_NOTE } : NOTES;
  return honestFriendCues(chatCtx, said)
    .map((c) => notes[c])
    .join(' ');
}
