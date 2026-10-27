/**
 * Imminent means in hand, said plainly (#2697): "i have the pills right here and i'm taking them
 * now" read nothing on the patterns, so a classifier timeout (and assessSafety, which never asks
 * it) gave no crisis response. CRISIS_MEANS_IN_HAND: off | shadow (default) | live.
 *
 * Each form below is either live or shadow-only (#2717 lead decision, round 1): a form is live only
 * if it gave 0 false 911 scripts on the held-out ordinary and medication lines with no everyday
 * exemption at all. The rest never change a read; the classifier's second read decides those turns.
 * - live: the live forms, the caller's own and unsoftened, read explicit and imminent (911 first).
 * - shadow: reads stay exactly as on main.
 * - in both, crisis-means-shadow.ts logs the tier and the form any form would give (ids only), so
 *   shadow forms can be promoted from real data.
 * - off: as on main, no log.
 *
 * A form that is softened in any way (negated, joking, the past, hypothetical, someone else's) adds
 * nothing at all, not even a frame, so mayFill (crisis-classifier-v3.ts) still lets v3 fill.
 *
 * @module CrisisMeansInHand
 */

import { explicitModifier } from './crisis-modifiers.js';

export type MeansInHandMode = 'off' | 'shadow' | 'live';
/** Which forms a read uses: none (off, shadow), the live ones, or all of them (the shadow log). */
export type MeansForms = 'none' | 'live' | 'all';

/** The forms a mode reads with; 'all' is the shadow log's own read, never a turn's. */
export const meansFormsOf = (mode: MeansInHandMode | 'all'): MeansForms =>
  mode === 'live' ? 'live' : mode === 'all' ? 'all' : 'none';

/** shadow unless set to off or live. */
export function resolveMeansInHandMode(
  env: Record<string, string | undefined> = process.env
): MeansInHandMode {
  const raw = env.CRISIS_MEANS_IN_HAND?.trim().toLowerCase();
  return raw === 'off' || raw === 'live' ? raw : 'shadow';
}

/** Tools and toys called guns, and ropes for play or work, are not the means. */
const TOOL_GUN = String.raw`(?<!\b(?:nail|glue|water|nerf|toy|heat|staple|spray|paint|caulk|caulking|squirt|bb|airsoft|paintball|grease|massage|label|price|tattoo|foam|bubble|glitter|radar|speed|scan|scanner|barcode|drill|rivet|tape|dart|flare|starter|laser|cap|finger|hot glue|thermometer|temperature|temp|brad|tack|stud|ice|snow|hot|silicone|tire|air|\w+ing) )`;
const PLAY_ROPE = String.raw`(?<!\b(?:jump|jumping|skip|skipping|tow|climbing|tug of war|clothes|bungee|dog|swing) )`;
const MEANS = String.raw`(?:pills|meds|tablets|${TOOL_GUN}gun|pistol|${PLAY_ROPE}rope|noose|razor|blades?)`;
const WHERE = String.raw`(?:right here|in my hands?|in front of me)(?: (?:right here|in my hands?|in front of me|right now))?`;
const PILLS_TAKEN = String.raw`(?:them|em|these|those|every (?:last |single )?(?:one|pill)(?: i have)?|all of (?:them|em|these|those|the pills|my pills)|(?:all )?(?:the|my) (?:pills|meds|tablets)|(?:these |those )?(?:pills|meds|tablets)|the (?:whole|entire) bottle|everything|a (?:bottle|handful)(?: of (?:pills|meds|tablets|them|sleeping pills|painkillers))?)`;
/**
 * An everyday purpose after a comma carries the clause on ("i have the rope right here, tie it to
 * the tent"); a comma before anything else ends it.
 */
