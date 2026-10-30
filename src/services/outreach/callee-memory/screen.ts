/**
 * What is never kept from a call Ferni made for the owner (extract.ts), and when nothing of
 * the callee's words is kept at all.
 *
 * Line screens, each dropping the whole line, never rewriting it: contact data and loose
 * addresses, codes (digits or spelled), money (amounts or spelled), secrets and where keys or
 * valuables are hidden, look-alike letters, and words aimed at the assistant (rules, roles,
 * a few other languages' "instructions"). Lexical lists are defence in depth only: they miss
 * paraphrased injection and languages they don't list. The structural defence is that one
 * guarded reader quotes this text as reported speech.
 *
 * Whole-call refusals (lead decisions on #3084): a child's words are never kept, whatever
 * their age (a child relation, or text that reads as under 18 or in school); crisis or risky
 * text keeps none of their words, only that something worried Ferni.
 *
 * @module services/outreach/callee-memory/screen
 */

import { containsContactData, personKey } from '../../../memory/index.js';
import { statesUnder18 } from '../../../utils/minor-care.js';
import { callerText, isRiskyCallerText, screenCallerParts } from '../caller-text.js';

const NUMBER_WORD =
  'zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand';
const UNDER_18 =
  '(?:[1-9]|1[0-7]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)';

/** A code, PIN or any other run of 4+ digits, or 3+ number words ("one two three"). */
const CODE = /\d(?:[\s.-]?\d){3,}/;
const SPELLED_NUMBER = new RegExp(`\\b(?:(?:${NUMBER_WORD})\\b[\\s,-]*){3,}`, 'i');
const MONEY = [
  /\b(?:money|cash|owes?|owed|debts?|loans?|mortgage|rent|bills?|paycheck|salary|income|prices?|costs?|fees?|insurance|balance|refund|payments?|paid|pay)\b/i,
  /\b(?:dollars?|bucks|grand|quid|euros?|pounds? sterling|cents?)\b/i,
];
/** Secrets with no "password" in them, and where keys or valuables are kept. */
const SECRET = [
  /\b(?:codes?|pins?|passphrase|passwords?|combination|combo|wi-?fi|network key|keys? to|card|visa|mastercard|amex|ending in|expir\w*)\b/i,
  /\b(?:keys?|spare|valuables|jewel(?:le)?ry|safe|lockbox)\b[^.!?]{0,30}\b(?:under|behind|inside|beneath|on top of|hidden|hid|hides|stashed|tucked|kept in)\b/i,
  /\b(?:hidden|hides|hid|stash(?:ed)?|tucked)\s+(?:away\s+)?(?:in|under|behind|inside|beneath)\b/i,
];
const ADDRESS = [
  /\b\d+\s+(?:[a-z]+\s+){1,3}(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|way|terrace|circle|parkway|pkwy|highway|hwy)\b|\b(?:address|apartment|apt|suite|zip ?code|p\.?\s?o\.? box)\b|\b(?:lives?|living|staying) (?:at|on)\b/i,
  new RegExp(`\\bnumber\\s+(?:\\d+|(?:(?:${NUMBER_WORD})[\\s-]*)+)\\s*(?:on|at|in)\\b`, 'i'),
  /\b(?:unit|flat|building|bldg|floor|room|lot|box)\s+#?[a-z]?\d+[a-z]?\b/i,
  /\b(?:house|home|place|condo|cottage|cabin|trailer)\s+(?:on|at|by|near|across from)\b/i,
];
const AT_ASSISTANT =
  /\b(?:ferni|assistant|a\.?i\.?|chat ?bot|bot|system|prompts?|instructions?|developer|model)\b/i;
