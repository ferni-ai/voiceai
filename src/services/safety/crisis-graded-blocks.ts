/**
 * CRISIS_GRADED_RESPONSE's fail-closed rows: wide readers that block L2 whenever a turn MIGHT be
 * one of the shapes L2 must never soften. They are deliberately loose. A false hit only keeps
 * main's full crisis guide, which is what every turn gets today; a miss would soften a real
 * crisis. So each reader leans to "blocked", and no live reader uses them (gradeTurn only).
 *
 * The shapes (verify of #3488 r2, and the owner's rule that someone else falling or collapsing is
 * an emergency, 911 first):
 * - someone else is named in the turn: "He collapsed.", "Grandpa fell down the stairs.";
 * - anyone down, hurt, or near means: "she fell", "My friend took pills.", "pills in my hand";
 * - a time or a decision named: "Tonight's the night. I've made up my mind.";
 * - an age under 18 or school years, said anywhere on the call: "I'm 16 by the way.";
 * - someone hurting or touching the caller: "My mom's boyfriend hurts me.";
 * - Ferni's line asked about safety, life or a plan: "Do you feel safe at home?";
 * - text these readers can't read plainly (other scripts, look-alike letters, emoji).
 *
 * @module CrisisGradedBlocks
 */
import { stripSSML } from '../../utils/text-utils.js';

/** Lower case, plain quotes, no accents or zero-width marks, one space between words. */
function plainWords(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[\u2018\u2019\u02BC\u2032`]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Plain quotes, dashes and spaces only: every other character is kept as it was said. */
const typographic = (text: string): string =>
  text
    .replace(/[\u2018\u2019\u02BC\u2032`]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\s+/g, ' ');

// Words of the other languages a caller may speak; the rows read English only.
const OTHER_LANGUAGE = new RegExp(
  String.raw`\b(?:quiero|vivir|morir|matar\w*|puedo|estoy|nadie|ya no|mi vida|je|j'en|veux|vivre|mourir|suis|moi|c'est|n'en|ich|nicht|mehr|kann|sterben|leben|mich|mir|keine?|quero|morrer|viver|voglio|vivere|morire)\b`
);

/**
 * Text these rows can't read plainly: another script, an accent, a look-alike or hidden letter,
 * an emoji (read as said, before any fold), or another language.
 */
export const unreadable = (text: string): boolean =>
  /[^\x20-\x7E]/.test(typographic(text)) || OTHER_LANGUAGE.test(plainWords(text));

/** The latest line as the folded rows read it, for the pattern read (R4). */
export const foldedLine = (text: string): string => plainWords(text);

const KIN = String.raw`(?:grand(?:ma|mother|pa|father|parents?|son|daughter|kids?|children)|great[- ]grand\w*|mom|mum|mommy|mother|dad|daddy|father|parents?|step\w*|son|daughter|kids?|child(?:ren)?|baby|babies|brother|sister|siblings?|twin|wife|husband|spouse|partner|boyfriend|girlfriend|fianc\w*|ex|friends?|bff|roommates?|flatmates?|cousins?|aunt|auntie|uncle|niece|nephew|in-laws?|neighbou?rs?|boss|coworkers?|co-workers?|colleagues?|classmates?|teacher|coach|pastor|doctor|nurse|family|guy|girl|man|woman|lady|people|teen(?:ager)?s?|students?|papa|mama|abuel[ao]s?|herman[ao]s?|hij[ao]s?|espos[ao]|novi[ao]|amig[ao]s?)`;
const SOMEONE_ELSE = new RegExp(
  String.raw`\b(?:he|she|they|him|her|them|his|hers|theirs|he's|she's|they're|someone|somebody|anyone|anybody|${KIN}s?)\b`
);

/** The turn names someone besides the caller: a pronoun, "someone", or who they are to anyone. */
export const namesSomeoneElse = (text: string): boolean => SOMEONE_ELSE.test(plainWords(text));

const DOWN_OR_MEANS = new RegExp(
  String.raw`\b(?:fell(?! (?:asleep|for|in love|behind|apart|short|through|silent|quiet)\b)|fallen|falls|falling|collaps\w*|pass(?:ed|es|ing)? out|faint\w*|black(?:ed|s|ing)? out|unconscious|unresponsive|(?:not|\w*n't) (?:breathing|moving|responding|waking)|won't wake|can'?t (?:breathe|wake|get up|move)|stopped breathing|turning blue|blue lips|hang(?:ed|ing|s)?|seizures?|bleed\w*|blood|overdos\w*|o\.?d'?(?:d|ed|ing)?|pills?|meds|medications?|tablets|capsules|bottle|swallow\w*|poison\w*|bleach|gun|guns|rope|noose|knife|knives|blade|razor|cutting|bridge|ledge|roof|jump\w*|stairs|hospital|ambulance|911|paramedics?|took (?:all|everything|too many|a (?:whole )?bunch|a handful)|taking (?:them|it|everything) all|overpass(?:es)?|(?:edge|top|side) of (?:the|a|my) (?:\w+ )?(?:bridge|roof|building|cliff|overpass|platform|balcony|ledge|tracks|garage|tower|dam)|(?:standing|sitting) (?:on|at|by|near) the (?:edge|tracks|platform|railing|ledge|rail))\b`
);

