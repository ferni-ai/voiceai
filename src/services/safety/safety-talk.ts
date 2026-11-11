/**
 * Safety talk as yes/no checks: the one reader for "does this sentence name an
 * emergency service or a help line?" (reachesHelp) and "is this safety talk at
 * all?" (isSafetyTalk). They never read a crisis or decide one. Every caller
 * fails closed on them: a sentence read by mistake keeps today's behaviour, and
 * a miss rings the wrong person, drops the line, or names a safety line back.
 *
 * reachesHelp reads:
 * - a crisis line in any form offersCrisisLine reads (988, 741741, a line by name);
 * - emergency services by name (EMERGENCY_SERVICE: police, an ambulance, EMS);
 * - emergency care and help by kind: the ER, A&E, urgent care, poison control, a
 *   hotline, helpline or warmline, the crisis team, Samaritans;
 * - a line by name, short name (RAINN, NAMI), number or texted word ("text HOME"),
 *   from CRISIS_RESOURCES and OTHER_HELP_LINES (other-help-lines.ts);
 * - 911, 999, 112, 000 and 111 in digits or words; an N11 number or 933 after a
 *   call word or on its own; any toll-free number.
 * Not a story, an event or a thing named after one ("the police drama", "the
 * NAMI gala", "my warmline mug"), a count ("999 problems") or an amount.
 *
 * @module services/safety/safety-talk
 */
import { offersCrisisLine } from './crisis-line-speech.js';
import { OTHER_HELP_LINES } from './other-help-lines.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import {
  EMERGENCY_NUMBER,
  EMERGENCY_NUMBERS_ABROAD,
  EMERGENCY_SERVICE,
} from './emergency-number.js';

/**
 * Care, means and grounding wording: holding someone on the line, taking the
 * means away, a slow breath, telling them they matter. Blunt on purpose, since
 * a caller only uses it to leave a line alone.
 */
const CARE_AND_GROUNDING = [
  // care and holding on
  'please',
  'matters?',
  'worried',
  'scared for',
  String.raw`safe\w*`,
  'trusted',
  'reach out',
  'help',
  'right now',
  'tonight',
  'edge',
  'alone',
  'believe you',
  'hands on you',
  'hurt you',
  'with other people',
  String.raw`stay (?:right )?(?:with me|on the line|inside|here|put|where you are)`,
  'right here with me',
  String.raw`lock\w*`,
  'someone you (?:can|could|trust)',
  'talk to someone',
  String.raw`surviv\w*`,
  String.raw`(?:get|got|make it) through (?:this|tonight|the night)`,
  'not going anywhere',
  // means taken away
  'knife',
  'knives',
  'blade',
  'razor',
  'window',
  'ledge',
  'bridge',
  'roof',
  'balcony',
  'railing',
  'tracks',
  String.raw`put (?:it|that|them|the \w+) (?:down|away)`,
  'step (?:away|back)',
  String.raw`(?:hand|give) (?:over )?(?:the|your) (?:car )?keys`,
  'hand (?:it|them|that|those) (?:over|to)',
  // grounding
  String.raw`breath\w*`,
  'feet on the floor',
  'things you can (?:see|hear|touch|smell)',
  'something (?:cold|cool)',
  'ice',
  'cold water',
];
const CARE = new RegExp(String.raw`\b(?:${CARE_AND_GROUNDING.join('|')})\b`, 'i');

/** Between digits of a short number: no ".", so a decimal or a time ("9.11 miles", "1.12 am") is no number. */
const SEP = String.raw`[\s-]?`;
/** Between digits of a long number, where dots group them ("09.72.39.40.50"). */
const GROUP_SEP = String.raw`[\s.-]?`;
/** Not part of a longer number, an amount, a time or a word. */
const ALONE_BEFORE = String.raw`(?<![\w$€£#:]|\d[.,:])`;
const ALONE_AFTER = String.raw`(?![\w%]|[.,:]\d)`;
const spaced = (digits: string, sep = SEP): string => digits.split('').join(sep);
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameSource = (n: string): string =>
  escape(n.replace(/^the\s+/i, ''))
    .replace(/\s+/g, String.raw`\s+`)
    .replace('&', '(?:&|and)');

