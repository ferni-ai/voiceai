/**
 * "I can't see" as a medical emergency (#3000, CRISIS_SIGHT_NEEDS_CUE, off by default).
 *
 * Prod, 2026-10-29: a caller said "I can't see." about text messages that hadn't
 * arrived. The medical check took any "i can't see" as an emergency (severity 10),
 * logged a crisis signal, and the crisis follow-up note rode every later turn.
 *
 * With the flag on, main's alarm stands for every "i can't see" except one that
 * plainly points at an everyday thing: a screen, a text, an app, the menu, a sign,
 * "what you mean", "the point", glasses, the lights being off, a video call, "can't
 * see myself doing that". Any acute cue overrides that and keeps the alarm. So the
 * flag can only drop an alarm for an everyday "can't see" with no acute cue; it never
 * drops one main gives for anything else (held-out tests pin this line by line).
 * It also adds alarms main missed: sight loss said outright ("i went blind", "my
 * vision went dark"), and anyone's "can't see" ("my dad can't see") with an acute cue.
 *
 * The signal is never logged when suppressed, so no crisis follow-up note follows.
 * There is no medical classifier to confirm with: the crisis classifier reads suicide
 * and self-harm risk only.
 *
 * @module services/human-transfer/sight-emergency
 */
import { flagOn } from '../../config/env-flag.js';

/** Main's medical sense check, kept exactly (and its source, which rawSignals carry). */
const MAIN_SENSES = /\bi can't (breathe|see|feel|move)/i;
const OTHER_SENSES = /\bi can't (breathe|feel|move)/i;
/** The "can't see" main alarms on. */
const MAIN_SEE = /\bi can't see/i;

/** Any spelling, anyone's sight ("my husband can't see", "i couldn't see", "i'm not able to see"). */
const CANT = String.raw`(?:(?:can'?t|cannot|can not|couldn'?t|could not)(?: really)?|(?:can|could) (?:barely|hardly)|(?:not able|unable) to) see`;
const SAYS_CANT_SEE = new RegExp(`\\b${CANT}\\b`);
/** Nothing is seen at all: "can't see" with no object, or "anything" / "at all" not followed by a place. */
const SEES_NOTHING = new RegExp(
  `\\b${CANT}(?:(?: (?:anything|a thing|at all|now|anymore|right now))+(?! (?:on|in|at|from|past|over|out|without|because)\\b)|(?=\\s*(?:$|[.!?,;:])))`
);
/** "can't see anything", wherever it is: with a call for help or a sudden onset, always an alarm. */
const TOTAL_LOSS = new RegExp(`\\b${CANT} (?:anything|a thing)\\b`);
const SUDDEN_OR_DISTRESS = /\b(?:suddenly|all of a sudden|out of nowhere|just now|help|scared)\b/;

/** Sight loss said outright: an emergency on its own. */
const SIGHT_LOSS = [
  /\b(?:lost|losing|lose) (?:my |the |his |her )?(?:vision|sight|eyesight)\b/,
  /\b(?:went|gone|going|go) blind\b|\bblind in (?:one|my|his|her|the) (?:left |right )?eye\b/,
  new RegExp(
    `\\b${CANT} (?:out of|from|with|through) (?:my|his|her|one|either|both|the) (?:left |right |good |bad )?eyes?\\b`
  ),
  /\b(?:my|his|her) (?:vision|eyesight|sight)\b[^.!?]{0,30}\b(?:went|gone|going|blurr\w*|black|dark|double|fading|disappear\w*)\b/,
  /\b(?:my|his|her) (?:left |right )?eyes? (?:\w+ ){0,2}(?:went|gone|going|turned) (?:all )?(?:dark|black|blurry|gr[ae]y|white)\b/,
];

/** Light going out explains "everything went dark" without anything wrong with the eyes. */
const LIGHT_OUT =
  /\b(?:lights?|power|lamp|bulb|outage|electricity|blackout|flashlight|candle|torch|screen)\b/;
