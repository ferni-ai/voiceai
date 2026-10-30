/**
 * MINOR_CARE's detector: the caller says, about themselves, that they are under 18. What counts
 * and what never does is documented in minor-care.ts, which re-exports these.
 *
 * @module utils/minor-care-detect
 */
const WORD_AGES: Record<string, number> = {
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
};
const AGE = `(\\d{1,2}|${Object.keys(WORD_AGES).join('|')})`;
/** "I'm 12 years old at heart": the one thing that undoes an explicit "I'm N years old". */
const AT_HEART = String.raw`(?!\s+at heart\b)`;
/** Without "I'm", a past age: "16 years old when I had her", "Sixteen years old is when I started". */
const NOT_PAST = String.raw`(?![\s,]+(?:when i|is when|was when|at heart)\b)`;
/** A spoken or typed filler that closes a stated age: "im fifteen btw", "I'm 14 lol" (no punctuation from speech-to-text). */
const FILLER = String.raw`(?:btw|tho|though|lol+|lmf?ao|tbh|rn|right now|ok(?:ay)?|yeah|too|honestly|actually|you know|please)\b`;
/** "years old", "yrs old", "yo", "y/o": the age-word unit after a number ("15yo" has no space). */
const OLD = String.raw`(?:(?:years?|yrs?)[\s-]*old|years?\s+of\s+age|y\/?o)\b`;
/** What may follow a stated age: the end, a pause, "years old", or a joining word. Not a unit ("16 minutes"). */
const AFTER_AGE = String.raw`(?=\s*(?:$|[.,!?;:]|${OLD}${AT_HEART}|and\b|but\b|so\b|now\b|${FILLER}))`;
/** A unit after the number: "10 minutes late", "12 days sober", "15 years sober", "16 percent". */
const UNIT = String.raw`(?:min(?:ute)?s?|h(?:ou)?rs?|days?|weeks?|wks?|months?|(?:years?|yrs?)(?!\s*old)|sec(?:ond)?s?|percent|per\s*cent|%|miles?|mi|km|kilomet(?:er|re)s?|met(?:er|re)s?|feet|foot|ft|inch(?:es)?|pounds?|lbs?|kilos?|kgs?|dollars?|bucks|cents?|points?|pts|times|pages?|steps|reps|laps|o'?clock|[ap]\.?m\b\.?|degrees?|people|sober|more|less|late|early|out\s+of|of|grand|hundred|thousand|k)\b`;
const NO_UNIT = String.raw`(?!\s*-?\s*${UNIT})`;
/** "I'm", not "I feel like I'm" or "as if I'm" (a joke or a comparison). */
const ME = String.raw`(?<!\blike\s)(?<!\bas if\s)(?<!\bas though\s)\b(?:i'm|im|i am)\s+(?:only\s+|just\s+|still\s+)?`;
/**
 * A stated age that is someone else's words: only a clear third-party subject right before
 * said/says/goes/told me ("she said I'm 14", "my mom goes I'm 14"). "I (just) said I'm 14" or an
 * unclear subject counts as the caller's own words.
 */
const NOT_REPORTED = String.raw`(?<!\b(?:she|he|they|(?:the|this|that|my|his|her|their|our|your|some|a|an)\s+[a-z']+)\s+(?:said|says|goes|told me|tells me)[,:]?\s+(?:that\s+)?["“”']?)`;
/** "I'm" in an age rule: the caller's own, unless clearly reported. */
const ME_AGE = `${NOT_REPORTED}${ME}`;
/** The start of what they said, after a filler: "um, 16 years old", "yeah, junior in high school". */
const LEAD = String.raw`(?:^|[.!?]\s+)(?:(?:um+|uh+|er+|well|oh|yeah|yes|yep|so|i mean)[,\s]+)*`;
/** Words that make a bare "I'm 16" about age: on their own, "I'm 8" is as likely a 1-10 answer or a golf score. */
const AGE_WORDS =
  /\b(?:years?[\s-]+old|yrs?[\s-]+old|years?\s+of\s+age|turn(?:ing|ed)|birthday|b-?day)\b|(?:\b|(?<=\d))y\/?o\b/i;
/** Joking, so not a stated age: "lol I feel like I'm 12", "I'm like 14 now haha". */
const LAUGH = /\b(?:lol+|lmf?ao|rofl|ha(?:ha)+h?|he(?:he)+|jk|just kidding)\b|😂|🤣/i;
/** Ferni's previous line asked their age ("how old are you?"), so a bare "16." answers it. */
const ASKED_AGE = /\b(?:how old|your age|what age|age are you)\b/i;

