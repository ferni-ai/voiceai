/**
 * "I can't see" as a medical emergency (#3000, CRISIS_SIGHT_NEEDS_CUE, off by default).
 *
 * Prod, 2026-10-29: a caller said "I can't see." about text messages that hadn't
 * arrived. The medical check took any "i can't see" as an emergency (severity 10),
 * logged a crisis signal, and the call was framed as a crisis from then on.
 *
 * With the flag on, "can't see" is about the body only when the words carry an
 * acute medical cue: the eyes or vision hurt, went dark or went blind, a stroke
 * sign, an injury, a call for an ambulance, or a sudden loss said with nothing
 * else seen ("i suddenly can't see anything"). Sight loss said outright ("i lost
 * my vision", "i went blind", "i can't see out of my left eye") counts on its own.
 * Everyday sight (a screen, a text, the dark, "i can't see what you mean") does not.
 *
 * There is no classifier for medical emergencies to confirm with: the crisis
 * classifier reads suicide and self-harm risk only. The live turn still reaches
 * the model and the crisis paths, which read the words themselves.
 *
 * @module services/human-transfer/sight-emergency
 */

import { flagOn } from '../../config/env-flag.js';

/** "I can't see", as main read it: anything after it counted. */
const CANT_SEE = /\bi can't see/i;

/** Any spelling, anyone's sight ("my husband can't see", "i couldn't see", "i'm not able to see"). */
const CANT = String.raw`(?:(?:can'?t|cannot|can not|couldn'?t|could not)(?: really)?|(?:can|could) (?:barely|hardly)|(?:not able|unable) to) see`;

const SAYS_CANT_SEE = new RegExp(`\\b${CANT}\\b`);

/** Nothing is seen at all: "can't see" with no object, or "anything" / "at all" not followed by a place. */
const SEES_NOTHING = new RegExp(
  `\\b${CANT}(?:(?: (?:anything|a thing|at all|now|anymore|right now))+(?! (?:on|in|at|from|past|over|out|without|because)\\b)|(?=\\s*(?:$|[.!?,;:])))`
);

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
const HARM = String.raw`(?:bleed\w*|blood|pain\w*|hurts?|swoll\w*|swell\w*|punch\w*|hit|flew|scratch\w*|burn\w*|sting\w*|bleach|chemical|acid|glass|splash\w*|poke\w*|spray\w*|fire|oil|cleaner|sanitizer|metal|weld\w*|firework|airbag|killing|exploded|can'?t open|flash\w*|shadow|curtain|floaters)`;

/** A cue that puts "can't see" in the body: an eye harmed, a stroke sign, an injury, an emergency ask. */
const ACUTE_CUES = [
  new RegExp(
    `\\b(?:eyes?|face)\\b[^.!?]{0,60}\\b${HARM}\\b|\\b${HARM}\\b[^.!?]{0,60}\\b(?:eyes?|face)\\b`
  ),
  /\b(?:floaters|flashes|black spots|dark spots|curtain)\b|\bblind\b(?! (?:without|spot))/,
  /\b(?:with )?the lights? (?:are|is) (?:still )?on\b/, // can't see with the lights on: not the dark
  /\b(?:numb\w*|tingl\w*|droop\w*|slurr\w*|stroke|seizure|dizz\w*|faint\w*|passed out|collaps\w*|headache|migraine)\b/,
  /\b(?:arm|hand|leg|face|side|mouth)s?\b[^.!?]{0,20}\b(?:won'?t|doesn'?t|can'?t|isn'?t) (?:work|move|grip)\w*|\b(?:arm|leg|face|side)s? (?:feels?|is|are|went|gone) (?:\w+ )?(?:heavy|weak|dead|numb|funny)\b/,
  /\b(?:speech|words?|talking|voice)\b[^.!?]{0,20}\b(?:weird|wrong|slurr\w*|garbled|funny|strange)\b|\bnot making (?:any )?sense\b|\b(?:won'?t|can'?t|isn'?t) (?:talk|speak)\w*|\bnot answering (?:me )?(?:right|properly)\b/,
  /\bhit (?:in |on )?(?:the |his |her |my )?head\b|\b(?:bang\w*|bump\w*|smack\w*) (?:my|his|her) head\b|\bhit by\b|\b(?:i|he|she|they)(?: just)? fell\b|\bfell (?:down|over|off|in)\b/,
  /\bin (?:so much |a lot of |terrible )?pain\b|\bit hurts\b|\bhead (?:hurts?|is (?:killing|pounding))\b|\bblood\b(?! sugar| pressure)/,
  /\b(?:blood sugar|insulin|overdos\w*)\b|\btook (?:something|too many|too much)\b/,
  /\b(?:ambulance|911|nine one one)\b/,
  /\bsomething(?:'s| is) (?:really )?wrong with (?:me|my|him|her)\b|\bwhat(?:'s| is) happening to me\b/,
];

/** With nothing seen at all, being sudden or asking for help is enough. */
const SUDDEN_OR_DISTRESS = /\b(?:suddenly|all of a sudden|out of nowhere|just now|help|scared)\b/;

/** True when these (lower-cased) words describe sight lost to a medical emergency. */
export function sightEmergency(text: string): boolean {
  if (SIGHT_LOSS.some((p) => p.test(text))) return true;
  if (!SAYS_CANT_SEE.test(text)) return false;
  if (ACUTE_CUES.some((p) => p.test(text))) return true;
  if (WENT_DARK.test(text) && !LIGHT_OUT.test(text)) return true;
  return SEES_NOTHING.test(text) && SUDDEN_OR_DISTRESS.test(text);
}

/** The medical check's sight read: flag on, sightEmergency; off, main's bare match. */
export const SIGHT_MEDICAL = {
  source: 'sight',
  test: (text: string): boolean =>
    flagOn('CRISIS_SIGHT_NEEDS_CUE') ? sightEmergency(text) : CANT_SEE.test(text),
};
