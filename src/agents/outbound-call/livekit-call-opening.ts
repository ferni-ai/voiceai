/**
 * LiveKit side of the on-behalf call opening (see call-opening.ts), used when
 * CALL_OPENING_AMD is on: waits for the phone to be answered, runs LiveKit's
 * answering-machine detection on the first words, and speaks or hangs up (or
 * answers a call screener once and waits for the person, call-screener.ts).
 *
 * @module agents/outbound-call/livekit-call-opening
 */

import { getJobContext, voice } from '@livekit/agents';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { outboundPartiesFor, waitForCallAnswered } from '../shared/outbound-opener.js';
import { getOutboundCallContext } from '../../intelligence/context-builders/external/outbound-call-context.js';
import { amdOpensCall, hangUpCall, noteVoicemailSpoken, onBehalfCallFor } from './call-control.js';
import { openOnBehalfCall, voicemailInstructions, type FirstWords } from './call-opening.js';

const log = createLogger({ module: 'livekit-call-opening' });

/** Longer than the dial's ringing timeout, so the SIP side always decides first. */
const ANSWER_WAIT_MS = 60_000;

/** No words this long after pickup is a silent pickup, which gets the opener. */
const SILENT_PICKUP_MS = 2_500;
/**
 * CALL_VOICEMAIL_V2: the same wait, long enough for a late voicemail greeting.
 * Prod 2026-10-24: a greeting began ~4-5 s after pickup; at 2.5 s it was taken
 * for a silent pickup and the opener played over it.
 */
export const FIRST_SPEECH_TIMEOUT_MS = 6_000;
/** After a call screener, silence is just waiting. */
const AFTER_SCREENER_MS = 10_000;
/** CALL_VOICEMAIL_V2: after the opener, how long to keep listening for a greeting (or a reply). */
export const AFTER_OPENER_LISTEN_MS = 8_000;
/** The longest wait for the opener to start playing before listening anyway. */
const OPENER_START_WAIT_MS = 3_000;

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
  const voicemailV2 = flagOn('CALL_VOICEMAIL_V2');
  let openerPlayed = false;

  const listen = async (noSpeechTimeoutMs: number, stage: string): Promise<FirstWords> => {
    const detector = new voice.AMD(session, {
      participantIdentity: identity,
      humanSilenceThresholdMs: 500, // answer "Hello?" within about half a second
      noSpeechTimeoutMs,
      waitUntilFinished: true, // let a voicemail greeting finish before speaking
      interruptOnMachine: true, // a machine verdict also stops Ferni mid-opener
    });
    try {
      const verdict = await detector.execute();
      log.info(
        {
          callId: call.callId,
          category: verdict.category,
          delayMs: verdict.delayMs,
          afterScreener: stage === 'after_screener',
          stage,
        },
        'Call answered'
      );
      return { category: verdict.category, transcript: verdict.transcript };
    } finally {
      await detector.aclose();
    }
  };

  void openOnBehalfCall(parties, {
    waitForAnswer: () => {
      const room = getJobContext().room;
      // Not in the room yet means it is still dialing.
      const attributes = room.remoteParticipants.get(identity)?.attributes ?? {
        'sip.callStatus': 'dialing',
      };
      return waitForCallAnswered(room, { identity, attributes }, ANSWER_WAIT_MS, 0);
    },
    hearFirstWords: (options) =>
      options?.afterScreener
        ? listen(AFTER_SCREENER_MS, 'after_screener')
        : listen(voicemailV2 ? FIRST_SPEECH_TIMEOUT_MS : SILENT_PICKUP_MS, 'pickup'),
    ...(voicemailV2 && {
      hearAfterOpener: async () => {
        // Detection holds queued speech, so it starts once the opener is playing.
        if (!openerPlayed) await speakingStarted(session, OPENER_START_WAIT_MS);
        return listen(AFTER_OPENER_LISTEN_MS, 'after_opener');
      },
    }),
    say: async (text) => {
      if (agent.userData) {
        agent.userData.greetingText = text;
        agent.userData.greetingInjected = false;
      }
      if (agent.say) agent.say(text, { allowInterruptions: true });
      else {
        await session.say(text, { allowInterruptions: true }).waitForPlayout();
        openerPlayed = true;
      }
    },
    answerScreener: async (text) => {
      await session.say(text, { allowInterruptions: false }).waitForPlayout();
    },
    leaveVoicemail: async () => {
      const message = session.generateReply({
        instructions: voicemailInstructions(parties, context.purpose),
      });
      await message.waitForPlayout();
      // Evidence for the report: a machine was heard and the message played to the end.
      if (playedToEnd(message)) noteVoicemailSpoken(sessionId);
      else log.warn({ callId: call.callId }, 'Voicemail message did not play');
    },
    carryOn: () => {
      session.generateReply();
    },
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

/** Resolves once Ferni is speaking, or after `ms` (a muted or failed opener never starts). */
function speakingStarted(session: voice.AgentSession, ms: number): Promise<void> {
  if (session.agentState === 'speaking') return Promise.resolve();
  return new Promise((resolve) => {
    const onState = (event: voice.AgentStateChangedEvent) => {
      if (event.newState === 'speaking') done();
    };
    const done = () => {
      clearTimeout(timer);
      session.off(voice.AgentSessionEventTypes.AgentStateChanged, onState);
      resolve();
    };
    const timer = setTimeout(done, ms);
    session.on(voice.AgentSessionEventTypes.AgentStateChanged, onState);
  });
}

/** The reply spoke words and was not cut off. */
function playedToEnd(handle: voice.SpeechHandle): boolean {
  const items = handle.chatItems as ReadonlyArray<{ type?: string; role?: string }> | undefined;
  return (
    !handle.interrupted &&
    (items ?? []).some((item) => item.type === 'message' && item.role === 'assistant')
  );
}