/** "I'm 16", "im 14, so": an age only with age words or as the answer to "how old are you?". */
const AGE_NOW = new RegExp(`${ME_AGE}${AGE}${AFTER_AGE}`, 'gi');
/** "16 years old." or "15yo" at the start: their age, unless a past tense follows. */
const YEARS_OLD = new RegExp(String.raw`${LEAD}${AGE}[\s-]*${OLD}${NOT_PAST}`, 'gi');
/** "I'm a 15 year old girl": always their age. */
const A_YEARS_OLD = new RegExp(String.raw`${ME_AGE}a\s+${AGE}[\s-]*${OLD}${AT_HEART}`, 'gi');
/** Speech-to-text runs clauses together: "im sixteen i just got my permit", "im seventeen my parents". */
const RUN_ON = String.raw`(?:i|i'm|im|my)\b`;
const ENDS = String.raw`$|[.,!?;:]|(?:so|but|now)\b|${FILLER}|${RUN_ON}`;
/**
 * "I'm 14", "im only 13.", "I'm just fifteen, so", "im fifteen btw", "I'm 16 and a half.": a present
 * age that ends its clause (10-17 only). "and a half" only when the clause ends after it, not "16 and
 * a half weeks pregnant".
 */
const CLAUSE_END = String.raw`(?=\s*(?:${ENDS}|and\b(?!\s+a\s+half\b)|and\s+a\s+half\s*(?:${ENDS}|and\b)))`;
const AGE_ENDS = new RegExp(`${ME_AGE}(?:like\\s+)?${AGE}${CLAUSE_END}`, 'gi');
/** With a laugh, only a plain "I'm 13-17" (no "like 14") still reads as their age: "I'm fourteen lol". */
const PLAIN_AGE_ENDS = new RegExp(`${ME_AGE}${AGE}${CLAUSE_END}`, 'gi');
/** Ferni asked for a rating or an amount: "I'm 10." then answers that, not an age. */
const ASKED_AMOUNT =
  /\b(?:scale|one to ten|1 to 10|1-10|rate|rating|out of (?:ten|10)|how (?:many|much|far|long|soon))\b/i;
/** "16." or "Sixteen." and nothing else, answering "how old are you?". */
const BARE_ANSWER = new RegExp(
  String.raw`^\s*(?:(?:um+|uh+|er+|well|oh|so|yeah|i'm|im|i am|just|only|almost)[,\s]+)*${AGE}(?:\s+and\s+a\s+half)?\s*[.!]*\s*$`,
  'gi'
);
/** When they turned it: "I just turned 14 last month", "I turned fifteen on Saturday". Not "15 years ago". */
const WHEN = String.raw`(?=\s*(?:last|this|yesterday|today|recently|on|in)\b)`;
/** "I just turned 15", or "just turned 14" with no "I" at the start: the age they are now. */
const TURNED = new RegExp(
  String.raw`(?:\bi\s+|${LEAD})(?:just\s+)?turned\s+${AGE}(?:${AFTER_AGE}|${WHEN})`,
  'gi'
);
/** "I'm turning 18 next month", "I turn 16 in May", "turning 16 next month": a year older soon, so younger now. */
const TURNING = new RegExp(
  String.raw`(?:${ME_AGE}turning|\bi turn|${LEAD}turning)\s+${AGE}\b${NO_UNIT}`,
  'gi'
);
/** "I'll be 16 in March": only with a when (or age words), not "I'll be 10" (minutes, at the door). */
const WILL_BE = new RegExp(
  String.raw`\bi(?:'ll| will) be\s+${AGE}\b${NO_UNIT}(?=\s*(?:in (?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|next (?:week|month|year)|this (?:year|month|week|summer|fall|spring|winter)|on my (?:birthday|b-?day)|soon\b))`,
  'gi'
);

/** "I'll be 16" with age words in the line ("I'll be 16, my birthday's Friday"). */
const WILL_BE_LOOSE = new RegExp(String.raw`\bi(?:'ll| will) be\s+${AGE}\b${NO_UNIT}`, 'gi');

/** "I'm in high school" as the whole thing they said, not "high school football games" or "pickup". */
const AFTER_PRED = String.raw`(?=\s*(?:$|[.,!?;:)]|(?:and|but|so|at|over|in|near|with|here)\b|(?:right now|now|this year|still|too|though|actually|yet)\s*(?:$|[.,!?;:)]|(?:and|but|so)\b)))`;
/** "in high school (right) now, waiting for my son": a parent at the school, only when it follows directly. */
const NOT_PARENT = String.raw`(?![\s,]*(?:(?:right\s+)?now[\s,]+)?(?:picking up|pick up|dropping off|drop off|waiting for|waiting on)\s+(?:my|our)\s+(?:kids?|sons?|daughters?|child|children)\b)`;
const GRADE_WORDS =
  'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth';
