/**
 * How Ferni opens a call it places on someone's behalf, the way people do.
 *
 * On a phone call the person who answers speaks first ("Hello?") and the
 * caller's very next turn says who is calling (Schegloff 1968, 1986), quickly:
 * human gaps cluster around 200-500 ms and silence past ~700 ms sounds like
 * trouble. So Ferni stays silent while the phone rings, waits until the line is
 * really answered, lets answering-machine detection hear the first words, then:
 * - a person said hello  -> Ferni's normal reply to it IS the opening line
 *                           (the outbound prompt fixes its wording), so only
 *                           one voice answers;
 * - a silent pickup      -> "Hello?" and the opening line (people screening
 *                           robocalls often wait for the caller to speak);
 * - voicemail            -> waits out the greeting, leaves a short message,
 *                           hangs up;
 * - full mailbox or menu -> hangs up quietly.
 *
 * The decision is pure and exported for tests; the phone, speech and hang-up
 * are ports. See reports/Natural AI phone call behavior.md for the evidence.
 *
 * @module agents/outbound-call/call-opening
 */

import { openingLine, type OpeningLineFacts } from '../../services/outreach/opening-line.js';
import type { CallDisposition } from './call-control.js';

export type CallOpeningFacts = OpeningLineFacts;
export type Answered = 'person' | 'silence' | 'voicemail' | 'unreachable' | 'not_answered';

/** The answering-machine detector's verdict, reduced to what the opening needs. */
export interface FirstWords {
  category: 'human' | 'machine-ivr' | 'machine-vm' | 'machine-unavailable' | 'uncertain';
  transcript: string;
}

export interface CallOpeningPorts {
  /** Resolves true once the line is answered, false if it never is. */
  waitForAnswer(): Promise<boolean>;
  /** Listens to the first words after pickup. */
  hearFirstWords(): Promise<FirstWords>;
  /** Speaks, interruptible. */
  say(text: string): Promise<void>;
  /** Leaves the voicemail and resolves when it has played. */
  leaveVoicemail(): Promise<void>;
  hangUp(disposition?: CallDisposition): Promise<void>;
}

/**
 * Open the call. Never throws: a failure before anyone answered hangs up; a
 * failure after leaves the conversation to carry on (Ferni's reply to their
 * "Hello?" is still the opening line).
 */
export async function openOnBehalfCall(
  facts: CallOpeningFacts,
  ports: CallOpeningPorts
): Promise<Answered | 'error'> {
  let answered = false;
  try {
    answered = await ports.waitForAnswer();
    if (!answered) {
      await ports.hangUp();
      return 'not_answered';
    }

    const heard = await ports.hearFirstWords();
    switch (heard.category) {
      case 'machine-vm':
        await ports.leaveVoicemail();
        await ports.hangUp('voicemail_left');
        return 'voicemail';
      case 'machine-unavailable':
      case 'machine-ivr':
        await ports.hangUp('unreachable');
        return 'unreachable';
      default:
        // human, or uncertain: treat as a person (mistaking one for a machine is worse)
        if (heard.transcript.trim() !== '') return 'person';
        await ports.say(`Hello? ${openingLine(facts)}`);
        return 'silence';
    }
  } catch {
    if (!answered) await ports.hangUp().catch(() => undefined);
    return 'error';
  }
}

/** What Ferni says on a voicemail: short, warm, self-contained, about 15-20 seconds. */
export function voicemailInstructions(facts: CallOpeningFacts, purpose: string): string {
  return [
    `This is ${facts.recipientName}'s voicemail, not a conversation, and the greeting has finished.`,
    'Ignore the opening-line instruction. Leave ONE short, warm message, under 20 seconds,',
    'then stop. In your own natural words:',
    `- "Hi, it's Ferni, I'm an AI that helps ${facts.requesterName} out."`,
    ...(facts.personal ? ["- That it's nothing urgent."] : []),
    `- In one sentence, why ${facts.requesterName} wanted to reach them: ${purpose}.`,
    `- No need to call you back; they can just call or text ${facts.requesterName}.`,
    '- "Thanks, bye!"',
    "No questions (it's a recording), no numbers they don't already have, nothing private.",
    "Don't call endCall; the call ends by itself after your message.",
  ].join('\n');
}
