/**
 * Talk TO a teammate, or a plan to go to one, is not news about the caller's life.
 *
 * Prod 2026-10-13: "Hey Jordan, can you help me do some planning" and "I'm going to
 * talk to Jordan" (Jordan is a teammate persona) were stored as key moments ("Made a
 * decision to talk to Jordan", followUpNeeded), and the next call asked "did you ever
 * talk to Jordan about those plans?" as if Jordan were a friend of theirs.
 *
 * The rule is structural, not a guess at what a topic means (two review rounds showed
 * topic words cut both ways):
 * - A caller clause that asks for, or plans to go to, a teammate by name ("can I talk to
 *   Jordan about the trip", "I'm going to ask Peter", "put me through to Maya") is the
 *   call, not their life, whatever it is about. The name said to them ("Hey Jordan, …")
 *   is cut and what follows is kept ("Hey Jordan, my mom is in the hospital").
 * - Someone in their life who shares the name is kept when the line says so: a
 *   relation ("my friend Jordan", "her sister Maya"), a possessive ("Jordan's wedding"),
 *   the person doing something ("Jordan told me", "Maya is pregnant"), what already
 *   happened ("I talked to Maya, she is pregnant"), or a life idiom ("asked Alex out",
 *   "want Peter back"). A plain "talk to Alex tonight" reads as the teammate: the cost is
 *   a friend's name said without any of those, which is not recorded.
 * - A stored moment or thread (isTeammateTalk) that still names a teammate once those
 *   cues are taken into account is about the call, not their life.
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
const re = (source: string, flags = 'i'): RegExp => new RegExp(source, flags);
const NAMES = new Set<string>([...TEAM_FIRST_NAMES, ...Object.keys(HEARD_AS)]);

/** Asking for a teammate, or planning to go to one; never in the past tense. */
const ASKS_FOR = [
  re(`\\b(?:talk|talking|speak|speaking|chat|chatting)\\s+(?:to|with|w/|2)\\s+${N}\\b`),
  re(
    `\\b(?:switch|transfer|hand|pass|send|connect|take|put|patch)\\s+(?:me\\s+)?(?:back\\s+)?(?:over\\s+|through\\s+)?(?:to|with|in)\\s+${N}\\b`
  ),
  re(`\\b(?:go|going|get)\\s+back\\s+to\\s+${N}\\b`),
  re(`\\b(?:get|bring|put|send)\\s+(?:in\\s+)?${N}\\b`),
  re(`\\b(?:can i have|i need|i want|gimme|give me|go with|have)\\s+${N}\\b`),
  re(`\\b(?:ask|asking)\\s+${N}\\b`),
  re(`\\b(?:is|can)\\s+${N}\\s+(?:there|around|available|free|join|help)\\b`),
  re(`^\\W*${N}\\W*(?:please|you there)?\\W*$`),
];

/**
 * The name said to them: "Hey Jordan, …", "hey jordan can you…" (speech-to-text often
 * drops the comma after a greeting), "Jordan, can you…", "…, thanks Maya".
 */
const VOCATIVE_START = re(
  `^\\s*(?:(?:hey|hi|hello|yo|okay|ok)[,!.]?\\s+${N}\\b[,!.?:-]?|(?:(?:so|thanks|thank\\s+you|bye|alright|well)[,!.]?\\s+)?${N}\\b\\s*[,!.?:-])\\s*`
);
const VOCATIVE_END = re(`,\\s*(?:(?:thanks|thank\\s+you)\\s+)?${N}\\s*[?!.]*\\s*$`);

const RELATION =
  'friend|buddy|sister|brother|sibling|mom|mum|mother|dad|father|son|daughter|kid|child|wife|husband|partner|boyfriend|girlfriend|fiance|fiancee|ex|boss|manager|coworker|colleague|cousin|aunt|uncle|niece|nephew|neighbor|neighbour|roommate|grandma|grandpa|grandmother|grandfather|teacher|doctor|therapist|landlord|client';

