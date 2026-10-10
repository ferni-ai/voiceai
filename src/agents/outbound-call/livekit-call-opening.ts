/**
 * LiveKit side of the on-behalf call opening (see call-opening.ts): watches the
 * phone participant's sip.callStatus for the real answer, runs LiveKit's
 * answering-machine detection on the first words, and speaks or hangs up.
 *
 * @module agents/outbound-call/livekit-call-opening
 */

import { getJobContext, voice } from '@livekit/agents';
import { RoomEvent, type Participant, type Room } from '@livekit/rtc-node';
import { createLogger } from '../../utils/safe-logger.js';
import { getOutboundCallContext } from '../../intelligence/context-builders/external/outbound-call-context.js';
import { hangUpCall, onBehalfCallFor } from './call-control.js';
import {
  openOnBehalfCall,
  voicemailInstructions,
  type CallOpeningFacts,
  type FirstWords,
} from './call-opening.js';

const log = createLogger({ module: 'livekit-call-opening' });

/** Longer than the dial's ringing timeout, so the SIP side always decides first. */
const ANSWER_WAIT_MS = 60_000;

/** The phone leg's identity, set by the orchestrator when it dials. */
export const phoneIdentity = (callId: string) => `phone_${callId}`;

/** Resolves true when the phone is answered (sip.callStatus 'active'), false if it never is. */
export function waitForCallActive(room: Room, identity: string, timeoutMs = ANSWER_WAIT_MS) {
  return new Promise<boolean>((resolve) => {
    const status = (p?: Participant) => p?.attributes?.['sip.callStatus'];
    const done = (answered: boolean) => {
      clearTimeout(timer);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttributes);
      room.off(RoomEvent.ParticipantDisconnected, onLeft);
      resolve(answered);
    };
    const check = (p?: Participant) => {
      if (status(p) === 'active') done(true);
      else if (status(p) === 'hangup') done(false);
    };
    const onAttributes = (_changed: Record<string, string>, p: Participant) => {
      if (p.identity === identity) check(p);
    };
    const onLeft = (p: Participant) => {
      if (p.identity === identity) done(false);
    };
    const timer = setTimeout(() => done(false), timeoutMs);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttributes);
    room.on(RoomEvent.ParticipantDisconnected, onLeft);
    check(room.remoteParticipants.get(identity));
  });
}

interface CallingAgent {
  session: unknown;
  /** The persona's own speech path (multi-agent); falls back to session.say. */
  say?: (text: string, options?: { allowInterruptions?: boolean }) => void;
  userData?: { greetingText?: string; greetingInjected?: boolean };
  /** Deferred handlers (silence prompts, check-ins): wired once a person is on the line. */
  wireHandlers?: () => Promise<void>;
}

/**
 * If this session is placing an on-behalf call, run the human opening in the
 * background instead of the normal greeting and return true.
 */
export function openIfOnBehalfCall(sessionId: string, agent: CallingAgent): boolean {
  const call = onBehalfCallFor(sessionId);
  const context = getOutboundCallContext(sessionId);
  if (!call || !context) return false;

  const session = agent.session as voice.AgentSession;
  const facts: CallOpeningFacts = {
    recipientName: context.recipientName,
    requesterName: context.userName,
    personal: context.callType === 'personal',
  };
  const identity = phoneIdentity(call.callId);

  void openOnBehalfCall(facts, {
    waitForAnswer: () => waitForCallActive(getJobContext().room, identity),
    hearFirstWords: async (): Promise<FirstWords> => {
      const detector = new voice.AMD(session, {
        participantIdentity: identity,
        humanSilenceThresholdMs: 500, // answer "Hello?" within about half a second
        noSpeechTimeoutMs: 2_500, // a silent pickup gets "Hello?" after ~2.5 s
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
        .generateReply({ instructions: voicemailInstructions(facts, context.purpose) })
        .waitForPlayout(),
    hangUp: async (disposition) => {
      await hangUpCall(sessionId, disposition);
    },
  }).then((answered) => {
    log.info({ callId: call.callId, answered }, 'Call opening finished');
    if (answered === 'person' || answered === 'silence' || answered === 'error') {
      void agent.wireHandlers?.();
    }
  });
  return true;
}
