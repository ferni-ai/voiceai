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

/** The caller wrapping up ("I gotta run", "talk soon", "goodnight"). */
const LEAVING =
  /\b(i('ve)? (got|gotta|have|need) to (go|run|head out|get going|hop off|jump off)\b(?! to)|i gotta (go|run)\b(?! to)|i('d)? better (go|run|get going)|talk (to you )?(later|soon|tomorrow)|(good ?night|bye for now|see you (later|soon|tomorrow)|catch you later)|that'?s all for (now|today|tonight)|i('ll| will) let you go|(ok|okay|alright|all right),? (bye|night)\b|^\s*(bye|goodbye|night)\b)/i;

/** Asked, not announced: "do I have to go to the party?" */
const ASKING = /^\s*(do|does|should|would|can|could|will) i\b|\?\s*$/i;

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
