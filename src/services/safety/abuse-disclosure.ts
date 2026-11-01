/**
 * ABUSE_DISCLOSURE_PATTERNS (off by default): a caller saying someone hurts them is a safety
 * turn, answered as one: are you safe right now, then the line that fits.
 *
 * On main, "my stepdad hits me when he's drunk", "my dad threw me down the stairs" and "my
 * girlfriend threw me against the wall" read nothing on a first turn: the transfer patterns only
 * name he, she, a partner or a spouse, and the suicide classifier reads abuse at random, often as
 * "someone else is at risk" (L8 recall audit, 2026-11-01). With the flag on, a turn whose words
 * say a named person (a parent or step-parent, a parent's partner, a sibling, a relative, a
 * coach or teacher, a partner, or he, she or they) hits, beats, chokes, throws or pushes, locks
 * in, starves or threatens the caller, or bruised them, is a crisis-level safety turn, after
 * every other read:
 *
 * - ask whether they are safe right now, and 911 if they are in danger now;
 * - Childhelp for a family member, relative, coach or teacher (a child's line); the National
 *   Domestic Violence Hotline for a partner; either, by age, when only "he" or "she" is named;
 * - the 988 line too unless the whole call is abuse-only (selfRiskOnCall).
 *
 * Only adds: a turn already read as a crisis keeps everything it had, and gains the indicators.
 * Anchored so everyday uses never match (round 1 review, 2026-11-01): a negator before the verb
 * ("my dad never hits me"), games and sport ("beats me at chess", "hits me in sparring"), a
 * non-physical "with" ("hits me with homework", "a late fee"), "threw me into the deep end",
 * hurt feelings ("my ex really hurt me when she left"), joking threats ("she'll kill me if I'm
 * late") and "scared to go home" with an everyday reason ("my mom will see my report card").
 *
 * @module AbuseDisclosure
 */

import { flagOn } from '../../config/env-flag.js';
import type { CrisisVerdict } from './crisis-classifier.js';
import type { CrisisDetectionResult } from './crisis-guard.js';
import { CRISIS_RESOURCES } from './crisis-response.js';
import { SEVERITY } from './crisis-severity.js';
import { EMERGENCY_NUMBER } from './emergency-number.js';

type Env = Record<string, string | undefined>;
export type AbuseWho = 'child' | 'partner' | 'unknown';

const FAMILY =
  "(?:step ?)?(?:dad|daddy|father|mom|mommy|mum|mother|parents?|brother|sister)|(?:mom|mum|mother|dad|father)'?s (?:boyfriend|girlfriend|husband|wife|partner)|uncle|aunt|cousin|grand(?:pa|ma|father|mother)|coach|teacher|babysitter|foster (?:mom|dad|parents?)";
const PARTNER = 'boyfriend|girlfriend|husband|wife|partner|fianc[eé]e?|ex';
/** "my older brother", "my new boyfriend". */
const KIN = '(?:(?:older|younger|big|little|oldest|youngest|twin|new|current|real|own) )?';
/** Who: "my <family>", "my <partner>", or he, she, they; up to four words before the verb. */
const WHO = `(?<!\\b(?:not|never|no one|nobody) (?:that |like |saying )?)\\b(?:my ${KIN}(?<family>${FAMILY})|my ${KIN}(?<partner>${PARTNER})|(?<pronoun>he|she|they))\\b(?:'ll|'d)?(?: [\\w']{1,30}){0,4}? `;
/**
 * Not when a negator governs the verb itself: "never hits me", "doesn't hit me", "has never once
 * hit me", "would never hurt me". A negator elsewhere is no negation: "never stops hitting me",
 * "won't stop hitting me", "doesn't stop yelling and hits me".
 */
const NOT_NEGATED =
  "(?<!(?:\\bnever|\\bnot|n't|\\bno longer|\\bhardly(?: ever)?|\\brarely)(?: (?:ever|once|even|really|actually|truly|always))? )";