const ORDINAL = String.raw`(?:(?:[1-9]|1[0-2])(?:st|nd|rd|th)|${GRADE_WORDS})`;
/** "I'm in 10th grade", "I'm in the tenth grade", "I go to 9th grade", "I'm an eighth grader". */
const GRADE = new RegExp(
  String.raw`(?:${ME}(?:in\s+)?|\bi\s+(?:go to|attend)\s+)(?:the\s+)?${ORDINAL}\s+grade\b${AFTER_PRED}|${ME}an?\s+${ORDINAL}[\s-]*grader\b`,
  'i'
);
const SCHOOL = String.raw`(?:high|middle|junior high|elementary|grade)\s+school`;
/** "I'm (still) in high school", "I go to middle school", "I'm a high schooler", or "Middle schooler." as an answer. */
const IN_SCHOOL = new RegExp(
  String.raw`(?:${ME}(?:still\s+)?in\s+|\bi\s+(?:go to|attend)\s+)${SCHOOL}\b${NOT_PARENT}${AFTER_PRED}|${ME}a\s+(?:high|middle)\s+schooler\b|${LEAD}(?:a\s+)?(?:high|middle)\s+schooler\b${AFTER_PRED}`,
  'i'
);
/** "I'm a sophomore in high school", or just "Sophomore in high school." as an answer. */
const SCHOOL_YEAR = new RegExp(
  String.raw`(?:${ME}a\s+|${LEAD}(?:a\s+)?)(?:freshman|sophomore|junior|senior)\s+(?:in|at)\s+${SCHOOL}\b${AFTER_PRED}|${ME}a\s+(?:freshman|sophomore)\b${CLAUSE_END}`,
  'i'
);

function ageOf(word: string): number {
  return WORD_AGES[word.toLowerCase()] ?? Number(word);
}

function anyAge(re: RegExp, text: string, under: number, from = 6): boolean {
  for (const m of text.matchAll(re)) {
    const age = ageOf(m[1] ?? '');
    if (age >= from && age < under) return true;
  }
  return false;
}

/** Ferni's last line in a chat's items, so a bare "16." can answer "how old are you?". */
export function lastFerniLine(
  items: readonly { type: string; role?: string; textContent?: string | undefined }[]
): string | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item?.type === 'message' && item.role === 'assistant') return item.textContent;
  }
  return undefined;
}

/** Ferni's line asked how old the caller is. */
export function askedAboutAge(ferniSaid: string | undefined): boolean {
  return !!ferniSaid && ASKED_AGE.test(ferniSaid);
}

/** A laugh undoes "I'm like 14" and the joke age 12, not a plain "I'm fourteen lol" or "I turned 15 lol". */
function statesWhileLaughing(t: string): boolean {
  return anyAge(PLAIN_AGE_ENDS, t, 18, 13) || anyAge(TURNED, t, 18, 13);
}

/**
 * The caller says, about themselves, that they are under 18. `asked` is
 * Ferni's previous line: a bare "I'm 16" or "16." counts only as the answer
 * to an age question (or with age words like "years old" or "birthday").
 */
export function statesUnder18(text: string, asked?: string): boolean {
  const t = text.replace(/[‘’]/g, "'");
  if (GRADE.test(t) || IN_SCHOOL.test(t) || SCHOOL_YEAR.test(t)) return true;
  if (LAUGH.test(t)) return statesWhileLaughing(t);
  const aboutAge = askedAboutAge(asked) || AGE_WORDS.test(t);
  return (
    // A miss stores a child's details; a false hold costs an adult one call's memory.
    (!ASKED_AMOUNT.test(asked ?? '') && anyAge(AGE_ENDS, t, 18, 10)) ||
    anyAge(YEARS_OLD, t, 18) ||
    anyAge(A_YEARS_OLD, t, 18) ||
    anyAge(TURNED, t, 18) ||
    anyAge(TURNING, t, 19) ||
    anyAge(WILL_BE, t, 19) ||
    (aboutAge && (anyAge(AGE_NOW, t, 18) || anyAge(WILL_BE_LOOSE, t, 19))) ||
    (askedAboutAge(asked) && anyAge(BARE_ANSWER, t, 18))
  );
}