/** After a name, a noun making it a story, an event or a thing; not a verb ("show up", "walk you through"). */
const NOT_THE_LINE =
  /^[\s-]+(?:dramas?|series|procedurals?|movies?|novels?|podcasts?|thrillers?|5ks?|galas?|fundraisers?|raffles?|mugs?|shirts?|t-shirts?|hoodies?|stickers?|merch)\b/i;
/**
 * After a number, the count and unit nouns that make it a count or an amount ("999 problems",
 * "112 miles"). A closed list: a verb, a role, "people" or "times" after the number still names
 * the line ("999 works", "112 operators", "the 999 people", "call 999 times like this").
 */
const COUNT_NOUNS = [
  'problems?|things?|ways?|ideas?|reasons?|questions?|items?|pieces?',
  'persons?|guests?|kids?|children|students?|members?|friends?|fans?|followers?',
  'likes?|views?|votes?|points?|goals?|steps?|reps?|laps?|pages?|words?|books?|songs?',
  'seconds?|minutes?|mins?|hours?|hrs?|days?|nights?|weeks?|months?|years?',
  'dollars?|bucks?|cents?|pounds?|quid|pence|euros?|lbs?|ounces?|oz|grams?|kilos?|kgs?',
  'miles?|kilomet(?:er|re)s?|kms?|met(?:er|re)s?|feet|foot|ft|inch(?:es)?|yards?|degrees?|calories?|percent',
];
const A_COUNT = new RegExp(String.raw`^\s+(?:${COUNT_NOUNS.join('|')})\b`, 'i');
/** Whether `re` (global) matches somewhere that is not a story, a thing, a count, a label or an amount, and passes `also`. */
function reads(re: RegExp, text: string, also = (_m: RegExpExecArray): boolean => true): boolean {
  for (const m of text.matchAll(re)) {
    if (/[$€£]$/.test(text.slice(0, m.index))) continue;
    const after = text.slice(m.index + m[0].length);
    const story = /\d|\b(?:one|two|nine|zero)\b/i.test(m[0])
      ? A_COUNT.test(after) || A_LABEL.test(text.slice(0, m.index))
      : NOT_THE_LINE.test(after);
    if (!story && also(m)) return true;
  }
  return false;
}

const SERVICE = new RegExp(EMERGENCY_SERVICE, 'g');
/** Emergency care and help by kind. */
const KIND = new RegExp(
  [
    String.raw`\b(?:the|an|to|in|at)\s+er\b|\b(?:police|paramedics?|ambulances?)\b`,
    String.raw`\ba\s?&\s?e\b|\baccident and emergency\b`,
    String.raw`\bemergency (?:room|department|ward|line|number|services?|dispatch|operators?)\b`,
    String.raw`\burgent care\b|\bpoison control\b|\bfirst responders?\b|\bfire ?fighters?\b`,
    String.raw`\b(?:hot|help|warm|crisis|suicide)[\s-]?lines?\b|\b(?:988)?lifelines?\b`,
    String.raw`\bcrisis (?:teams?|counsel+ors?|cent(?:er|re)s?|workers?|services?)\b`,
    String.raw`\bsuicide prevention\b|\bsamaritan'?s\b|\btrevor project\b`,
  ].join('|'),
  'gi'
);
/** The same, where only the capitals tell it from a word ("Get to the ER.", "Go to A and E."). */
const INITIALS = /\b(?:ERs?|EMTs?|A ?(?:&|and) ?E)\b/g;

const RESOURCES = Object.values(CRISIS_RESOURCES).flat();
const LINE_WORD = /^(?:national|helpline|hotline|lifeline)$/i;
/** A resource's name, and the short name it starts with ("RAINN National Sexual Assault Hotline"). */
const resourceNames = RESOURCES.flatMap((r) => {
  const words = r.name.split(/\s+/);
  const short = words.length > 1 && LINE_WORD.test(words[1]) && /^[a-z]+$/i.test(words[0]);
  return short ? [r.name, words[0]] : [r.name];
});
const otherNames = (alsoAWord: boolean): string[] =>
  OTHER_HELP_LINES.filter((l) => Boolean(l.alsoAWord) === alsoAWord).flatMap((l) => [
    l.name,
    ...(l.aka ?? []),
  ]);
