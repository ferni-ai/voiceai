/**
 * Whether Ferni really left a voicemail, and how a voicemail outcome is worded
 * to the person who asked for the call.
 *
 * Prod 2026-10-24: a call went to voicemail, the opener played over the
 * greeting, and the model then called endCall with outcome voicemail_left
 * without saying a message. The endCall tool and the call outcome trusted that
 * reason, so the requester was told "left a message", which was false.
 *
 * A voicemail counts as left only on positive evidence: a machine was heard
 * and the leave-a-voicemail path played its message to the end
 * (noteVoicemailSpoken below). Counting
 * Ferni's words in the transcript is not evidence: the opener alone is ~20
 * words, and a greeting STT missed, or saved out of order, made it count.
 * Everything else is "voicemail, no message left". Every report (live, push,
 * email, While You Were Away) words a voicemail from `voicemailLeft`, and says
 * "left a message" only when it is true.
 *
 * @module services/outreach/voicemail-outcome
 */

/**
 * Phrases only a recorded greeting says. "Not available right now" and "can't
 * come to the phone" are left out on purpose: a person can say them too, often
 * just before "don't call me again", and voicemail is the outcome that gets a retry.
 */
const RECORDED_GREETING =
  /\b(leave (me |us )?a message|(after|at) the (tone|beep)|voice ?mail|mailbox|record your message)\b/i;

/** True when the words are ones only a voicemail greeting says. */
export const isRecordedGreeting = (said: string): boolean => RECORDED_GREETING.test(said);

/** Sessions whose leave-a-voicemail path played its message (the only evidence a message was left). */
const voicemailSpoken = new Set<string>();

/**
 * Called only by the code that speaks a voicemail, once a machine was heard
 * and its message played to the end. The report says "left a message" only
 * with this, never on the model's endCall reason alone (prod 10-24).
 */
export function noteVoicemailSpoken(sessionId: string): void {
  voicemailSpoken.add(sessionId);
}

/** Whether this session's call really left a voicemail message. Read once. */
export function takeVoicemailSpoken(sessionId: string): boolean {
  return voicemailSpoken.delete(sessionId);
}

/** Drops the record when the call is forgotten (agents/outbound-call/call-control.ts). */
export function forgetVoicemailSpoken(sessionId: string): void {
  voicemailSpoken.delete(sessionId);
}

export interface VoicemailWords {
  /** The report's outcome sentence. */
  outcome: string;
  pushTitle: string;
  pushBody: string;
  emailSubject: string;
  emailLine: string;
  /** The While You Were Away summary. */
  summary: string;
  /** The heading in the live "pending call results" context. */
  label: string;
}

/** The requester-facing words for a voicemail outcome, one place for every channel. */
export function voicemailWords(left: boolean | undefined, name: string): VoicemailWords {
  return left === true
    ? {
        outcome: `I got ${name}'s voicemail and left a message letting them know you were thinking of them.`,
        pushTitle: `📞 Left voicemail for ${name}`,
        pushBody: 'They should call back soon.',
        emailSubject: `📞 Left a message for ${name}`,
        emailLine: `I left a voicemail for ${name}. I made sure to keep it warm and natural - just like you would.`,
        summary: `Left voicemail for ${name}`,
        label: 'Left voicemail',
      }
    : {
        outcome: `I got ${name}'s voicemail, but I didn't leave a message. Want me to try again later?`,
        pushTitle: `📞 Reached ${name}'s voicemail`,
        pushBody: 'No message left.',
        emailSubject: `📞 Reached ${name}'s voicemail`,
        emailLine: `I reached ${name}'s voicemail, but I didn't leave a message.`,
        summary: `Reached voicemail for ${name}, no message left`,
        label: 'Voicemail, no message left',
      };
}