const RISK_GERUND = String.raw`(?:taking|swallowing|downing|ending|dying|bleeding|saying|leaving|going|crying|shaking|killing|hanging|cutting|burning|choking|waiting|writing|thinking|wishing|praying|sitting|standing|holding|loading|aiming|pointing|counting down|shooting)\b`;
const EVERYDAY_AFTER_COMMA = String.raw`(?:to|for|so|because|cause|cuz|since|like|as|with|from|which|that'?s|(?:it'?s|it is) (?:time )?for|they'?re for|should i|can i|do i|how|what|when|where|is it|are they|tie|tying|count|counting|shave|shaving|belay|belaying|clean|cleaning|sort|sorting|trim|trimming|wrap|wrapping|we'?re|we are|we'?ll|we'?ve|locked|unloaded|in the (?:safe|case|holster|drawer)|the (?:dog|cat|puppy|kitten|vet|deer|boat|kayak|tent)'?s?|my (?:dog|cat|puppy|kitten)'?s?|(?!${RISK_GERUND})\w{3,}ing|my (?:[\w-]+ )?(?:meds|medication|medicine|pills|vitamins|antidepressants|antibiotics|prescription|dose|doctor|nurse|pharmacist)|the (?:doctor|nurse|pharmacist)|i'?m (?:about to |going to |just )?(?:shav|count|clean|ty|tie|trim|hunt|climb|belay|sort|organiz|cook|bak)\w*|i'?m cutting (?!myself|my (?:wrists?|arms?|thighs?|legs|skin)))\b`;
/** "and" ends the clause, unless an everyday plan follows ("and we're going sailing"). */
const EVERYDAY_AFTER_AND = String.raw`(?:we'?re|we are|we'?ll|then (?:go|going|head|heading) to (?:bed|sleep|work|school)|the (?:deer|dog|boat))\b`;
/** Run-on speech-to-text has no punctuation: a goodbye or a plea right after still ends it. */
const RUN_ON = String.raw`goodbye|bye|i love you|love you|i'?m sorry|sorry|i'?m scared|please|forgive me|don'?t (?:call|tell|try|come|stop)|tell (?:my|everyone|them|him|her)|nobody|no one|i can'?t|i'?m done|it'?s over`;
const CLAUSE_END = String.raw`(?= *(?:$|[.!?;]|,(?! *${EVERYDAY_AFTER_COMMA})|and\b(?! ${EVERYDAY_AFTER_AND})|but\b|now\b|right now\b|ready\b|loaded\b|it'?s\b|already\b|just now\b|(?:${RUN_ON})\b))`;
const SELF_HARM_DONE = String.raw`(?:bleeding|blood everywhere|overdos\w*|took (?:all )?(?:the|my) (?:pills|meds)|took them all|swallowed (?:them|the|all|my)|(?:pills|meds) are (?:working|kicking in)|noose|the rope (?:held|is around)|cut my wrists?)`;
const DID_IT = String.raw`\bi (?:just |finally |actually |already )?(?:did it|went through with it)\b`;
/**
 * A dose, for the past tense. Seth's call on #2697: "i took my meds" and "yes i took them" are
 * medication check-ins, so a past dose needs one of these (the classifier still reads the rest).
 */
const DOSE_TAKEN = String.raw`(?:(?:them|em|these|those) all|all of (?:them|em|these|those|the pills|my pills|my meds)|all (?:the|my) (?:pills|meds|tablets)|the (?:whole|entire) bottle|everything|every (?:last |single )?(?:one|pill)(?: i (?:have|had))?|a (?:bottle|handful|bunch|whole bottle)(?: of (?:pills|meds|tablets|them|sleeping pills|painkillers))?|(?:like |about |maybe |over )?(?:[1-9]\d|\d{3,}) (?:of (?:them|em|my pills|my meds)|pills|tablets))`;
/** A strength is not a count: "500 mg of tylenol", "25 units of insulin". */
const NOT_A_UNIT = String.raw`(?! ?(?:mg|mgs|mcg|µg|ug|milligrams?|micrograms?|grams?|g|units?|u|ml|mls|milliliters?|millilitres?|cc|iu|drops?|puffs?|mmol|percent|%)\b)`;
const DRUGS = String.raw`(?:tylenol|advil|ibuprofen|acetaminophen|paracetamol|aspirin|benadryl|xanax|ambien|oxy(?:codone|contin)?|percocet|vicodin|sleeping pills|painkillers|insulin|lithium|seroquel|klonopin|valium)`;

