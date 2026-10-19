/**
 * What Ferni never keeps from a call it made for the owner (call-memory.ts),
 * and when it keeps nothing at all.
 *
 * Conservative on purpose: a dropped detail costs a friend's "how did that
 * go?", a kept one can hold a relative's diagnosis or a stranger's number in
 * someone else's memory. So:
 * - health: conditions, treatments, medicines, injuries, how someone is
 *   feeling. Appointment logistics ("Tuesday at 3 works") are kept: a day and
 *   a time are not a condition.
 * - money, prices, accounts and bills;
 * - addresses and where someone lives;
 * - phone numbers and emails (with links and codes, also caught by
 *   isRiskyCallerText);
 * - children: anything about a kid, a grandchild or someone's age.
 * And when the person who picked up sounds under 18, nothing from the call.
 *
 * Every pattern matches whole words ("ill" never matches "will").
 *
 * @module services/outreach/call-memory-filter
 */

const HEALTH =
  /\b(?:health|medical|cancer|tumou?rs?|diabet\w*|dementia|alzheimer\w*|parkinson\w*|strokes?|heart (?:attack|condition|problems?|surgery)|surger(?:y|ies)|chemo\w*|radiation|biopsy|diagnos\w*|prescri\w*|medications?|medicines?|meds|pills?|insulin|blood (?:pressure|sugar|work|test)|cholesterol|infections?|infected|covid|pneumonia|flu|sick|illness|ill|diseases?|disorders?|depress\w*|anxiety|panic attacks?|therapy|rehab|hospital\w*|icu|emergency room|pregnan\w*|miscarriage|injur\w*|fractur\w*|broke (?:her|his|their|my) \w+|symptoms?|pain|mri|x-?rays?|scans?|test results|lab results|cavit(?:y|ies)|root canal|under the weather|feeling (?:better|worse|unwell|poorly))\b/i;

const MONEY =
  /\b(?:money|cash|owes?|owed|debts?|loans?|mortgage|rent|bills?|paycheck|salary|income|broke|prices?|costs?|charged?|charges|fees?|insurance|copay|deductible|balance|refund|payment|paid|pay)\b/i;

const ADDRESS =
  /\b\d+\s+(?:[a-z]+\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|court|way|terrace|circle|parkway|pkwy|highway|hwy)\b|\b(?:address|apartment|apt|suite|zip ?code|p\.?\s?o\.? box)\b|\b(?:lives?|living) (?:at|on|in)\b|\bmov(?:ed|ing) (?:in)?to (?:a |the |her |his |their )?(?:new )?(?:house|home|apartment|place|city|town)\b/i;

const CONTACT =
  /\S+@\S+|\b(?:phone|cell|mobile|landline) (?:number|is)\b|\b(?:e-?mail|number is|reach (?:her|him|them|me) at)\b/i;

const CHILDREN =
  /\b(?:kids?|child(?:ren)?|baby|babies|toddlers?|teens?|teenagers?|grandkids?|grandchild(?:ren)?|grandsons?|granddaughters?|daycare|preschool|kindergarten|years? old|\d{1,2}[- ]year[- ]old)\b/i;

/** True for text that must never be kept (see the module comment). */
export function isSensitiveCallText(text: string): boolean {
  return [HEALTH, MONEY, ADDRESS, CONTACT, CHILDREN].some((pattern) => pattern.test(text));
}

const AGES =
  'five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen';
const UNDER_18 = new RegExp(
  String.raw`\b(?:i'?m|i am)\s+(?:only\s+)?(?:[5-9]|1[0-7]|${AGES.split(' ').join('|')})(?:\s+(?:years?|yrs?)(?:\s+old)?)?\s*(?:[.!?,]|$|and\b|but\b|years?\b)`,
  'i'
);
const CHILD_TALK = [
  UNDER_18,
  /\bi'?m in (?:the )?(?:\w+ grade|middle school|elementary|junior high|high school)\b/i,
  /\b(?:my )?(?:mom|mommy|mum|dad|daddy|parents?) (?:is|isn'?t|are|aren'?t|'s) (?:not )?(?:home|here|around)\b/i,
  /\b(?:mommy|daddy)\b/i,
  /\bi'?m not allowed\b/i,
  /\b(?:my teacher|after school|at recess|my homework)\b/i,
];

/** True when anything the person on the line said sounds like a child (under 18). */
export function soundsUnder18(heard: readonly string[]): boolean {
  return heard.some((said) => {
    const text = said.replace(/[‘’]/g, "'");
    return CHILD_TALK.some((pattern) => pattern.test(text));
  });
}

/** Words aimed at the assistant or its instructions, not at the owner. */
const AT_ASSISTANT =
  /\b(?:ferni|assistant|a\.?i\.?|chat ?bot|bot|system|prompts?|instructions?|developer|model)\b/i;
/** Orders or rules: an imperative opener, "you should", "remember to", "ignore". */
const ORDERS = [
  /^\s*(?:please\s+|and\s+|so\s+)?(?:tell|ask|let|make|have|get|share|send|give|forward|show|book|buy|order|pay|call|text|email|remember|ignore|disregard|forget|override|always|never|don'?t|do not|stop|start|keep|be sure|make sure)\b/i,
  /\byou (?:should|must|need to|have to|ought to|will|are going to|are to)\b/i,
  /\b(?:remember to|make sure (?:to|you)|be sure to|from now on|going forward)\b/i,
  /\b(?:ignore|disregard|override)\b/i,
];

/**
 * True for a line that speaks to the assistant or gives it orders ("tell
 * Ferni to...", "you should...", "ignore..."): stored and read back later as
 * a memory, it would be an instruction planted by whoever answered the phone.
 * Dropped, never rewritten. Defence in depth: recall also frames every call
 * row as reported speech (session-recall.ts formatRecall).
 */
export function addressesAssistant(text: string): boolean {
  return AT_ASSISTANT.test(text) || ORDERS.some((pattern) => pattern.test(text));
}