/** The line plainly means someone in their life who shares the name. */
const SOMEONE_THEY_KNOW = [
  re(
    `\\b(?:my|our|his|her|their|a)\\s+(?:best\\s+|old\\s+|little\\s+|big\\s+|older\\s+|younger\\s+)?(?:${RELATION})s?\\s*,?\\s+${N}\\b`
  ),
  re(`\\b${N},?\\s+(?:my|our)\\s+(?:${RELATION})\\b`),
  re(`\\b${N}'s\\b`),
  re(
    `\\b${N}\\s+(?:said|says|told|tells|texted|texts|called|calls|lives|works|died|passed|moved|broke|got|is\\s+(?:pregnant|sick|moving|getting|in|at|not|so|really|still)|was\\s+(?:diagnosed|fired|born|in|at)|and\\s+i\\b)`
  ),
  re(`\\b(?:talked|spoke|asked|told|met|saw|called|texted|visited)\\s+(?:to\\s+|with\\s+)?${N}\\b`),
  re(
    `\\b(?:ask|asked)\\s+${N}\\s+(?:out|to\\s+marry|for\\s+(?:forgiveness|a\\s+divorce))|\\b(?:want|get)\\s+${N}\\s+(?:back|into|to\\s+stop)|\\bmarry\\s+${N}\\b`
  ),
];

/** Index of the "already happened" sign above. */
const PAST = 4;
const knowsThem = (text: string): boolean => SOMEONE_THEY_KNOW.some((p) => p.test(text));
/**
 * The same, without "already happened": in a stored summary or thread ("ask if they
 * talked to Jordan") a past tense is how the model writes up the call itself.
 */
const STORED_SIGNS = SOMEONE_THEY_KNOW.filter((_, i) => i !== PAST);
const knowsThemStored = (text: string): boolean => STORED_SIGNS.some((p) => p.test(text));

/** Clauses: sentences, and a new clause after a comma ("I talked to Maya, she is pregnant"). */
const clauses = (line: string): string[] =>
  line.split(/(?<=[.!?;])\s+|,\s+(?=(?:i|i'm|i've|i'll|she|he|they|we|my|it)\b)/i);

/** One clause without its teammate talk: '' when it was only that. */
function ownWords(clause: string): string {
  if (knowsThem(clause)) return clause;
  if (ASKS_FOR.some((p) => p.test(clause))) return '';
  return clause.replace(VOCATIVE_START, '').replace(VOCATIVE_END, '').trim();
}

/** The caller's line with every request for, plan to go to, and name said to a teammate taken out. */
export function withoutTeammateTalk(line: string): string {
  const parts = clauses(line);
  const own = parts.map(ownWords);
  if (own.every((o, i) => o === parts[i])) return line.trim(); // nothing taken: as they said it
  return own
    .filter((s) => /[a-z]/i.test(s))
    .join(' ')
    .trim();
}

/** What a stored moment wraps a quote in ("Made a decision to "…""). */
const WRAPPER =
  /^\s*(?:user\s+)?(?:made a decision to|decided to|expressed concern about|opened up about|had a breakthrough:?|celebrated|reached a milestone:?)\s*/i;

/** A teammate's name, as a whole word. */
const NAMED = re(`\\b${N}\\b`);

/**
 * True when `text` (a caller line, a stored moment's summary, a thread) is about asking
 * for or going to a teammate rather than their life: nothing of theirs is left once the
 * teammate talk is out ("Hey Jordan, can you help me do some planning"), or a teammate is
 * still named with no sign of someone they know ("Decided to talk to Jordan about their
 * plans", "Ask how the planning with Jordan went").
 */
export function isTeammateTalk(text: string): boolean {
  const plain = text.replace(/["“”]/g, ' ').replace(WRAPPER, '').trim();
  const own = withoutTeammateTalk(plain);
  if (own !== plain && !hasOwnSubstance(own)) return true;
  return own.split(/(?<=[.!?;])\s+/).some((c) => NAMED.test(c) && !knowsThemStored(c));
}

/** Left over after the teammate talk: words that say something of their life. */
function hasOwnSubstance(rest: string): boolean {
  const words = rest.toLowerCase().match(/[a-z']{3,}/g) ?? [];
  return words.filter((w) => !FILLER.has(w) && !NAMES.has(w)).length >= 2;
}

/** Words that ask or point rather than say anything about their life. */
const FILLER = new Set(
  "the and for are was not but its it's his her she him they them their our out get got did does has had may who how why yes can you your i'm i've i'll i'd let let's lemme help with some that this those these plan plans planning about could would want need just please thanks stuff thing things have what when there here do".split(
    ' '
  )
);

/**
 * Key moments without those that are only teammate talk: for every reader of
 * profile.keyMoments (callbacks, proactive insights, memory context, retrieval). Read-time
 * only: the stored profile keeps them, so a wrong guess deletes nothing.
 */
export function lifeMoments<T extends { summary: string }>(moments: readonly T[] | undefined): T[] {
  return (moments ?? []).filter((m) => !isTeammateTalk(m.summary));
}