/** Where a blow lands: "in the face", "across the face", "on the head". */
const BODY =
  '(?:face|head|stomach|belly|chest|back|eye|eyes|mouth|jaw|ribs|nose|arm|arms|leg|legs|gut|neck|throat|ear|side)';
/** What a blow is struck with: "with a belt", never "with homework" or "with a water balloon". */
const OBJECT =
  '(?:belts?|bats?|sticks?|a switch|fists?|hands?|shoes?|boots?|(?:extension )?cords?|wires?|(?:coat )?hangers?|(?:wooden )?spoons?|(?:frying )?pans?|bottles?|paddles?|whips?|rulers?|remotes?|chairs?|hammers?|canes?|rods?|whatever)';
/** What a body is thrown or pushed against or into. */
const SURFACE =
  '(?:the |a |my )?(?:walls?|doors?|floor|ground|table|counter|car|dresser|closet|mirror|stairs|steps|fridge|refrigerator|tub|bathtub|window|cabinet|bed ?frame|corner|furniture|desk|tv|radiator|cupboard|sink|concrete|pavement|street)\\b';
/** Places a blow happens: "hits me at home". Any other "at" is a game ("beats me at chess"). */
const PLACE = '(?:home|night|school|work|church|the house|his place|her place|their place)';
const BLOW =
  '(?:hits?|hitting|beats?|beating|beat|punch(?:es|ed|ing)?|kicks?|kicked|kicking|slaps?|slapped|slapping|smacks?|smacked|whips?|whipped|whoops?|whooped)';
/**
 * What the threat is conditional on: telling someone, leaving them, going to the police. Not an
 * errand ("if I leave the gate open", "if I tell the dog joke").
 */
const THREAT_IF =
  'tell (?:anyone|anybody|someone|somebody|people|the police|the cops|a teacher|my \\w{1,30}|on (?:him|her|them))|tell(?=\\s*(?:[.,!?;]|$))|leave(?: (?:him|her|them|home|the house))?(?=\\s*(?:[.,!?;]|$|and\\b|or\\b))|go to the (?:police|cops)|call (?:the police|the cops|911|anyone|someone)|report (?:him|her|them|it)|say (?:anything|something)';
