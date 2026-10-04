/**
 * Behaviors installed on every live call's AgentSession: an interrupt trace,
 * the barge-in fast path, in-call timer alerts, the turn keeper, the hold on
 * unfinished turns and the barge-in judge.
 *
 * @module agents/multi-agent/live-call-behaviors
 */
import { voice } from '@livekit/agents';
import type { Room } from '@livekit/rtc-node';
import { registerVoiceCallbackHandler } from '../../tools/domains/simple-utilities/voice-callbacks.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  createBargeInJudge,
  registerBargeInJudge,
} from '../../speech/graceful-interrupt/barge-in-judge.js';
import { createCallAlertSpeaker } from '../shared/call-alerts.js';
import {
  createBargeInFastPath,
  installBackchannelHook,
  setBargeInFastPath,
} from './barge-in-fastpath.js';
import { createTurnKeeper } from './turn-keeper.js';
import { installUnfinishedTurnHold } from './unfinished-turn.js';

const log = getLogger();

type Handler = (...args: unknown[]) => void;

export interface LiveCallBehaviorsInput {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: voice.AgentSession<any>;
  sessionWithEvents: { on?: (event: string, handler: Handler) => void };
  /** Handlers registered here are removed with the session's other handlers. */
  sessionEventHandlers: Array<{ event: string; handler: Handler }>;
  cleanupFunctions: Array<() => void>;
  sessionId: string;
  userId: string | undefined;
}

export function installLiveCallBehaviors(input: LiveCallBehaviorsInput): void {
  const { session, sessionEventHandlers, cleanupFunctions, sessionId, userId } = input;
  const sessionWithEvents = input.sessionWithEvents as {
    on: (event: string, handler: Handler) => void;
  };
  // Diagnostics (2026-09-30): every interrupt() our code makes also cancels
  // LiveKit's preemptive reply, so log who calls it; and confirm the
  // PREEMPTIVE_DECISION patch to @livekit/agents is in this build.
  if (process.env.INTERRUPT_TRACE !== 'off') {
    const original = session.interrupt.bind(session);
    session.interrupt = ((options?: { force?: boolean }) => {
      const caller = (new Error().stack ?? '').split('\n')[2]?.trim().slice(0, 160);
      log.info({ sessionId, caller, agentState: session.agentState }, 'SESSION_INTERRUPT');
      return original(options);
    }) as typeof session.interrupt;
    void import('node:fs/promises')
      .then(async (fs) => {
        const { createRequire } = await import('node:module');
        const entry = createRequire(import.meta.url).resolve('@livekit/agents');
        const file = entry.replace(/dist\/.*$/, 'dist/voice/agent_activity.js');
        const src = await fs.readFile(file, 'utf8');
        log.info({ patched: src.includes('PREEMPTIVE_DECISION') }, 'LK_PATCH_CHECK');
      })
      .catch((error: unknown) => log.warn({ error: String(error) }, 'LK_PATCH_CHECK failed'));
  }

  // Stop Ferni within ~a second of a clear interruption (barge-in-fastpath.ts);
  // LiveKit's barge-in model still handles backchannels and short overlaps.
  if (process.env.BARGE_IN_FASTPATH !== 'off') {
    const bargeIn = createBargeInFastPath({
      interrupt: () => {
        try {
          session.interrupt();
        } catch (error) {
          log.warn({ sessionId, error: String(error) }, 'barge-in fast path: interrupt failed');
        }
      },
      log: (fields) => log.info({ sessionId, ...fields }, 'BARGE_IN_FASTPATH'),
    });
    setBargeInFastPath(session, bargeIn);
    sessionWithEvents.on('user_input_transcribed', bargeIn.onTranscript);
    sessionWithEvents.on('agent_state_changed', bargeIn.onAgentState);
    sessionWithEvents.on('user_state_changed', bargeIn.onUserState);
    sessionEventHandlers.push(
      { event: 'user_input_transcribed', handler: bargeIn.onTranscript },
      { event: 'agent_state_changed', handler: bargeIn.onAgentState },
      { event: 'user_state_changed', handler: bargeIn.onUserState }
    );
  }

  // Timers and other callbacks the caller asked for ring in this call, at a
  // pause, in Ferni's words (call-alerts.ts). Nothing registered a handler
  // before, so a finished timer was never announced.
  cleanupFunctions.push(
    registerVoiceCallbackHandler(
      userId || sessionId,
      createCallAlertSpeaker(session as never, { sessionId }),
      session
    )
  );

  // Answer a caller turn that was left hanging (turn-keeper.ts).
  if (process.env.TURN_KEEPER !== 'off') {
    const keeper = createTurnKeeper({
      session,
      reply: (userInput) => {
        try {
          // Words LiveKit never committed are still in its pending user turn;
          // clear them so they aren't prepended to the caller's next turn.
          if (userInput) {
            try {
              session.clearUserTurn();
            } catch (error) {
              log.debug({ sessionId, error: String(error) }, 'turn keeper: clearUserTurn failed');
            }
          }
          session.generateReply(userInput ? { userInput } : undefined);
        } catch (error) {
          log.warn({ sessionId, error: String(error) }, 'turn keeper: generateReply failed');
        }
      },
      log: (fields) => log.info({ sessionId, ...fields }, 'TURN_KEEPER_RECOVERED'),
    });
    const onState = () => keeper.onStateChange();
    sessionWithEvents.on('agent_state_changed', onState);
    sessionWithEvents.on('user_state_changed', onState);
    sessionWithEvents.on('user_input_transcribed', keeper.onTranscript);
    sessionWithEvents.on('conversation_item_added', keeper.onItemAdded);
    sessionEventHandlers.push(
      { event: 'agent_state_changed', handler: onState },
      { event: 'user_state_changed', handler: onState },
      { event: 'user_input_transcribed', handler: keeper.onTranscript },
      { event: 'conversation_item_added', handler: keeper.onItemAdded }
    );
    cleanupFunctions.push(() => keeper.stop());
  }

  // Don't answer half a sentence (unfinished-turn.ts; UNFINISHED_TURN_HOLD=off).
  installUnfinishedTurnHold(session);
  // One backchannel list for the patched LiveKit and the barge-in fast path.
  installBackchannelHook();

  // Open the next reply softly only after a real barge-in, not after any
  // overlap (barge-in-judge.ts). BARGE_IN_ACK=any keeps the old behavior.
  if (process.env.BARGE_IN_ACK !== 'any') {
    const judge = createBargeInJudge();
    const onAgent = (ev: unknown) => judge.onAgentState((ev as { newState?: string })?.newState);
    const onUser = (ev: unknown) => judge.onUserState((ev as { newState?: string })?.newState);
    const onItem = (ev: unknown) =>
      judge.onItemAdded((ev as { item?: { role?: string; interrupted?: boolean } })?.item);
    const onFalse = () => judge.onFalseInterruption();
    const handlers = [
      { event: 'agent_state_changed', handler: onAgent },
      { event: 'user_state_changed', handler: onUser },
      { event: 'conversation_item_added', handler: onItem },
      { event: voice.AgentSessionEventTypes.AgentFalseInterruption, handler: onFalse },
    ];
    for (const { event, handler } of handlers) sessionWithEvents.on(event, handler);
    sessionEventHandlers.push(...handlers);
    cleanupFunctions.push(registerBargeInJudge(sessionId, judge));
  }
}

