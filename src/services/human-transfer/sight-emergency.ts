/**
 * "I can't see" as a medical emergency (#3000, CRISIS_SIGHT_NEEDS_CUE, off by default;
 * CRISIS_LEXICAL_V2 turns it on too).
 *
 * Prod, 2026-10-29: a caller said "I can't see." about text messages that hadn't
 * arrived. The medical check took any "i can't see" as an emergency (severity 10),
 * logged a crisis signal, and the crisis follow-up note rode every later turn.
 *
 * With the flag on, main's alarm stands for every "i can't see" except an utterance
 * that is ONLY one everyday "can't see" clause: a screen, a text, an app, the menu, a
 * sign, "what you mean", "the point", glasses, the lights being off, a video call,
 * "can't see myself doing that", with optional filler and a short enumerated tail
 * (JUST_EVERYDAY). Any other word keeps the alarm (fail closed), and an acute cue
 * keeps it as well. So the flag never drops an alarm main gives for anything more
 * than that one clause (held-out tests pin this line by line).
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

/*
 * JUST_EVERYDAY: the only words that can drop main's alarm. The whole utterance must
 * be one everyday "can't see" clause and nothing else: an everyday object or context,
 * optional filler, and at most a short benign tail, all enumerated. A second clause,
 * a body part, a feeling, "please", "help", a place or an activity, or any word not
 * listed here keeps the alarm (fail closed).
 */
const FILLER = String.raw`(?:u+m+|u+h+|uhm|h+m+|oh|ok|okay|so|well|like|sorry|lol|ha(?:ha)+|yeah|honestly|actually|hey)`;
const DET = String.raw`(?:the|your|my|his|her|their|our|this|that|these|those|a|any|its)`;
const ADJ = String.raw`(?:new|last|latest|shared|little|tiny|small|top|bottom|whole|other|same|first|group|live|zoom|hidden|instagram)`;
const THING = String.raw`(?:screens?|phone screen|texts?|text messages?|messages?|e-?mails?|apps?|pages?|pictures?|photos?|pics?|captions?|subtitles?|menu|board|whiteboard|signs?|tv|television|attachments?|notifications?|comments?|posts?|buttons?|invites?|calendar invite|calendar|folders?|files?|links?|map|website|site|tablet|laptop|computer|monitor|phone|inbox|font|print|label|score|game|stage|slides?|recipe|price|deadline|form|clock|chat|video|reply|replies|voicemail|document|doc|results?|feed|stream|story|receipt|tracking number|scoreboard|caller id|downloads)`;
const NP = String.raw`(?:${DET} )?(?:${ADJ} )?${THING}(?: (?:on|in|from) (?:${DET} )?(?:${ADJ} )?${THING})?`;
const FIGURATIVE = String.raw`(?:the point(?: of (?:it|that|this))?|why|how|what you mean|what you meant|what you're getting at|what you are getting at|you on (?:the |this )?(?:zoom|video|call|camera|screen|facetime)|myself (?:doing|living|working|moving) (?:that|there|it|this)(?: job)?)`;
const CONTEXT = String.raw`(?:the power (?:went|is) out|the power's out|the lights? (?:are|is|went) (?:off|out)|it'?s (?:too |pitch )?dark(?: in here)?|the lamp (?:burned|went) out|the light'?s (?:broken|out)|my glasses are (?:in the other room|upstairs|downstairs|in the car)|i (?:don'?t have|forgot|left) my (?:reading )?(?:glasses|contacts)(?: on| in| at home| upstairs)?|my contacts are out)`;
const TAIL = String.raw`(?:yet|right now|now|on my end|anymore|any more|at all|either|what you sent|the text you mean|can you resend it|can you send it again|it never came through|it hasn'?t come through|it didn'?t come through|it hasn'?t (?:loaded|shown up|come up)|it won'?t load|it'?s not loading|it'?s still loading|it froze|on my (?:phone|screen)|without my (?:reading )?(?:glasses|contacts)|for some reason|from here)`;
const SEP = String.raw`(?:,? )`;
const JUST_EVERYDAY = new RegExp(
  String.raw`^(?:${FILLER}${SEP})*i (?:can'?t|cannot|can not) see(?: (?:${NP}|${FIGURATIVE}|(?:anything|something) (?:on|in) ${NP})(?:${SEP}${TAIL})*| (?:it|them|that)(?:${SEP}${TAIL})+|${SEP}(?:because |since )?${CONTEXT})(?:${SEP}${FILLER})*$`
);

/** The utterance as one plain line: lower case, straight apostrophes, no end punctuation. */
const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[\s.!?…]+$/, '')
    .trim();

/** True when these (lower-cased) words describe sight lost to a medical emergency. */
function sightEmergency(text: string): boolean {
  if (SIGHT_LOSS.some((p) => p.test(text))) return true;
  const acute =
    ACUTE_CUES.some((p) => p.test(text)) ||
    (WENT_DARK.test(text) && !LIGHT_OUT.test(text)) ||
    ((SEES_NOTHING.test(text) || TOTAL_LOSS.test(text)) && SUDDEN_OR_DISTRESS.test(text));
  if (MAIN_SEE.test(text)) return acute || !JUST_EVERYDAY.test(plain(text));
  return SAYS_CANT_SEE.test(text) && acute;
}

/**
 * The medical check's "i can't breathe/see/feel/move". Flag off: main's regex.
 * Flag on: breathe/feel/move as main, and sight by sightEmergency.
 */
export const SENSE_LOSS_MEDICAL = {
  source: MAIN_SENSES.source,
  test: (text: string): boolean =>
    flagOn('CRISIS_SIGHT_NEEDS_CUE') || flagOn('CRISIS_LEXICAL_V2') // CRISIS_LEXICAL_V2 implies it
      ? OTHER_SENSES.test(text) || sightEmergency(text)
      : MAIN_SENSES.test(text),
};