/** What they do to the caller, each anchored so everyday uses stay out. */
const ACTS = [
  // hits / beats / punches / kicks / slaps / smacks me: not "hits me up", "hits me back", "beat
  // me to it", "beat me at chess", "beats me in Mario Kart", "hits me with homework".
  `${BLOW} me(?! (?:up|back|to|over|out|under|as|that|for|off)\\b| at (?!${PLACE}\\b)| in (?!the ${BODY}\\b|front of|my (?:room|sleep|bed)\\b)| on (?!the ${BODY}\\b|purpose\\b)| with (?!(?:a |an |his |her |their |the |my )?${OBJECT}\\b))`,
  // beats me up; beat the crap out of me.
  `(?:beats?|beating|beat) (?:me up|(?:the (?:crap|hell|living daylights|snot) )?out of me)\\b`,
  // grabs me by the throat / neck / hair.
  'grab(?:s|bed|bing)? me by the (?:throat|neck|hair|arm|arms|wrist|collar)\\b',
  // chokes / strangles me; never "choked me up".
  '(?:chokes?|choked|choking|strangles?|strangled|strangling) me\\b(?! up\\b)',
  // threw / pushed me against the wall, down the stairs, out of the car; never "threw me a
  // party", "into the deep end", "into the starting lineup".
  `(?:thr(?:ew|ows?|owing)|push(?:es|ed|ing)?|shov(?:es|ed|e|ing)) me (?:(?:against|into|onto|on|to|through) ${SURFACE}|down (?:the )?(?:stairs|steps|staircase)\\b|across the (?:room|floor|kitchen|hall)\\b|out of the (?:car|house|window)\\b|off (?:the )?(?:stairs|steps|porch|balcony)\\b)`,
  // locks me in a room / closet / basement; never "locks me out of the wifi", "a headlock".
  'lock(?:s|ed)? me (?:in|inside|up)\\b(?! a headlock\\b)',
  // doesn't / won't / never feed me, at the end of the clause.
  "(?:doesn'?t|does not|won'?t|will not|never|don'?t|do not) (?:let me eat|feed me)(?=\\s*(?:[.,!?;]|$|and|for|anything|at all|when))",
  // can't stop / won't stop / never stops hurting me.
  "(?:never|won'?t|doesn'?t|don'?t|can'?t|couldn'?t|wouldn'?t|didn'?t) (?:stops?|quits?) hurting me\\b",
  // never hit me before, but last night he did.
  "(?:never|hadn'?t|had never|didn'?t) (?:ever )?(?:hit|hurt|beat|touched|laid a hand on) me (?:before|until)\\b(?:(?!\\b(?:but|and|then|until)\\b)[^.?!]){0,300}\\b(?:but|and|then|until)\\b[^.?!]{0,300}?\\b(?:he|she|they) (?:did|does|has|have|started|hit|hits|hurt|hurts)\\b",
  // hurts me, only with a physical act: never "really hurt me when she left".
  "(?:hurts?|hurting|hurt) me (?:physically|on purpose|so bad (?:that )?i (?:bleed|bled|can'?t walk)|and (?:it )?leaves? (?:marks|bruises))\\b",
  // a threat: threatened to kill me; or says he'll kill me if I tell or leave, never "she'll
  // kill me if I'm late".
  'threat(?:en|ens|ened|ening) to (?:kill|hurt|beat|stab|shoot|choke|strangle) me\\b',
  `(?:says?|said|told me|tells me)(?: that)? (?:he|she|they)(?:'?ll| will| would|'?d|'s going to|'s gonna| is going to) (?:kill|hurt|beat) me if (?:i (?:${THREAT_IF})|(?:anyone|anybody|someone) (?:finds? out|knows?))\\b`,
];
const DISCLOSURE = new RegExp(`${WHO}${NOT_NEGATED}(?:${ACTS.join('|')})`, 'gi');
/** The threat first, then who: "if I tell anyone, he'll hurt me". */
const TOLD_THREAT = new RegExp(
  `\\bif i (?:tell|say anything to) (?:anyone|anybody|someone|somebody|my \\w{1,30}|the police|a teacher),? (?:my ${KIN}(?<family>${FAMILY})|my ${KIN}(?<partner>${PARTNER})|(?<pronoun>he|she|they))(?:'?ll| will| would|'?d) (?:kill|hurt|beat) me\\b`,
  'gi'
);
/** Bruises a person left: "bruises where my dad grabbed me". */
const BRUISES =
  /\bbruises? (?:where|from where|from when|from|after) (?:\w{1,30}'?s? ){0,4}?(?:grabbed|hit|kicked|punched|squeezed|choked|threw) me\b/gi;
const FAMILY_WORD = new RegExp(`\\bmy (?:${FAMILY})\\b`, 'i');
const PARTNER_WORD = new RegExp(`\\bmy (?:${PARTNER})\\b`, 'i');
/** A game, a sport or play in the same sentence: "beats me every time we play Scrabble". */
const PLAY =
  /\b(?:play(?:s|ed|ing)?|games?|match(?:es)?|race|racing|races|chess|checkers|scrabble|monopoly|uno|cards|poker|ping ?pong|air hockey|hockey|foosball|darts|connect four|tennis|basketball|soccer|football|baseball|softball|volleyball|dodgeball|golf|bowling|catch|video ?games?|fortnite|minecraft|mario|call of duty|roblox|madden|fifa|spar(?:s|r\w*)?|boxing|karate|judo|taekwondo|wrestl\w*|mma|jiu[- ]?jitsu|bjj|fencing|practice|drills?|pillow fight|tag|thumb war|trivia|quiz|finals|tournament|league|yellow car|punch buggy|slug ?bug|water balloons?|snowballs?|nerf|tickl\w*|kidding|joking|lol|haha|fair and square)\b/i;

/**
 * Scared to go home, at the end of the clause or before tonight / because / a person; or not
 * wanting to go home because of who will be there ("I don't want to go home, he'll be there").
 */
const SCARED_HOME = new RegExp(
  `\\b(?:i'?m|i am|i'?ve been) (?:so |really |too )?(?:scared|afraid|terrified) (?:to go|of going) home(?=\\s*(?:[.,!?;]|$|tonight|because|cause|he|she|they|'cause))|\\bi (?:don'?t|do not|really don'?t) want to go (?:back )?home(?: tonight)?,? (?:because |cause |'cause |since )?(?:he|she|they|my ${KIN}(?:${FAMILY}|${PARTNER}))(?:'?ll| will|'?s| is|'?re| are) (?:be )?(?:there|home|back)\\b`,
  'gi'
);
/** An everyday reason in the same sentence: "my mom will see my report card", "it's dark". */
const EVERYDAY_REASON =
  /\b(?:grades?|report card|tests?|exams?|homework|fail(?:ed)?|curfew|late|mess|messy|my room|broke|broken|dent(?:ed)?|crashed|the car|bill|power|dark|lights?|spiders?|ghosts?|horror|movie|lost my|chores?|dishes)\b/i;

/** The caller's own words about hurting themselves, not wanting to live or no way forward. */
const SELF_HARM =
  /\b(?:(?:kill(?:ing)?|hurt(?:ing)?|cut(?:ting)?|harm(?:ing)?|burn(?:ing)?|starv(?:e|ing)|end(?:ing)?) my ?self|suicid\w*|(?:want|wanna|going|gonna) (?:to )?die|wish (?:i was|i were|i'?d (?:be|been)|i'?m) (?:dead|gone|never born)|(?:don'?t|do not) want to (?:live|be here|be alive|wake up|exist)|can'?t (?:go on|do this anymore|take (?:it|this) anymore|keep going)|end it all|end my life|take my (?:own )?life|better off (?:dead|without me)|(?:don'?t|do not) see the point|no point|no reason to (?:live|go on|keep going)|nothing to live for|what'?s the point(?: of (?:living|anything|going on|any of (?:it|this)))?|hopeless\w*|(?:life|living) (?:is not|isn'?t|ain'?t) worth (?:it|living)|not worth living|(?:take|taking|took|swallow\w*) (?:all|a bunch|a whole bottle|too many)(?: of)? (?:my |the |those )?pills|(?:no one|nobody) (?:would|will|'?d|'?ll) (?:even )?(?:miss|notice if) me|(?:tired|sick) of (?:living|being alive)|(?:want|wanna) (?:it all|everything) to end|give up on (?:life|living|everything)|sleep forever|disappear|not (?:wake|waking) up|unalive|overdos\w*|kms)\b/i;

/** The sentence a match sits in. */
function sentenceAt(text: string, start: number, end: number): string {
  const from =
    Math.max(
      text.lastIndexOf('.', start),
      text.lastIndexOf('!', start),
      text.lastIndexOf('?', start)
    ) + 1;
  const stop = text.slice(end).search(/[.!?]/);
  return text.slice(from, stop < 0 ? text.length : end + stop);
}

/** The first disclosure in these words that no game or sport in its sentence explains. */
function disclosureMatch(said: string, from: number, to: number): RegExpExecArray | null {
  const at = (re: RegExp) => matchesIn(re, said, from, to);
  const unplayed = (m: RegExpExecArray) =>
    !PLAY.test(sentenceAt(said, m.index, m.index + m[0].length));
  return at(DISCLOSURE).find(unplayed) ?? at(TOLD_THREAT)[0] ?? at(BRUISES).find(unplayed) ?? null;
}

/** Self-harm or no-way-forward words in a caller's line. */
function selfHarmWords(text: string): boolean {
  return SELF_HARM.test(text.normalize('NFKC').replace(/[’‘]/g, "'"));
}

/** What a disclosure in these words names, or null. */
export function abuseDisclosure(text: string): { who: AbuseWho; selfHarm: boolean } | null {
  const whole = text.normalize('NFKC').replace(/[’‘]/g, "'");
  for (const [said, from, to] of screenWindows(whole)) {
    const found = disclosureIn(said, from, to);
    if (found) return { who: found, selfHarm: SELF_HARM.test(whole) };
  }
  return null;
}

/**
 * A long turn (speech-to-text often drops every period) is read in windows at fixed offsets, so
 * no read scans more than SCREEN_LOOKBACK + SCREEN_STEP + SCREEN_OVERLAP characters, and none is
 * skipped. Each window owns the matches that start in its SCREEN_STEP characters; it also holds
 * SCREEN_LOOKBACK characters before them (the words before a match: "nobody like my dad...", a
 * game earlier in the sentence) and SCREEN_OVERLAP after, which is longer than any match can be
 * (word gaps are capped at 30 characters, clause gaps at 300: about 840 characters at most).
 */
const SCREEN_STEP = 1000;
const SCREEN_OVERLAP = 1000;
const SCREEN_LOOKBACK = 200;
function screenWindows(text: string): Array<[string, number, number]> {
  if (text.length <= SCREEN_STEP + SCREEN_OVERLAP) return [[text, 0, text.length]];
  const out: Array<[string, number, number]> = [];
  for (let at = 0; at < text.length; at += SCREEN_STEP) {
    const start = Math.max(0, at - SCREEN_LOOKBACK);
    out.push([
      text.slice(start, at + SCREEN_STEP + SCREEN_OVERLAP),
      at - start,
      at + SCREEN_STEP - start,
    ]);
  }
  return out;
}

/** Matches that start in [from, to); the regex still sees the words before from. */
function matchesIn(re: RegExp, said: string, from: number, to: number): RegExpExecArray[] {
  re.lastIndex = from;
  return [...said.matchAll(re)].filter((m) => m.index < to);
}

/** Who a disclosure in one window names, or null; matches start in [from, to). */
function disclosureIn(said: string, from: number, to: number): AbuseWho | null {
  const match = disclosureMatch(said, from, to);
  const home = match ? null : (matchesIn(SCARED_HOME, said, from, to)[0] ?? null);
  const scared = home !== null && !EVERYDAY_REASON.test(sentenceAt(said, home.index, said.length));
  if (!match && !scared) return null;
  const g = match?.groups ?? {};
  const family = g.family ?? (g.partner ? undefined : FAMILY_WORD.exec(said)?.[0]);
  const partner = g.partner ?? (family ? undefined : PARTNER_WORD.exec(said)?.[0]);
  return family ? 'child' : partner ? 'partner' : 'unknown';
}

/** What the call already shows besides this turn's disclosure (startTurnCrisis). */
export interface AbuseCallRisk {
  /** Risk noted on this call before this turn's own reads (crisis-call-risk.ts). */
  riskBefore: boolean;
  /** This turn's own patterns read risk, before any other read (startTurnCrisis's pattern). */
  patternRisk: boolean;
  /** The classifier read this turn as about the caller, or gave no read. */
  classifierSelf: boolean;
}

/**
 * Whether the classifier read this turn as risk to the caller. No classifier, no answer or an
 * error count as yes: 988 is only dropped when the classifier said this turn is not about that.
 */
export async function classifierReadSelf(
  run: { verdict: Promise<CrisisVerdict | null> } | null
): Promise<boolean> {
  if (!run) return true;
  const verdict = await run.verdict.catch(() => null);
  return verdict === null || (verdict.risk !== 'none' && verdict.subject === 'self');
}

/**
 * 988 stays unless the whole call is abuse-only (Seth's call (b), 2026-11-01): self-harm words
 * in this turn or an earlier one, the patterns' own risk this turn, the classifier reading the
 * turn as about the caller, or risk noted earlier on the call each keep it.
 */
function selfRiskOnCall(
  turn: { latest: string; earlier?: readonly string[] },
  call: AbuseCallRisk,
  thisTurnWords: boolean
): boolean {
  const before = (turn.earlier ?? []).filter((line) => line !== turn.latest);
  return (
    call.riskBefore ||
    call.patternRisk ||
    call.classifierSelf ||
    thisTurnWords ||
    before.some(selfHarmWords)
  );
}

const INDICATOR = 'abuse_disclosure';

/** The settled turn with the flag on: an abuse disclosure is a crisis-level safety turn. */
export function withAbuseDisclosure<T extends { crisis: CrisisDetectionResult; soft: boolean }>(
  settled: T,
  turn: { latest: string; earlier?: readonly string[] },
  call: AbuseCallRisk,
  env: Env = process.env
): T {
  if (!flagOn('ABUSE_DISCLOSURE_PATTERNS', env)) return settled;
  const found = abuseDisclosure(turn.latest);
  if (!found) return settled;
  const { crisis } = settled;
  const indicators = [
    ...crisis.indicators,
    INDICATOR,
    `${INDICATOR}_${found.who}`,
    ...(selfRiskOnCall(turn, call, found.selfHarm) ? [`${INDICATOR}_self_harm`] : []),
  ];
  return {
    ...settled,
    soft: false,
    crisis: {
      ...crisis,
      isCrisis: true,
      severity: Math.max(crisis.severity, SEVERITY.crisis),
      indicators,
      subject: 'self',
    },
  };
}

const CHILDHELP = CRISIS_RESOURCES.child_abuse[0];
const DV_HOTLINE = CRISIS_RESOURCES.domestic_abuse[0];
const LINES: Record<AbuseWho, string> = {
  child: `Offer the ${CHILDHELP.name}: call or text ${CHILDHELP.phone}, any time. If they are a child or teen, gently encourage them to tell a safe adult they trust`,
  partner: `Offer the ${DV_HOTLINE.name}: call ${DV_HOTLINE.phone} or ${DV_HOTLINE.text?.toLowerCase() ?? 'text'}, any time`,
  unknown: `If they are a child or teen, offer the ${CHILDHELP.name} (call or text ${CHILDHELP.phone}); otherwise the ${DV_HOTLINE.name} (${DV_HOTLINE.phone})`,
};

/** The crisis guidance for an abuse disclosure (turn-handler.ts), or null for any other turn. */
export function abuseGuidance(crisis: { indicators: readonly string[] }): string | null {
  if (!crisis.indicators.includes(INDICATOR)) return null;
  const who: AbuseWho = crisis.indicators.includes(`${INDICATOR}_child`)
    ? 'child'
    : crisis.indicators.includes(`${INDICATOR}_partner`)
      ? 'partner'
      : 'unknown';
  const lines = [
    '1. Believe them and thank them for telling you. Say plainly that it is not their fault',
    '2. Ask whether they are safe right now',
    `3. If they are in danger right now, tell them to call ${EMERGENCY_NUMBER}`,
    `4. ${LINES[who]}`,
    '5. Do not ask for details of what happened, and do not tell them what they must do. Never promise to keep it secret or between you, and never say or imply that you will tell anyone',
  ];
  if (crisis.indicators.includes(`${INDICATOR}_self_harm`)) {
    lines.push(
      '6. They may also be at risk of hurting themselves: include the 988 Suicide & Crisis Lifeline (call or text 988)'
    );
  }
  return `[CRITICAL - USER SAFETY]
The caller is telling you that someone is hurting them. Your response MUST:
${lines.join('\n')}`;
}