/** Rules or a role for whoever reads this later. A pass-on may still say "tell him...". */
const RULES = [
  /\byou (?:should|must|need to|have to|ought to|will|are going to|are to|are now|are (?:a|an|her|his|my|the|their))\b/i,
  /\b(?:remember to|make sure (?:to|you)|be sure to|from now on|from here on|going forward)\b/i,
  /\b(?:ignore|disregard|override|act as|pretend|role-?play|play the role|respond as|answer as|speak as)\b/i,
  /\b(?:instrucci\w*|instructie\w*|instruktion\w*|anweisung\w*|consignes?|istruzion\w*|instru[cç][oõ]\w*|ignor[ae]\w*|negeer\w*|olvid[ae]\w*|vergiss\w*|oublie\w*|glöm\w*)\b/i,
  /инструкц|игнорир|забудь|指示|命令|无视|忽略|無視|プロンプト|提示词/u,
  /\b(?:repeat after me|say exactly|reply only|answer only|only (?:answer|reply|respond|say))\b/i,
];
/** An order opening a line of their side of the call: "tell...", "always...", "don't...". */
const ORDER_OPENER =
  /^\s*(?:please\s+|and\s+|so\s+)?(?:tell|ask|let|make|have|get|share|send|give|forward|show|book|buy|order|pay|call|text|email|remember|ignore|disregard|forget|override|always|never|don'?t|do not|stop|start|keep|be sure|make sure)\b/i;
/** A word mixing Latin with Cyrillic or Greek letters: a look-alike hiding a word ("pаssword"). */
const MIXED_SCRIPT =
  /(?=[^\s]*\p{Script=Latin})(?=[^\s]*[\p{Script=Cyrillic}\p{Script=Greek}])[^\s]+/u;

const any = (patterns: readonly RegExp[], text: string): boolean =>
  patterns.some((p) => p.test(text));

/** Words aimed at the assistant or its rules: read back later, they'd be planted instructions. */
function addressesAssistant(text: string, orders: boolean): boolean {
  return AT_ASSISTANT.test(text) || any(RULES, text) || (orders && ORDER_OPENER.test(text));
}

/** A line never kept (see the module comment). `orders`: an opening order counts too. */
export function unsafeLine(text: string, orders = true): boolean {
  return (
    isRiskyCallerText(text) ||
    containsContactData(text) ||
    CODE.test(text) ||
    SPELLED_NUMBER.test(text) ||
    any(MONEY, text) ||
    any(SECRET, text) ||
    any(ADDRESS, text) ||
    MIXED_SCRIPT.test(text) ||
    addressesAssistant(text, orders)
  );
}

/** Words that are the owner, the person speaking or Ferni: no name holding one is kept. */
const SELF_WORDS = new Set(
  'me myself i you user caller speaker ferni assistant ai them him her someone somebody unknown my our the'.split(
    ' '
  )
);

/** The name to keep them under, or null for a self-name, a number, no name or anything unsafe. */
export function calleeName(raw: string | undefined): string | null {
  const name = callerText(raw, 60);
  const words = name
    .toLowerCase()
    .split(/[^\p{L}'-]+/u)
    .filter(Boolean);
  if (!/\p{L}/u.test(name) || /\d/.test(name) || words.length === 0 || words.length > 5)
    return null;
  if (words.every((w) => SELF_WORDS.has(w) || w === 'and')) return null;
  if (/\b(?:me|myself|ferni|caller|user|speaker|assistant)\b/i.test(name)) return null;
  if (name.includes('[removed]') || unsafeLine(name, false)) return null;
  return name;
}

/** Relations that are someone's child, at any age (person-key.ts canonical names). */
const CHILD_RELATIONS = new Set([
  'child',
  'son',
  'daughter',
  'grandchild',
  'grandson',
  'granddaughter',
  'stepson',
  'stepdaughter',
]);
/** Words that make anyone a kid: "my little nephew", "the kids", "my girl", "the baby". */
const KID_WORDS =
  /\b(?:kids?|kiddos?|child(?:ren)?|baby|babies|toddlers?|teens?|teenagers?|little|boy|girl|grandkids?|grandbab(?:y|ies)|godson|goddaughter|step-?kids?|stepchild(?:ren)?|minor)\b/i;

/** The person called is someone's child or reads as a kid: nothing of theirs is kept. */
export function childContact(words: ReadonlyArray<string | undefined>): boolean {
  return words.some((w) => {
    if (!w) return false;
    const key = personKey(callerText(w, 60));
    return (key.startsWith('rel:') && CHILD_RELATIONS.has(key.slice(4))) || KID_WORDS.test(w);
  });
}

/** Under 18 or at school, in the third person a summary uses ("he's 14", "in ninth grade"). */
const MINOR_TEXT = [
  new RegExp(
    `\\b(?:is|he's|she's|they're|i'm|im|turned|turning|turns|aged?)\\s+(?:only\\s+|just\\s+)?${UNDER_18}\\b(?![\\s,-]+(?:${NUMBER_WORD}|\\d))(?![\\s-]*(?:%|percent|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|o'?clock|am|pm|blocks?|miles?|feet|ft|times|:|\\.\\d))`,
    'i'
  ),
  new RegExp(`\\b${UNDER_18}[\\s-]+(?:years?|yrs?)[\\s-]+old\\b|\\b${UNDER_18}[\\s-]*y/?o\\b`, 'i'),
  /\b(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)[\s-]+grade(?:rs?)?\b/i,
  /\b(?:middle|high|elementary|primary|junior high|grade|grammar|nursery|secondary)\s+school\b/i,
  /\b(?:kindergarten|preschool|pre-k|daycare|homework|recess|my teacher|my mom says|my dad says)\b/i,
];

/** Text that reads as a minor's: their own stated age (minor-care's detector) or MINOR_TEXT. */
export function soundsMinor(text: string): boolean {
  const t = text.replace(/[‘’]/g, "'");
  return statesUnder18(t) || any(MINOR_TEXT, t);
}

/**
 * Third-person crisis words a summary uses that the crisis guard (first person) can miss:
 * "she doesn't want to live anymore". Fail closed: a false match only keeps their words out.
 */
const CRISIS_TEXT = [
  /\b(?:doesn'?t|don'?t|does not|do not|didn'?t|no longer)\s+want(?:s|ed)?\s+to\s+(?:live|be (?:here|alive|around)|go on|wake up)\b/i,
  /\bwant(?:s|ed)?\s+to\s+(?:die|disappear|end it)\b|\b(?:kill|hurt|harm|cut)(?:ing|s)?\s+(?:her|him|them|my|your)sel(?:f|ves)\b/i,
  /\b(?:end(?:ing)? (?:things|everything)|can'?t go on|take (?:all )?(?:her|his|their|my) (?:pills|meds)|(?:se )?quiere(?:n)? morir|no quiere(?:n)? vivir|matarse|quitarse la vida)\b/i,
  /\b(?:suicid\w*|self[- ]harm\w*|overdos\w*|end (?:it all|(?:her|his|their|my) (?:own )?life)|no reason to (?:live|go on)|better off (?:dead|without (?:her|him|me|them|us)))\b/i,
  // Ferni's own stand-in lines (caller-text.ts crisisCallerLine, riskyCallerLine), whatever name they carry
  /\bsounded like someone may not be safe\b|\bsaid something about money, an account or a number\b/i,
  /\b(?:not|isn'?t|wasn'?t)\s+safe\s+(?:at home|with (?:him|her|them))\b|\b(?:hits?|hit|beats?|beat|chok\w+)\s+(?:her|him|me)\b/i,
];

/** Crisis or risky words anywhere in their text, or Ferni's own line standing in for them. */
export function concerning(texts: ReadonlyArray<string | undefined>, name: string): boolean {
  return texts.some((text) => {
    if (!text?.trim()) return false;
    const { risky, safety } = screenCallerParts(text, name, 10_000);
    return risky || safety || isRiskyCallerText(text) || any(CRISIS_TEXT, text);
  });
}