/** What the barge-in model decided about each overlap (see interruption-config.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logBargeInDecisions(session: voice.AgentSession<any>, sessionId: string): void {
  session.on(voice.AgentSessionEventTypes.OverlappingSpeech, (ev) =>
    log.info(
      {
        sessionId,
        isInterruption: ev.isInterruption,
        probability: Math.round(ev.probability * 100) / 100,
        detectionDelayS: Math.round(ev.detectionDelayInS * 100) / 100,
        overlapS: Math.round(ev.totalDurationInS * 100) / 100,
      },
      'BARGE_IN_DECISION'
    )
  );
  session.on(voice.AgentSessionEventTypes.AgentFalseInterruption, (ev) =>
    log.info({ sessionId, resumed: ev.resumed }, 'BARGE_IN_FALSE_INTERRUPTION')
  );
}

export interface TurnSoundsInput {
  room: Room;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: voice.AgentSession<any>;
  sessionId: string;
  personaId: () => string;
  lastUserFinalTranscript: () => string;
  cleanupFunctions: Array<() => void>;
}

/**
 * Backchannel clips ("mm-hmm") and the turn-opening sound. Returns the clip
 * player, or null when it could not start.
 */
export async function startTurnSounds(input: TurnSoundsInput) {
  const { room, session, sessionId, cleanupFunctions } = input;
  const { startBackchannelClips } = await import('../integrations/clip-player.js');
  const { getCachedAudioForPersona } = await import('../shared/conversational-audio-cache.js');
  const clips = await startBackchannelClips(
    room,
    session as unknown as voice.AgentSession,
    input.personaId,
    getCachedAudioForPersona
  );
  if (clips) {
    cleanupFunctions.push(() => void clips.close());
    const { attachTurnOpeningSound } = await import('../integrations/turn-opening-sound.js');
    const { replyAudioSince, clearReplyActivity } =
      await import('../../speech/output-control/reply-activity.js');
    cleanupFunctions.push(() => clearReplyActivity(sessionId));
    if (process.env.TURN_OPENING_SOUND !== 'off') {
      cleanupFunctions.push(
        attachTurnOpeningSound(
          session as unknown as Parameters<typeof attachTurnOpeningSound>[0],
          clips,
          input.lastUserFinalTranscript,
          (since) => replyAudioSince(sessionId, since)
        )
      );
    }
  }
  return clips;
}
