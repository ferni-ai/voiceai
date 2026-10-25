/**
 * Whether Ferni really left a voicemail, and how a voicemail outcome is worded
 * to the person who asked for the call.
 *
 * Prod 2026-10-24: a call went to voicemail, the opener played over the
 * greeting, and the model then called endCall with outcome voicemail_left
 * without saying a message. The endCall tool and the call outcome trusted that
 * reason, so the requester was told "left a message", which was false.
 *
 * A voicemail counts as left only when the call's committed transcript has
 * Ferni speaking a message after the greeting. Every report (live, push,
 * email, While You Were Away) words a voicemail from `voicemailLeft`, and says
 * "left a message" only when it is true.
 *
 * @module services/outreach/voicemail-outcome
 */

import type { CallTranscriptTurn } from './call-transcript-intelligence.js';

/** A real message is a few sentences; a hello or a "Hi, is this...?" is not one. */
export const MIN_VOICEMAIL_WORDS = 8;

const wordCount = (text: string): number => text.split(/\s+/).filter(Boolean).length;

/**
 * True when Ferni spoke a message after the voicemail greeting: its speech
 * after the other side's last turn (the greeting) adds up to at least
 * MIN_VOICEMAIL_WORDS. With no greeting transcribed, any speech that long
 * counts. A null transcript (capture never started) proves nothing.
 */
export function ferniLeftVoicemail(turns: readonly CallTranscriptTurn[] | null): boolean {
  if (!turns) return false;
  let lastGreeting = -1;
  turns.forEach((turn, i) => {
    if (turn.role === 'recipient') lastGreeting = i;
  });
  const after = turns.slice(lastGreeting + 1).filter((turn) => turn.role === 'agent');
  return wordCount(after.map((turn) => turn.content).join(' ')) >= MIN_VOICEMAIL_WORDS;
}

export interface VoicemailWords {
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
        pushTitle: `📞 Left voicemail for ${name}`,
        pushBody: 'They should call back soon.',
        emailSubject: `📞 Left a message for ${name}`,
        emailLine: `I left a voicemail for ${name}. I made sure to keep it warm and natural - just like you would.`,
        summary: `Left voicemail for ${name}`,
        label: 'Left voicemail',
      }
    : {
        pushTitle: `📞 Reached ${name}'s voicemail`,
        pushBody: 'No message left.',
        emailSubject: `📞 Reached ${name}'s voicemail`,
        emailLine: `I reached ${name}'s voicemail, but I didn't leave a message.`,
        summary: `Reached voicemail for ${name}, no message left`,
        label: 'Voicemail, no message left',
      };
}
