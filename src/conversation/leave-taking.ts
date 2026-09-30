/**
 * Saying goodbye the way a friend does.
 *
 * How a conversation ends is what people carry away from it. A friend's
 * goodbye is short and warm and holds one specific thing ("good luck on
 * Thursday, you've got this"), not "Have a great day!", a recap, or one more
 * question that keeps them on the line. This hears that the caller is
 * wrapping up and asks the reply for that kind of goodbye.
 *
 * Pure: detection and wording.
 *
 * @module conversation/leave-taking
 */

/** The end of a clause: the phrase is the point, not the start of a plan. */
const END = '(?:\\s+now)?\\s*(?:[.!,;]|$|\\s+(?:bye|thanks|thank you|talk|love you))';

/** The caller wrapping up ("I gotta run", "talk soon", "goodnight"). */
const LEAVING = new RegExp(
  [
    `\\b(?:i(?:'ve)? )?(?:got|gotta|have|need) to (?:go|run|head out|get going|hop off|jump off)${END}`,
    // "go pick up the kids", "go make dinner": leaving now to do it
    `\\b(?:got|gotta|have|need) to go (?:pick|get|grab|make|start|feed|put|help|walk|cook|take|meet|catch)\\b`,
    `\\bgotta (?:go|run|jet|bounce)${END}`,
    `\\bi(?:'d)? better (?:go|run|get going)${END}`,
    `\\bi(?:'ll| will) let you go${END}`,
    `\\btalk (?:to you )?(?:later|soon|tomorrow)\\b`,
    `\\b(?:that'?s all for (?:now|today|tonight)|bye for now|catch you later)\\b`,
    `\\b(?:bye(?: bye)?|see ya|see you(?: later| soon| tomorrow)?|take care|good ?night|night night)[.! ]*$`,
    `^\\s*(?:bye|goodbye|good ?night)\\b`,
  ].join('|'),
  'i'
);

/** Asked, not announced: "do I have to go to the party?" */
const ASKING = /^\s*(do|does|should|would|can|could|will) i\b/i;

/** True when the caller sounds like they are ending the call. */
export function isLeaving(text: string | undefined): boolean {
  if (!text) return false;
  return LEAVING.test(text) && !ASKING.test(text);
}

export const LEAVE_TAKING_CUE = [
  '[THEY ARE HEADING OFF]',
  'If they are wrapping up, say goodbye the way a friend does: warm and short.',
  'Carry one specific thing from this call (good luck with..., hope ... goes well, enjoy ...).',
  'No recap, no new question, do not hold them on the line.',
].join('\n');

/** The cue for the reply, or null when they are not leaving. */
export function leaveTakingCue(userText: string | undefined): string | null {
  return isLeaving(userText) ? LEAVE_TAKING_CUE : null;
}