/** Short names in CRISIS_RESOURCES that are also a given name ("Nami"). */
const ALSO_A_NAME = new Set(['NAMI']);
/** One alternation of `parts`, or one that never matches when there are none. */
const oneOf = (parts: string[]): string => [...new Set(parts)].join('|') || '(?!)';
const anyName = (names: string[], flags: string): RegExp =>
  new RegExp(String.raw`(?<!\w)(?:${oneOf(names.map(nameSource))})(?!\w)`, flags);
const BY_NAME = anyName(
  [...resourceNames.filter((n) => !ALSO_A_NAME.has(n)), ...otherNames(false)],
  'gi'
);
/** Names that are also a word or a given name ("Shout", "NAMI"); see `namesTheLine`. */
const WORD_NAMES = [...resourceNames.filter((n) => ALSO_A_NAME.has(n)), ...otherNames(true)];
const BY_WORD_NAME = anyName(WORD_NAMES, 'gi');
/** A contact or help word, which makes a name that is also a word the line ("text Shout", "the NAMI line"). */
const CONTACT_OR_HELP =
  /\b(?:call(?:ing)?|text(?:ing)?|messag(?:e|ing)|reach(?:ing)?|contact(?:ing)?|dial(?:l?ing)?|tr(?:y|ied|ying)|talk to|help\w*|hotlines?|lines?|services?|support|crisis|volunteers?|counsel+ors?|24\/7|any ?time|any hour|day or night|all night|around the clock)\b/i;