const TIME_OR_DECISION = new RegExp(
  String.raw`\b(?:(?:tonight|today)'?s the (?:night|day)|tonight is the night|today is the day|this is the (?:night|day|end))\b|\b(?:(?:made|make|making) up my mind|my mind (?:is|'s) made up|i'?ve decided|i decided|it'?s (?:time|decided)|this is it|no (?:turning|going) back)(?= ?(?:[.!]|$))|\b(?:(?:won'?t|will not) be (?:here|around)|(?:bye|goodbye) for (?:good|ever)|my last (?:night|day))\b`
);

/** The caller names a time or a decision taken: "Tonight's the night.", "I've made up my mind." */
export const statesTimeOrDecision = (text: string): boolean =>
  TIME_OR_DECISION.test(plainWords(text));

/** Someone (anyone, the caller too) is down, not breathing, hurt, or near means. */
export const downOrMeans = (text: string): boolean => DOWN_OR_MEANS.test(plainWords(text));

const AGE_WORD = String.raw`(?:[6-9]|1[0-7]|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)`;
const YOUNG = new RegExp(
  [
    String.raw`\b(?:i'?m|i am|im)(?: (?:only|just|still|like|almost|nearly|barely|about|turning|gonna be))* ${AGE_WORD}\b(?! ?(?:min|minutes?|hours?|hrs?|days?|weeks?|months?|percent|%|miles?|o'?clock|am|pm)\b)`,
    String.raw`\b${AGE_WORD}[ -]?(?:years?[ -]old|yrs?[ -]old|yo|y/o)\b`,
    String.raw`\b(?:age|aged|turn(?:ed|ing)?|i'?ll be|i will be|age is|age's) ${AGE_WORD}\b`,
    String.raw`\b(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth) grade(?:r|rs)?\b`,
    String.raw`\b(?:high|middle|junior high|elementary|grade) school(?:er)?\b|\b(?:freshman|sophomore)\b|\bmy (?:mom|dad|parents?) (?:won't|wont|don't|dont) let me\b`,
  ].join('|')
);

const ASKS_AGE = /\b(?:how old|what grade|what year|your age|still in school)\b/;
const BARE_AGE = new RegExp(String.raw`^(?:\w+ ){0,3}${AGE_WORD}\b`);

/** The line may say the caller is under 18 or at school, or answers "how old are you?" so. */
export function mayBeUnder18(text: string, companion?: string): boolean {
  const said = plainWords(text);
  if (YOUNG.test(said)) return true;
  return ASKS_AGE.test(plainWords(stripSSML(companion ?? ''))) && BARE_AGE.test(said);
}

const DOES_TO_ME = new RegExp(
  String.raw`\b(?:hurt\w*|hit|hits|hitting|beat\w*|touch\w*|chok\w*|strangl\w*|punch\w*|slap\w*|kick\w*|shov\w*|grab\w*|abus\w*|molest\w*|rap(?:e|es|ed|ing)|forc\w*|threaten\w*|burn\w*|lock\w* (?:me|us) (?:in|up|out))(?: \w+)? (?:me|us|my (?:body|privates?|private parts))\b|\bma(?:de|kes?|king) (?:me|us) do (?:things|stuff|it)\b|\binappropriate\w*\b|\bscar(?:es|ed|ing)? (?:me|us)\b|\bwhat (?:my |our )?(?:${KIN}|he|she|they) (?:does|did|keeps doing|is doing) (?:to (?:me|us)|at night|every night|when)\b|\b(?:don't|do not|dont|can't|cannot|can not) (?:want to |wanna )?go (?:back )?(?:home|to (?:my|our) (?:house|home|place))\b|\b(?:not safe|unsafe|scared|afraid) (?:at|to go) home\b|\bafraid of (?:him|her|them|my)\b`
);

/** The line may say someone hurts, touches or threatens the caller. */
export const mayDiscloseAbuse = (text: string): boolean => DOES_TO_ME.test(plainWords(text));

const SAFETY_ASK = new RegExp(
  String.raw`\b(?:safe|safety|danger\w*|alive|life|lives|living|die|dying|death|dead|suicid\w*|kill\w*|hurt\w*|harm\w*|yourself|plan|plans|taken|take anything|took anything|do it|doing it|how (?:you'?d|you would|you'?ll|you will|you might)|when (?:you'?d|you would)|where (?:you'?d|you would)|thought about (?:how|when|where|it|doing)|method|end(?:ing)? (?:it|things|your)|being here|be here|not here|someone|somebody|anyone|anybody|with you|okay|ok|alright|all right|988|911|crisis|emergency|weapon|gun|pills|meds|means|wak(?:e|ing) up|disappear\w*|go away|gone|give up|giving up|hopeless|how old|what grade|age)\b`
);

/** Ferni's line asks something that touches safety, life, harm, a plan, or who is with them. */
export function asksAnythingSafety(companion: string | undefined): boolean {
  const said = plainWords(stripSSML(companion ?? ''));
  return said.split(/(?<=[.!])\s+/).some((s) => s.includes('?') && SAFETY_ASK.test(s));
}