/** A form's name, logged by the shadow read (crisis-means-shadow.ts). */
export type MeansFormName =
  | 'on_body'
  | 'drug_count'
  | 'means_with_intent'
  | 'means_in_hand'
  | 'taking_now'
  | 'took_dose'
  | 'did_it'
  | 'cutting_now'
  | 'ending_beside_means';

/** The means in hand and the caller's own intent to act now, in one clause. */
/**
 * The means this form pairs with intent: plurals, knives, a bottle and "everything" too. The
 * caller's own medication alone ("my pills", not "all my pills") is how a check-in is said.
 */
const PAIRED_MEANS = String.raw`(?:(?<!(?<!\ball )\bmy (?:[\w-]+ ){0,2})(?:pills|meds|tablets)|${TOOL_GUN}(?:hand|shot)?guns?|pistols?|revolvers?|rifles?|firearms?|${PLAY_ROPE}ropes?|noose|belts?|cords?|razors?|blades?|knife|knives|a bottle|the bottle|everything)`;
const MEANS_HELD = String.raw`(?:\b(?:i|i'?ve|i'?m|i have|i got)\b[^.!?]{0,25}\b${PAIRED_MEANS}\b[^.!?]{0,30}\b${WHERE}|\b${PAIRED_MEANS}\b (?:is |are )?${WHERE})\b`;
const INTENT_NOW = String.raw`(?:i'?m|i am) (?:taking|takin|swallowing|downing) (?:them|em|it|these|those|the pills|the meds|all of them)|(?:i'?m|i am) (?:going to|about to) (?:take|swallow|do it|end it|use it|pull the trigger|kill myself|shoot myself|hang myself)|(?:i'?m|i am) doing it|doing it (?:now|tonight|right now)`;

/**
 * The forms, in order. Each must end its clause (or run on with "and", "now", a goodbye).
 */