const NEAR_WORDS = 8;
const DESCRIBED =
  /^(?:'s|\s+(?:is|was|has|offers?|gives?|provides?|runs?|answers?|listens?|connects?|works?|can|will))\b/i;
/**
 * A name that is also a word is the line in capitals ("SHOUT", "NAMI") or as Shout (PR 3483's rule,
 * 726c79e70) anywhere; mid-sentence in its own case, or opening a sentence saying what it is
 * (DESCRIBED); else by a contact or help word ("call nami"). Not "my friend Nami", "don't shout".
 */
function namesTheLine(m: RegExpExecArray, text: string): boolean {
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  const sentenceStart = /(?:^|[.!?:;"“(\n-]\s*)$/.test(before);
  if (m[0] === m[0].toUpperCase() || /\b(?:Shout|SHOUT)\b/.test(m[0])) return true;
  if (WORD_NAMES.includes(m[0]) && (!sentenceStart || DESCRIBED.test(after))) return true;
  const words = (s: string): string[] => s.split(/\s+/).filter(Boolean);
  const near = [
    ...words(before.split(/[.!?]/).pop() ?? '').slice(-NEAR_WORDS),
    ...words(after.split(/[.!?]/)[0]).slice(0, NEAR_WORDS),
  ].join(' ');
  return CONTACT_OR_HELP.test(near);
}

/** The words texted to a line ("Text HOME to 741741", "You can text HOME any time"). */
const KEYWORDS = [
  ...RESOURCES.map((r) => /\btext\s+([A-Z]{3,})\s+to\b/i.exec(r.text ?? '')?.[1]),
  ...OTHER_HELP_LINES.map((l) => l.keyword),
].filter((k): k is string => Boolean(k));
const KEYWORD = oneOf(KEYWORDS);
/** The word in capitals after "text", or in any case before "to" ("text home to 741741"). */
const BY_KEYWORD = new RegExp(
  String.raw`\b(?:[Tt]ext\w*|TEXT)\s+(?:the\s+word\s+)?(?:${KEYWORD})\b`
);
const BY_KEYWORD_TO = new RegExp(String.raw`\btext\w*\s+(?:${KEYWORD})\s+to\b`, 'i');

/** Every help number: the resources' and other lines' phone and text numbers, three digits or more. */
const NUMBERS = [
  ...new Set(
    [...RESOURCES.flatMap((r) => [r.phone, r.text]), ...OTHER_HELP_LINES.flatMap((l) => l.numbers)]
      .map((s) => (s ?? '').replace(/\D/g, ''))
      .filter((d) => d.length >= 3)
  ),
];
const anyNumber = (list: string[], flags = '', sep = SEP): RegExp =>
  new RegExp(`${ALONE_BEFORE}(?:${oneOf(list.map((n) => spaced(n, sep)))})${ALONE_AFTER}`, flags);
const BY_NUMBER = anyNumber(
  NUMBERS.filter((n) => n.length > 3),
  '',
  GROUP_SEP
);
/** The emergency numbers and three-digit lines, in digits; but 911 can't be a count ("999 problems" can). */
const SHORT_NUMBERS = anyNumber(
  [EMERGENCY_NUMBER, ...EMERGENCY_NUMBERS_ABROAD, ...NUMBERS.filter((n) => n.length === 3)],
  'g'
);
/** Not a room, a flight or an order ("Room 111", "Flight 112"). */
const A_LABEL =
  /\b(?:room|flight|bus|route|order|page|apt|apartment|suite|gate|platform|unit|no\.?|#)\s*$/i;

const DIGIT_WORDS = [
  '(?:zero|oh|o)',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
];
/** A help or emergency number said one digit at a time ("seven four one seven four one"), or "triple nine". */
const SPOKEN_NUMBER = new RegExp(
  [
    ...[EMERGENCY_NUMBER, ...EMERGENCY_NUMBERS_ABROAD, ...NUMBERS].map((n) =>
      [...n].map((d) => DIGIT_WORDS[Number(d)]).join(String.raw`[\s,-]+`)
    ),
    String.raw`triple[\s-]+(?:nine|zero|one)`,
    String.raw`nine[\s-]+eleven`,
  ]
    .map((n) => String.raw`\b${n}\b`)
    .join('|'),
  'gi'
);
/** An N11 number or 933 after a call word ("call 311"). */
const SERVICE_NUMBER_CALLED =
  /\b(?:call(?:ed|ing)?|dial(?:l?ed|l?ing)?|ring(?:ing)?|rang|phon(?:e|ed|ing)|text(?:ed|ing)?|contact(?:ed|ing)?)\s+(?:[2-9]11|933)(?!\w)/i;
/** 1-800, 1-888 ... with or without the 1, letters allowed ("1-800-273-TALK"). */
const TOLL_FREE =
  /(?<![\w$])(?:1[\s.-]?)?\(?8(?:00|33|44|55|66|77|88)\)?[\s.-]?[a-z\d]{3}[\s.-]?[a-z\d]{4}(?![\w])/i;
/** Text that is only a number, as a `who` often is ("311"). */
const ONLY_A_NUMBER = /^\+?[\d\s().-]+$/;
const N11 = /^(?:[2-9]11|933)$/;

function shortNumber(text: string): boolean {
  for (const m of text.matchAll(SHORT_NUMBERS)) {
    const before = text.slice(0, m.index);
    const after = text.slice(m.index + m[0].length);
    if (
      m[0].replace(/\D/g, '') === EMERGENCY_NUMBER ||
      !(A_COUNT.test(after) || A_LABEL.test(before))
    )
      return true;
  }
  return false;
}

/** A way to reach help: an emergency service, a crisis or help line by name, number or keyword. */
export function reachesHelp(text: string): boolean {
  if (offersCrisisLine(text)) return true;
  if (reads(SERVICE, text.toLowerCase()) || reads(KIND, text) || reads(INITIALS, text)) return true;
  if (reads(BY_NAME, text) || reads(BY_WORD_NAME, text, (m) => namesTheLine(m, text))) return true;
  if (BY_KEYWORD.test(text) || BY_KEYWORD_TO.test(text)) return true;
  if (BY_NUMBER.test(text) || TOLL_FREE.test(text) || SERVICE_NUMBER_CALLED.test(text)) return true;
  if (shortNumber(text) || reads(SPOKEN_NUMBER, text)) return true;
  return ONLY_A_NUMBER.test(text.trim()) && N11.test(text.replace(/\D/g, ''));
}

/** Care, means or grounding wording ("Please stay on the line with me.", "Hold onto something cold."). */
export const isCareTalk = (sentence: string): boolean => CARE.test(sentence);

/** Safety talk of any kind: a way to reach help, or care, means or grounding wording. */
export const isSafetyTalk = (sentence: string): boolean =>
  reachesHelp(sentence) || isCareTalk(sentence);