const WENT_DARK =
  /\b(?:everything|it|things|the world)(?:'s| has| is)?(?: just| suddenly| all)? (?:went|going|turned|goes|gone) (?:all )?(?:black|dark|white|gr[ae]y|blurry|fuzzy)\b/;

/** Harm to an eye or the face: an injury, pain, something in it. */
const HARM = String.raw`(?:bleed\w*|blood|pain\w*|hurts?|swoll\w*|swell\w*|punch\w*|hit|flew|scratch\w*|burn\w*|sting\w*|bleach|chemicals?|acid|glass|splash\w*|poke\w*|spray\w*|fire|oil|cleaner|sanitizer|metal|weld\w*|firework|airbag|killing|exploded|burst|can'?t open|flash\w*|shadow|curtain|floaters)`;

/** A cue that puts "can't see" in the body. Any one keeps (or makes) the alarm. */
const ACUTE_CUES = [
  new RegExp(
    `\\b(?:eyes?|face)\\b[^.!?]{0,60}\\b${HARM}\\b|\\b${HARM}\\b[^.!?]{0,60}\\b(?:eyes?|face)\\b`
  ),
  /\b(?:floaters|flashes|spots|curtain|double|seeing stars)\b|\bblind\b(?! (?:without|spot))|\bout of (?:my|his|her|one|the) (?:left |right )?eye\b/,
  /\b(?:with )?the lights? (?:are|is) (?:still )?on\b/, // can't see with the lights on: not the dark
  /\b(?:numb\w*|tingl\w*|droop\w*|slurr\w*|stroke|seizure|dizz\w*|faint\w*|pass(?:ed|ing)? out|collaps\w*|headache|migraine|spinning|confus\w*|terrified)\b/,
  /\b(?:one|left|right) side\b|\bhalf of\b|\b(?:arm|hand|leg|face|side|mouth)s?\b[^.!?]{0,20}\b(?:won'?t|doesn'?t|can'?t|isn'?t) (?:work|move|grip)\w*|\b(?:arm|leg|face|side|mouth)s? (?:feels?|looks?|is|are|went|gone) (?:\w+ )?(?:heavy|weak|dead|numb|funny|weird|strange|droopy)\b/,
  /\b(?:speech|words?|talking|voice)\b[^.!?]{0,20}\b(?:weird|wrong|slurr\w*|garbled|funny|strange|jumbl\w*|mixed up|scrambled)\b|\bjumbl\w*|\bcan'?t get (?:my |the )?words out\b|\bnot making (?:any )?sense\b|\b(?:won'?t|can'?t|isn'?t) (?:talk|speak)\w*|\bnot answering (?:me )?(?:right|properly)\b/,
  /\bhit (?:in |on )?(?:the |his |her |my )?head\b|\b(?:bang\w*|bump\w*|smack\w*) (?:my|his|her) head\b|\bhead hit\b|\bwindshield\b|\bhit by\b|\bpunch\w*|\b(?:acid|chemicals?|bleach|cleaner|splash\w*|spray\w*)\b|\b(?:i|he|she|they)(?: just)? fell\b|\bfell (?:down|over|off|in)\b|\bon the floor\b/,
  /\bin (?:so much |a lot of |terrible )?pain\b|\bit hurts\b|\bhead(?:'s)? (?:hurts?|is (?:killing|pounding)|killing)\b|\bblood\b|\bbleed\w*/,
  /\b(?:sugar|blood sugar|blood pressure|insulin|diabet\w*|overdos\w*|pills|carbon monoxide|allergic|surgery|pregnant|fever|stiff neck|throw(?:ing)? up|vomit\w*|explosion|accident|smoke|breath\w*)\b|\btook (?:something|too many|too much)\b/,
  /\b(?:woke up|stood up|stand up|emergency|ambulance|911|nine one one)\b|\bcall (?:someone|somebody|for help|an ambulance)\b/,
  /\bsomething(?:'s| is) (?:really )?wrong\b|\bwhat(?:'s| is) (?:happening|going on) (?:to|with) (?:me|my)\b/,
  /\bcan'?t see\b[\s\S]*\bcan'?t see\b/, // "i can't see! i can't see!"
];

/** Words that plainly put "can't see" on an everyday thing. Only these can drop main's alarm. */
const EVERYDAY = [
  /\b(?:screens?|texts?|messages?|e-?mails?|apps?|pages?|pictures?|photos?|captions?|subtitles?|menu|board|signs?|tv|television|attachments?|notifications?|comments?|posts?|buttons?|invite|calendar|folder|files?|links?|map|website|tablet|laptop|computer|monitor|phone|inbox|font|print|label|score|game|stage|slides?|recipe|price|deadline|form|clock)\b/,
  /\bcan'?t see (?:why|how|what (?:you|she|he|they)\b|where (?:i|you|we|he|she) (?:parked|put|left)|the (?:point|problem|end|reason|difference|appeal|harm|issue)|any (?:reason|point|problem|way)|anything wrong|(?:myself|him|her|us|them|it) (?:\w+ )?\w+ing\b)/,
  /\b(?:glasses|contacts|contact lens(?:es)?)\b/,
  /\b(?:power (?:went|is) out|power'?s out|lights? (?:are |is |went |'s )?(?:off|out)|lamp|bulb|pitch (?:dark|black)|dark in here|too dark|light'?s (?:broken|out)|blackout|outage|the sun|glare|fog\w*|rain|snow|cloud\w*|stars|moon|sky)\b/,
  /\b(?:zoom|facetime|video call|webcam)\b|\bcan'?t see you (?:on|in) (?:the )?(?:call|video|camera)\b/,
  /\bblocking\b|\bin front of (?:me|us)\b|\bover the (?:fence|wall|crowd)\b|\bfrom (?:the back|bed|here|these seats|where i'?m sitting|my seat)\b/,
  /\b(?:keys|wallet|remote|parked)\b/,
];

/** True when these (lower-cased) words describe sight lost to a medical emergency. */
function sightEmergency(text: string): boolean {
  if (SIGHT_LOSS.some((p) => p.test(text))) return true;
  const acute =
    ACUTE_CUES.some((p) => p.test(text)) ||
    (WENT_DARK.test(text) && !LIGHT_OUT.test(text)) ||
    ((SEES_NOTHING.test(text) || TOTAL_LOSS.test(text)) && SUDDEN_OR_DISTRESS.test(text));
  if (MAIN_SEE.test(text)) return acute || !EVERYDAY.some((p) => p.test(text));
  return SAYS_CANT_SEE.test(text) && acute;
}

/**
 * The medical check's "i can't breathe/see/feel/move". Flag off: main's regex.
 * Flag on: breathe/feel/move as main, and sight by sightEmergency.
 */
export const SENSE_LOSS_MEDICAL = {
  source: MAIN_SENSES.source,
  test: (text: string): boolean =>
    flagOn('CRISIS_SIGHT_NEEDS_CUE')
      ? OTHER_SENSES.test(text) || sightEmergency(text)
      : MAIN_SENSES.test(text),
};