interface MeansForm {
  name: MeansFormName;
  re: RegExp;
  tag: 'suicidal' | 'self_harm';
}
const FORMS: readonly MeansForm[] = [
  // "the pills are in my hand and i'm taking them now", "the gun is in my hand, i'm doing it tonight".
  {
    name: 'means_with_intent',
    re: new RegExp(String.raw`${MEANS_HELD}[^.!?]{0,20}?\b(?:${INTENT_NOW})\b`),
    tag: 'suicidal',
  },
  // Means on the body: "the noose is around my neck", "gun pointed at my head".
  {
    name: 'on_body',
    re: /\bnoose (is )?(around|on) my neck\b|\b(gun|pistol|revolver) (is )?(pointed|aimed) at my (head|chest|temple|face)\b|\b(knife|blade|razor) (is )?(to|against|on) my (wrists?|throat|neck)\b|\bloaded (gun|pistol|revolver)\b[^.!?]{0,20}\b(next to me|in my lap|in my hand)\b/,
    tag: 'suicidal',
  },
  // An overdose named by the drug: "i took 40 tylenol", "a whole bottle of tylenol".
  {
    name: 'drug_count',
    re: new RegExp(
      String.raw`\b(?:took|taken|swallowed|downed) (?:like |about |maybe |over |almost )?(?:(?:[1-9]\d|\d{3,})\b${NOT_A_UNIT}|a (?:bunch|handful|lot|whole bottle)|all|too many|the (?:whole|entire|rest of the) (?:bottle|pack))\b[^.!?]{0,25}\b${DRUGS}\b`
    ),
    tag: 'suicidal',
  },
  // "i have the pills right here", "got the gun in my hand", "the razor is right here".
  {
    name: 'means_in_hand',
    re: new RegExp(
      String.raw`(?:\b(?:i|i'?ve|i'?m|i have|i got)\b|(?:^|[.!?,] ?)got\b)[^.!?]{0,25}\b${MEANS}\b[^.!?]{0,30}\b${WHERE}\b${CLAUSE_END}` +
        String.raw`|\b${MEANS}\b[^.!?]{0,30}\bin my hands?\b${CLAUSE_END}` +
        String.raw`|\b(?:my|the|these|all the)(?: [\w-]+'?s)? ${MEANS} (?:are|is) ${WHERE}\b${CLAUSE_END}`
    ),
    tag: 'suicidal',
  },
  // "i'm taking them now", "i'm about to take them all now".
  {
    name: 'taking_now',
    re: new RegExp(
      String.raw`\b(?:i'?m|i am) (?:taking|takin|swallowing|downing) ${PILLS_TAKEN}(?: all)? (?:now|right now)\b${CLAUSE_END}` +
        String.raw`|\b(?:i'?m )?(?:going to|about to) (?:take|swallow) ${PILLS_TAKEN}(?: all)? (?:now|right now)\b${CLAUSE_END}`
    ),
    tag: 'suicidal',
  },
  // "i swallowed a handful of pills", "just took them all".
  {
    name: 'took_dose',
    re: new RegExp(
      String.raw`(?:\bi(?:'ve| have)? |^|[.!?,] ?)(?:(?:already|just) )?(?:took|swallowed|downed|taken) ${DOSE_TAKEN}\b${CLAUSE_END}`
    ),
    tag: 'suicidal',
  },
  // "i did it" beside an overdose or self-harm already done.
  {
    name: 'did_it',
    re: new RegExp(
      String.raw`\b${SELF_HARM_DONE}[\s\S]{0,60}${DID_IT}|${DID_IT}[\s\S]{0,60}\b${SELF_HARM_DONE}`
    ),
    tag: 'suicidal',
  },
  // Self-harm underway, said as it happens.
  {
    name: 'cutting_now',
    re: /\b(i'm|i am) (cutting|burning) (myself|my (wrists?|arms?|thighs?|legs|skin)) (right )?now\b/,
    tag: 'self_harm',
  },
];

/** The means at hand, beside the caller's own ending words. */
const MEANS_AT_HAND =
  /\b(pills|gun|rope|razor|blade|knot)\b[^.!?]{0,25}\b(ready|in my hand|in my lap|loaded|next to me|right here)\b/;

const NEGATOR = String.raw`(?:\b\w+n't|\bnot|\bnever|\bcannot)\b`;
const FILLER = String.raw`(?: (?:really|even|ever|actually|currently|still|got|going to|gonna|about to|want to|planning to|plan to))*`;
const HOLD_VERB = String.raw`(?:have|has|had|got|keep|kept|own|hold|holding|take|taking|took|swallow|swallowing|swallowed|grab|get|touch|any)\b`;
const MEANS_NOUN = String.raw`(?:pills|meds|tablets|guns?|pistol|rope|noose|razors?|blades?|knife)\b`;
/** In the matched words: "i don't have any pills", "i'd never have the rope". */
const NEGATED_VERB = new RegExp(String.raw`${NEGATOR}${FILLER} ${HOLD_VERB}`);
/** In the clause: "i have no pills right here", "without the gun". */
const NO_MEANS = new RegExp(String.raw`\b(?:no|zero|without)(?: [\w'-]+){0,2} ${MEANS_NOUN}`);
/** Governing a match that starts at the means: "i don't have the [pills right here]". */
const NEGATED_BEFORE = new RegExp(
  String.raw`${NEGATOR}${FILLER} ${HOLD_VERB}(?: any)?(?: of)?(?: (?:the|my|a|those|these|any))? ?$`
);
const STARTS_AT_MEANS = new RegExp(
  String.raw`^(?:(?:the|my|these|those|a|all the) )?${MEANS_NOUN}`
);
/** Not happening, asked in the clause: "what if i had the pills right here", "asked if i have". */
const HYPOTHETICAL =
  /\b(what if|imagine if|imagine (me|having)|suppose i|supposing|pretend(ing)? (that )?i\b|hypothetical(ly)?|(asked|asking|asks|ask) (me )?(if|whether)|wonder(ing)? (if|whether)|if i (had|were|was|ever))\b/;
/** Not happening, told in the sentence: a dream or a story. */
const STORY =
  /\b(dreamed|dreamt|dreaming|in (my|a|the) dream|had a (dream|nightmare)|in (the|a|this) (movie|film|book|game|show|story|scene|play|novel|video)|(a|the) (song|movie|film|book|game|show|scene|character|novel|story) (called|where|about|that|with)|song called|lyrics?)\b/;
/** Someone else's words, reported: "she said i'm taking them now", "he texted me \"i did it\"". */
const REPORTED =
  /\b(he|she|they|my (\w+ )?(friend|brother|sister|mom|mother|dad|father|son|daughter|kid|child|wife|husband|partner|boyfriend|girlfriend|cousin|roommate|coworker|neighbor))('s| is| was)? (said|says|texted|texts|wrote|writes|told me|posted|messaged|keeps saying|just said)\b/;
/** A quote opened after the reporting words and still open where the match starts. */
const QUOTED = new RegExp(String.raw`${REPORTED.source}[^"]*"[^"]*$`);
/** Softened in a way the shared modifiers miss: negated means, or not happening. */
export function meansSoftened(text: string, start: number, end: number): boolean {
  const span = text.slice(start, end);
  const clause =
    text
      .slice(0, start)
      .split(/[.!?;,]|\bbut\b|\band\b|\bso\b/)
      .pop() ?? '';
  const sentence = text.slice(0, start).split(/[.!?]/).pop() ?? '';
  return (
    NEGATED_VERB.test(span) ||
    NO_MEANS.test(clause + span) ||
    (STARTS_AT_MEANS.test(span) && NEGATED_BEFORE.test(clause)) ||
    HYPOTHETICAL.test(clause + span) ||
    STORY.test(sentence + span) ||
    REPORTED.test(clause) ||
    QUOTED.test(sentence)
  );
}

/**
 * The live forms: each gave 0 false 911 scripts on the held-out ordinary and medication lines with
 * no everyday exemption (numbers in the #2717 body). Every other form only feeds the shadow log.
 */
export const LIVE_FORMS: ReadonlySet<MeansFormName> = new Set<MeansFormName>([
  'on_body',
  'drug_count',
  'means_with_intent',
  'took_dose',
  'did_it',
  'cutting_now',
  'ending_beside_means',
]);

/**
 * The imminent read a form adds, and which form, or null. With 'live' only live forms count; with
 * 'all' every form does (the shadow log). A form counts only when it is the caller's own and
 * nothing softens it (spans the patterns softened stay softened); every match is read, not just the
 * first, so a softened one never hides a later real one.
 */
export function meansInHandRead(
  text: string,
  indicators: readonly string[],
  softened: ReadonlyArray<readonly [number, number]>,
  forms: MeansForms
): { tag: 'suicidal' | 'self_harm'; form: MeansFormName } | null {
  if (forms === 'none') return null;
  const free = (start: number, end: number): boolean =>
    !softened.some(([s, e]) => start < e && end > s) && !meansSoftened(text, start, end);
  const counts = (form: MeansFormName): boolean => forms === 'all' || LIVE_FORMS.has(form);
  for (const { name, re, tag } of FORMS) {
    if (!counts(name)) continue;
    for (const m of text.matchAll(new RegExp(re.source, 'g'))) {
      const end = m.index + m[0].length;
      if (free(m.index, end) && explicitModifier(text, m.index, end, true) === null) {
        return { tag, form: name };
      }
    }
  }
  // Ending words already read explicit, with the means at hand: 911 first (severity unchanged).
  if (!counts('ending_beside_means')) return null;
  if (!indicators.includes('explicit_crisis_language') && !indicators.includes('plan_or_means')) {
    return null;
  }
  for (const m of text.matchAll(new RegExp(MEANS_AT_HAND.source, 'g'))) {
    if (free(m.index, m.index + m[0].length))
      return { tag: 'suicidal', form: 'ending_beside_means' };
  }
  return null;
}
