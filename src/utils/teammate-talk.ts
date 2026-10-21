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

import { flagOn, type Env } from '../config/env-flag.js';

/** The team's first names: Ferni and the teammates. */
export const TEAM_FIRST_NAMES = ['ferni', 'peter', 'alex', 'maya', 'jordan', 'nayan'] as const;

/**
 * Spellings speech-to-text produces for "Ferni" itself ("this is Fernie, right?").
 * Kept apart from HEARD_AS, which routes handoffs to a teammate's persona id.
 */
export const FERNI_HEARD_AS = ['fernie', 'ferny', 'furny'] as const;

/**
 * Spellings speech-to-text produces for a teammate's first name, with the persona id.
 * None is a common English word or another assistant ("Alexa"), so a caller's own friend
 * is rarely taken for a teammate. A test keeps them equal to tools/handoff/teammate-names.ts.
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
  re(`\\b${N},?\\s+(?:my|our|his|her|their)\\s+(?:${RELATION})\\b`),
  re(`\\b${N}'s\\b`),
  re(
    `\\b${N}\\s+(?:(?:has|had|have|hasn't|hadn't|is|isn't|was|wasn't|will|won't|would|did|didn't|does|doesn't|just|finally|still|never|always)\\s+)?(?:said|says|told|tells|texted|texts|called|calls|lives|works|died|passed|moved|broke|got|gets|left|leaves|lost|loses|cheated|wants|wanted|misses|missed|drinks|drinking|drank|had|has|have|hit|yelled|hates|loves|needs|spoken|been|gone|started|quit|is|was|isn't|wasn't|will|won't|hasn't|and\\s+i)\\b`
  ),
  re(
    `\\b(?:worried|scared|afraid|thinking|think|miss|missing|visit|visiting|propose|proposing|lost|love|hate|forgive|divorce|divorcing|marry|marrying|dating|date|lose|losing)\\s+(?:about\\s+|to\\s+|for\\s+|of\\s+)?${N}\\b`
  ),
  re(`\\b(?:talked|spoke|asked|told|met|saw|called|texted|visited)\\s+(?:to\\s+|with\\s+)?${N}\\b`),
  re(
    `\\b(?:ask|asked)\\s+${N}\\s+(?:out|to\\s+marry|for\\s+(?:forgiveness|a\\s+divorce))|\\b(?:want|get)\\s+${N}\\s+(?:back|into|to\\s+stop)|\\bmarry\\s+${N}\\b`
  ),
];

/** Life news ("I got laid off, can I talk to Peter", "Peter died"): never dropped as the call. */
const LIFE_NEWS = re(
  `\\b(?:died|dies|dying|passed\\s+(?:away|on|last|yesterday|today|this)|death|funeral|laid\\s+off|got\\s+fired|(?:lost|losing)\\s+(?:my|his|her|their|our)\\s+(?:job|mom|dad|mother|father|baby|husband|wife|son|daughter)|in\\s+(?:the\\s+)?hospital|hospitali[sz]ed|surgery|cancer|stroke|diagnosed|divorce|divorcing|pregnant|miscarriages?|miscarried|embryos?|ivf|had\\s+(?:a|the|her|their|our)\\s+baby|gave\\s+birth|baby\\s+(?:girl|boy)|was\\s+born|broke\\s+up|break\\s*ups?|dumped|left\\s+me|relapsed?|abused?|abusive|abuse|panic\\s+attacks?|depressed|depression|struggling|arrested|evicted|overdosed?|heart\\s+attack|car\\s+accident)\\b`
);

/** The teammate in an ask ("to Jordan", "Peter"), for cutting it and keeping the rest. */
const TO_NAME = re(`(?:\\s+(?:to|with|w/|2|in))?\\s+${N}\\b`);
const withoutTheTeammate = (clause: string): string =>
  ASKS_FOR.reduce(
    (c, p) => c.replace(re(p.source, 'gi'), (ask) => ask.replace(TO_NAME, '')),
    clause
  ).trim();

/** Index of the "already happened" sign above. */
const PAST = 5;
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
  // the ask is the call; life news in the same clause is kept, without the teammate
  if (ASKS_FOR.some((p) => p.test(clause))) {
    return LIFE_NEWS.test(clause) ? withoutTheTeammate(clause) : '';
  }
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

/** A live caller line for an extractor: '' when it is only teammate talk, else without it. */
export function callerOwnWords(line: string): string {
  return onlyTeammateTalk(line) ? '' : withoutTeammateTalk(line);
}

/** What a stored moment wraps a quote in ("Made a decision to "…""). */
const WRAPPER =
  /^\s*(?:user\s+)?(?:made a decision to|decided to|expressed concern about|opened up about|had a breakthrough:?|celebrated|reached a milestone:?)\s*/i;

/**
 * How a summary writes up going to a teammate: "decided to talk to Jordan", "planning
 * with Jordan", "wants Jordan to help", "ask if they talked to Jordan".
 */
