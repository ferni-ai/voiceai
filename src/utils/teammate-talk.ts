/**
 * Talk TO a teammate, or a request to switch to one, is not news about the caller's life.
 *
 * Prod 2026-10-13: "Hey Jordan, can you help me do some planning" and "I'm going to
 * talk to Jordan" (Jordan is a teammate persona) were stored as key moments ("Made a
 * decision to talk to Jordan", followUpNeeded), and the next call asked "did you ever
 * talk to Jordan about those plans?" as if Jordan were a friend of theirs.
 *
 * Extractors read a caller line through withoutTeammateTalk: a sentence asking for a
 * teammate is dropped, a teammate's name said to them ("Hey Jordan, …", "…, Maya") is
 * cut off, and the rest is read as before ("Hey Jordan, my mom is sick" keeps "my mom is
 * sick"). Someone in their life who shares a teammate's name is left alone: "my friend
 * Jordan", "Jordan said…", "Jordan's wedding", "talk to Jordan tomorrow". A stored
 * moment or thread is checked with isTeammateTalk, so ones stored earlier are never
 * followed up on either.
 *
 * In utils so every extractor can use it; the names are personas/persona-ids.ts
 * DISPLAY_NAMES (a test keeps them in step) and their speech-to-text spellings.
 *
 * @module utils/teammate-talk
 */

/** The team's first names: Ferni and the teammates. */
export const TEAM_FIRST_NAMES = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'] as const;

/**
 * Spellings speech-to-text produces for a teammate's first name, with the persona id.
 * None is a common English word or another assistant ("Alexa"), so a caller's own friend
 * is rarely taken for a teammate. tools/handoff/teammate-names.ts reads them from here.
 */
export const HEARD_AS: Readonly<Record<string, string>> = {
  naya: 'nayan-patel',
  nyan: 'nayan-patel',
  nian: 'nayan-patel',
  nayon: 'nayan-patel',
  niyan: 'nayan-patel',
  nayun: 'nayan-patel',
  nyon: 'nayan-patel',
  mya: 'maya-santos',
  maia: 'maya-santos',
  maiya: 'maya-santos',
  jordon: 'jordan-taylor',
  jorden: 'jordan-taylor',
  pete: 'peter-john',
};

const N = `(?:${[...TEAM_FIRST_NAMES, ...Object.keys(HEARD_AS)].join('|')})`;
const re = (source: string): RegExp => new RegExp(source, 'i');

/** Asking for a teammate, or saying they'll go to one ("I'm going to talk to Jordan"). */
const SWITCH = [
  re(`\\b(?:talk|talked|talking|speak|spoke|speaking|chat)\\s+(?:to|with)\\s+${N}\\b`),
  re(
    `\\b(?:switch|transfer|hand|pass|send|connect|take)\\s+(?:me\\s+)?(?:back\\s+)?(?:over\\s+)?(?:to|through\\s+to|with)\\s+${N}\\b`
  ),
  re(`\\b(?:get|bring|put)\\s+(?:in\\s+)?${N}\\b(?!'s)`),
  re(`\\b(?:is|can)\\s+${N}\\s+(?:there|around|available|free|join)\\b`),
  re(`\\b(?:ask|asked|asking)\\s+${N}\\b(?!'s)`),
  re(`^\\W*${N}\\W*(?:please)?\\W*$`),
];

/** The name said to them: "Hey Jordan, …", "Jordan, can you…", "…, thanks Maya". */
const VOCATIVE_START = re(
  `^\\s*(?:(?:hey|hi|hello|ok|okay|so|yo|thanks|thank\\s+you|bye|alright|well)[,!.]?\\s+)?${N}\\b\\s*[,!.?:-]\\s*`
);
const VOCATIVE_END = re(`,\\s*(?:(?:thanks|thank\\s+you)\\s+)?${N}\\s*[?!.]*\\s*$`);

/** Signs they mean a person in their life who shares the name. */
const ABOUT_SOMEONE = [
  re(`\\b(?:my|our|his|her|their)\\s+(?:[a-z-]+\\s+){0,2}${N}\\b`),
  re(`\\b${N}'s\\b`),
  re(
    `\\b${N}\\s+(?:said|says|told|tells|called|calls|texted|texts|is|was|has|had|and\\s+i|thinks|thought|wants|wanted|didn'?t|doesn'?t|got|went|came|lives|works|just)\\b`
  ),
  re(
    `\\b(?:tomorrow|tonight|yesterday|later\\s+today|this\\s+(?:week|weekend|evening)|next\\s+(?:week|month)|last\\s+(?:night|week)|at\\s+work|on\\s+(?:mon|tues|wednes|thurs|fri|satur|sun)day)\\b`
  ),
];

const aboutSomeone = (sentence: string): boolean => ABOUT_SOMEONE.some((p) => p.test(sentence));

/** One sentence without its teammate talk: '' when it was only that. */
function ownWords(sentence: string): string {
  if (aboutSomeone(sentence)) return sentence;
  if (SWITCH.some((p) => p.test(sentence))) return '';
  return sentence.replace(VOCATIVE_START, '').replace(VOCATIVE_END, '').trim();
}

/** The caller's line with every request for, and every name said to, a teammate taken out. */
export function withoutTeammateTalk(line: string): string {
  return line
    .split(/(?<=[.!?])\s+/)
    .map(ownWords)
    .filter((s) => /[a-z]/i.test(s))
    .join(' ')
    .trim();
}

/** What a stored moment wraps a quote in ("Made a decision to "…""). */
const WRAPPER =
  /^\s*(?:user\s+)?(?:made a decision to|decided to|expressed concern about|opened up about|had a breakthrough:?|celebrated|reached a milestone:?|did you ever|ask (?:if|whether) (?:they|the user)|check (?:if|whether) (?:they|the user))\s*/i;

/**
 * True when `text` (a stored moment's summary, a thread) is about switching to or
 * speaking to a teammate, not their life: e.g. "Made a decision to "I'm going to talk to
 * Jordan"", "Ask if they talked to Jordan about the plans".
 */
export function isTeammateTalk(text: string): boolean {
  const plain = text.replace(/["“”]/g, '').replace(WRAPPER, '').trim();
  return withoutTeammateTalk(plain) !== plain && !hasOwnSubstance(withoutTeammateTalk(plain));
}

/** Left over after the teammate talk: more than a request ("can you help me plan"). */
function hasOwnSubstance(rest: string): boolean {
  const words = rest.toLowerCase().match(/[a-z']{3,}/g) ?? [];
  return words.filter((w) => !FILLER.has(w)).length >= 2;
}

/** Words that ask or point rather than say anything about their life. */
const FILLER = new Set(
  "the and for are was not but its it's his her she him they them our out get got did does has had may who how why yes can you your i'm i've i'll help with some that this those these plan plans planning about could would want need just please thanks stuff thing things have what when there here do".split(
    ' '
  )
);
