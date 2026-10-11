/**
 * LiveKit side of the on-behalf call opening (see call-opening.ts), used when
 * CALL_OPENING_AMD is on: waits for the phone to be answered, runs LiveKit's
 * answering-machine detection on the first words, and speaks or hangs up.
 *
 * @module agents/outbound-call/livekit-call-opening
 */

import { getJobContext, voice } from '@livekit/agents';
import { createLogger } from '../../utils/safe-logger.js';
import { outboundPartiesFor, waitForCallAnswered } from '../shared/outbound-opener.js';
import { getOutboundCallContext } from '../../intelligence/context-builders/external/outbound-call-context.js';
import { amdOpensCall, hangUpCall, onBehalfCallFor } from './call-control.js';
import { openOnBehalfCall, voicemailInstructions, type FirstWords } from './call-opening.js';

const log = createLogger({ module: 'livekit-call-opening' });

/** Longer than the dial's ringing timeout, so the SIP side always decides first. */
const ANSWER_WAIT_MS = 60_000;

/** The phone leg's identity, set by the orchestrator when it dials. */
export const phoneIdentity = (callId: string) => `phone_${callId}`;

interface CallingAgent {
  session: unknown;
  /** The persona's own speech path (multi-agent); falls back to session.say. */
  say?: (text: string, options?: { allowInterruptions?: boolean }) => void;
  userData?: { greetingText?: string; greetingInjected?: boolean };
  /** Deferred handlers (silence prompts, check-ins): wired once a person is on the line. */
  wireHandlers?: () => Promise<void>;
}

/**
 * With CALL_OPENING_AMD on, if this session is placing an on-behalf call, run
 * the opening in the background instead of the normal opener and return true.
 * Returns false otherwise, leaving the caller's own opening untouched.
 */
export function openIfOnBehalfCall(sessionId: string, agent: CallingAgent): boolean {
  const call = onBehalfCallFor(sessionId);
  const context = getOutboundCallContext(sessionId);
  const parties = outboundPartiesFor(sessionId);
  if (!amdOpensCall(sessionId) || !call || !context || !parties) return false;

  const session = agent.session as voice.AgentSession;
  const identity = phoneIdentity(call.callId);

  void openOnBehalfCall(parties, {
    waitForAnswer: () => {
      const room = getJobContext().room;
      // Not in the room yet means it is still dialing.
      const attributes = room.remoteParticipants.get(identity)?.attributes ?? {
        'sip.callStatus': 'dialing',
      };
      return waitForCallAnswered(room, { identity, attributes }, ANSWER_WAIT_MS, 0);
    },
    hearFirstWords: async (): Promise<FirstWords> => {
      const detector = new voice.AMD(session, {
        participantIdentity: identity,
        humanSilenceThresholdMs: 500, // answer "Hello?" within about half a second
        noSpeechTimeoutMs: 2_500, // a silent pickup gets the opener after ~2.5 s
        waitUntilFinished: true, // let a voicemail greeting finish before speaking
        interruptOnMachine: true,
      });
      try {
        const verdict = await detector.execute();
        log.info(
          { callId: call.callId, category: verdict.category, delayMs: verdict.delayMs },
          'Call answered'
        );
        return { category: verdict.category, transcript: verdict.transcript };
      } finally {
        await detector.aclose();
      }
    },
    say: async (text) => {
      if (agent.userData) {
        agent.userData.greetingText = text;
        agent.userData.greetingInjected = false;
      }
      if (agent.say) agent.say(text, { allowInterruptions: true });
      else await session.say(text, { allowInterruptions: true }).waitForPlayout();
    },
    leaveVoicemail: () =>
      session
        .generateReply({ instructions: voicemailInstructions(parties, context.purpose) })
        .waitForPlayout(),
    hangUp: async (disposition) => {
      await hangUpCall(sessionId, disposition);
    },
  }).then((answered) => {
    log.info({ callId: call.callId, answered }, 'Call opening finished');
    if (answered === 'person' || answered === 'silence' || answered === 'error') {
      agent.wireHandlers?.().catch((error: unknown) => {
        log.error({ error: String(error), callId: call.callId }, 'Deferred handler wiring failed');
      });
    }
  });
  return true;
}