const STORED_ASKS = [
  ...ASKS_FOR,
  re(`\\b(?:planning|plans?|conversation|call|session|chat|talk|work|working)\\s+with\\s+${N}\\b`),
  re(`\\b${N}\\s+(?:to\\s+)?help\\b`),
  re(
    `\\b(?:if|whether|did)\\s+(?:they|the user|you)\\s+(?:ever\\s+)?(?:talked|spoke|talk|speak)\\s+(?:to|with)\\s+${N}\\b`
  ),
];

/**
 * True when a caller line is nothing but teammate talk once that is taken out: the
 * asking, or the name said to a teammate with a request and nothing of their life ("Hey
 * Jordan, can you help me do some planning"). For live caller lines.
 */
export function onlyTeammateTalk(text: string): boolean {
  const plain = text.replace(/["“”]/g, ' ').replace(WRAPPER, '').trim();
  const own = withoutTeammateTalk(plain);
  return own !== plain && !hasOwnSubstance(own);
}

/**
 * True when stored text (a moment's summary, a thread, the model's own wording) is about
 * going to a teammate rather than their life: only teammate talk, or a clause that writes
 * up asking for or working with a teammate ("Decided to talk to Jordan about their
 * plans", "Ask how the planning with Jordan went") with no sign of someone they know. A
 * name alone is not enough: "Alex left me" and "Alex has cancer" are their life.
 */
export function isTeammateTalk(text: string): boolean {
  if (LIFE_NEWS.test(text)) return false; // life news anywhere in it is their life
  if (onlyTeammateTalk(text)) return true;
  const plain = text.replace(/["“”]/g, ' ').replace(WRAPPER, '').trim();
  return clauses(plain).some(
    (c) => STORED_ASKS.some((p) => p.test(c)) && !knowsThemStored(c) && !LIFE_NEWS.test(c)
  );
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

/** Read time, behind TEAMMATE_TALK_FILTER (off: every stored moment is read as before). */
export function hiddenAsTeammateTalk(text: string, env: Env = process.env): boolean {
  return flagOn('TEAMMATE_TALK_FILTER', env) && isTeammateTalk(text);
}

/**
 * Key moments without those that are only teammate talk, for every reader of
 * profile.keyMoments. Read time only and behind the flag: nothing stored is deleted.
 */
export function lifeMoments<T extends { summary: string }>(moments: readonly T[] | undefined): T[] {
  return (moments ?? []).filter((m) => !hiddenAsTeammateTalk(m.summary));
}

/** First name for a spelling: "jorden" is Jordan (HEARD_AS), a team name is itself. */
const firstName = (spelling: string): string =>
  (HEARD_AS[spelling] ?? spelling).split('-')[0] ?? spelling;

/** Every spelling of one teammate's first name, as a regex alternation. */
const spellingsOf = (name: string): string =>
  [...NAMES].filter((s) => firstName(s) === name).join('|');

/** A teammate speaking as themself: "I'm Jordan", "this is Maya", "Peter here". */
const SPEAKS_AS = re(
  `\\b(?:i'm|i am|this is|it's|my name is)\\s+${N}\\b(?!'s)|^\\W*${N}\\s+here\\b`
);

export interface CallTurn {
  role: string;
  content: string;
}

/**
 * The teammates this call itself shows were on it: one speaking as themself on the
 * assistant's side ("Hi, I'm Jordan"). Never the caller's own line: "Maya, my sister, had
 * a baby" starts with a name and a comma and is about their sister. With it, "Jordan" in
 * a summary of this call is the persona, whatever the wording.
 */
export function teammatesOnCall(turns: readonly CallTurn[]): Set<string> {
  const on = new Set<string>();
  for (const { role, content } of turns) {
    if (role === 'user') continue;
    const spoken = SPEAKS_AS.exec(content)?.[0].match(re(N))?.[0];
    if (spoken) on.add(firstName(spoken.toLowerCase()));
  }
  return on;
}

/**
 * True when `text` names a teammate who was on this call (teammatesOnCall), with no
 * relation or possessive that makes the name someone they know ("my friend Jordan",
 * "Jordan's wedding") and no life news ("Peter died"). "Has Jordan helped with the
 * planning?" is then about the call. The cost: a friend who shares an on-call teammate's
 * name, named bare with no news, is not kept.
 */
export function namesTeammateOnCall(text: string, turns: readonly CallTurn[]): boolean {
  if (LIFE_NEWS.test(text)) return false;
  return [...teammatesOnCall(turns)].some((name) => {
    const n = `(?:${spellingsOf(name)})`;
    if (!re(`\\b${n}\\b`).test(text)) return false;
    const theirs = [
      re(`\\b(?:my|our|his|her|their|a)\\s+(?:\\w+\\s+)?(?:${RELATION})s?\\s*,?\\s+${n}\\b`),
      re(`\\b${n},?\\s+(?:my|our|his|her|their)\\s+(?:${RELATION})\\b`),
      re(`\\b${n}'s\\b`),
    ];
    return !theirs.some((p) => p.test(text));
  });
}
