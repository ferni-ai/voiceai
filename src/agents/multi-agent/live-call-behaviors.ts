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
import { installCallUserPort } from '../../services/outreach/call-user-adapter.js';
import { installConfirmThreadPort } from '../../services/outreach/confirm-thread-adapter.js';
import { installForgetFollowUpsPort } from '../../services/outreach/forget-follow-ups-adapter.js';
import { getLogger } from '../../utils/safe-logger.js';
import {
  createBargeInJudge,
  registerBargeInJudge,
} from '../../speech/graceful-interrupt/barge-in-judge.js';
import { createCallAlertSpeaker } from '../shared/call-alerts.js';
import { installMoveLog, noteMove } from '../personas/move-log.js';
import {
  createBargeInFastPath,
  installBackchannelHook,
  setBargeInFastPath,
} from './barge-in-fastpath.js';
import { liveCallSoftPause, onBargeInVerdict } from './barge-in-soft-pause.js';
import {
  isOutreachConfirmOn,
  outreachConfirmListeners,
} from '../../tools/domains/communication/outreach/outreach-confirm.js';
import { outboundPartiesFor } from '../shared/outbound-opener.js';
import { sessionIsVerifiedOwner } from '../voice-agent-entry/caller-recognition.js';
import { createTurnKeeper } from './turn-keeper.js';
import {
  followThroughOpenerEnabled,
  followThroughReplyListeners,
} from './follow-through-opener.js';
import { hasGuests, roomGuestsEnabled } from '../personas/room-guests.js';
import { installNeverSilent } from './never-silent-install.js';
import { installFinishedTurnEndpointing, installUnfinishedTurnHold } from './unfinished-turn.js';
import { endpointingDelays } from '../shared/turn-patience.js';
import {
  holdsStandDown,
  sessionTurnDetector,
  SOLE_STANDS_DOWN,
} from '../shared/turn-detector-sole.js';
import { noteBargeIn } from '../shared/turn-receipt-session.js';
import { addRecallNote, type RecallAgent } from './recall-note.js';

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
    // BARGE_IN_SOFT_PAUSE=on: pause first, cut only when confirmed (barge-in-soft-pause.ts).
    const softPause = liveCallSoftPause(input);
    const bargeIn = createBargeInFastPath({
      interrupt: () => {
        noteBargeIn(session, 'fastpath');
        try {
          session.interrupt();
          return true;
        } catch (error) {
          log.warn({ sessionId, error: String(error) }, 'barge-in fast path: interrupt failed');
          return false;
        }
      },
      log: (fields) => log.info({ sessionId, ...fields }, 'BARGE_IN_FASTPATH'),
      softPause,
    });
    if (softPause) onBargeInVerdict(input, bargeIn.onOverlapDecision);
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

  // MOVE_OUTCOMES=on: which moves each reply made, for the after-call record (move-log.ts).
  installMoveLog(session, sessionId, sessionWithEvents, sessionEventHandlers);

  // callUser rings the caller's verified phone through outreach (call-user-port.ts).
  installCallUserPort();
  // THREADS_PENDING_CONFIRM: a read-back waiting on a yes is kept as a follow-up (confirm-thread.ts).
  installConfirmThreadPort();
  // "Forget that" also closes open follow-ups about it (forget-follow-ups.ts).
  installForgetFollowUpsPort();

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
      spokeCountsAsAnswer: process.env.TURN_KEEPER_SPOKE === 'on',
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

  // Say something human when a reply fails instead of going silent (never-silent.ts).
  installNeverSilent(input);

  // Don't answer half a sentence (unfinished-turn.ts; UNFINISHED_TURN_HOLD=off). When
  // LiveKit's end-of-turn model decides alone (TURN_DETECTOR_SOLE=on), it stands down:
  // the model already waits through unfinished thoughts (turn-detector-sole.ts).
  const sole = holdsStandDown(session);
  if (!sole) {
    installUnfinishedTurnHold(session);
    // ...and answer a clearly finished sentence sooner (ENDPOINT_FAST_FINISHED=on).
    const detach = installFinishedTurnEndpointing(
      session as unknown as Parameters<typeof installFinishedTurnEndpointing>[0],
      endpointingDelays().minEndpointingDelay,
      process.env,
      (minDelayMs) => log.info({ sessionId, minDelayMs }, 'ENDPOINT_FLOOR')
    );
    if (detach) cleanupFunctions.push(detach);
  }
  const detector = sessionTurnDetector(session);
  if (detector) {
    log.info(
      { sessionId, model: detector.model, standsDown: sole ? SOLE_STANDS_DOWN : [] },
      'TURN_DETECTOR_LAYERS'
    );
    session.on(voice.AgentSessionEventTypes.EotPrediction, (ev) =>
      log.info(
        {
          model: detector.model,
          probability: ev.probability,
          threshold: ev.threshold,
          delayMs: ev.delayMs,
          inferenceMs: ev.inferenceDurationMs,
        },
        'EOT_PREDICTION'
      )
    );
  }
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

  // Texts, calls and emails wait for the caller's own yes (outreach-confirm.ts).
  if (isOutreachConfirmOn()) {
    const owner = () => speakerIsAccountOwner(sessionId);
    const confirm = outreachConfirmListeners(session, owner, confirmNote(session, sessionId));
    const handlers = [
      { event: 'user_input_transcribed', handler: confirm.onTranscript },
      { event: 'function_tools_executed', handler: confirm.onToolsExecuted },
    ];
    for (const { event, handler } of handlers) sessionWithEvents.on(event, handler);
    sessionEventHandlers.push(...handlers);
  }

  // The caller's answer to the follow-up the opener raised closes it (follow-through-opener.ts).
  if (userId && followThroughOpenerEnabled()) {
    const replies = followThroughReplyListeners({
      userId,
      isOwner: () => speakerIsAccountOwner(sessionId),
    });
    const handlers = [
      { event: 'conversation_item_added', handler: replies.onItemAdded },
      { event: 'user_input_transcribed', handler: replies.onTranscript },
    ];
    for (const { event, handler } of handlers) sessionWithEvents.on(event, handler);
    sessionEventHandlers.push(...handlers);
  }
}

/** OUTREACH_SERVER_CONFIRM: what the caller's yes sent reaches the model as a mid-call note. */
function confirmNote(session: { currentAgent: unknown }, sessionId: string) {
  return (text: string): void => {
    try {
      addRecallNote(session.currentAgent as RecallAgent, text);
    } catch (error) {
      log.warn({ sessionId, error: String(error) }, 'OUTREACH_SERVER_CONFIRM: note not added');
    }
  };
}

/** Whether the person on the line is the account owner, whose yes may confirm a send. */
export function speakerIsAccountOwner(sessionId: string): boolean {
  // ROOM_GUESTS=on: with a guest on the same mic, the yes may not be the owner's.
  if (roomGuestsEnabled() && hasGuests(sessionId)) return false;
  return !outboundPartiesFor(sessionId) && sessionIsVerifiedOwner(sessionId);
}

/** What the barge-in model decided about each overlap (see interruption-config.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function logBargeInDecisions(session: voice.AgentSession<any>, sessionId: string): void {
  session.on(voice.AgentSessionEventTypes.OverlappingSpeech, (ev) => {
    log.info(
      {
        sessionId,
        isInterruption: ev.isInterruption,
        probability: Math.round(ev.probability * 100) / 100,
        detectionDelayS: Math.round(ev.detectionDelayInS * 100) / 100,
        overlapS: Math.round(ev.totalDurationInS * 100) / 100,
      },
      'BARGE_IN_DECISION'
    );
    if (ev.isInterruption) noteBargeIn(session, 'adaptive');
  });
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
    const { attachTurnOpeningSound, earlyOpeningWaitMs, turnOpeningSoundEnabled } =
      await import('../integrations/turn-opening-sound.js');
    const { replyAudioSince, replyTextSince, holdReplyAudio, clearReplyActivity } =
      await import('../../speech/output-control/reply-activity.js');
    const { forgetLaughs, noteTurnOpened } = await import('../personas/laugh-ledger.js');
    cleanupFunctions.push(() => clearReplyActivity(sessionId));
    cleanupFunctions.push(() => forgetLaughs(sessionId));
    const earlyWaitMs = earlyOpeningWaitMs();
    if (turnOpeningSoundEnabled()) {
      cleanupFunctions.push(
        attachTurnOpeningSound(
          session as unknown as Parameters<typeof attachTurnOpeningSound>[0],
          {
            ...clips,
            // LAUGH_CAP: the reply a clip opens must not open with a laugh too (laugh-ledger.ts).
            // openerClip: the same clip, reported as 'opener' (CLIENT_SIGNALS_V2, sound-signal.ts).
            playClip: (text) => {
              const played = clips.openerClip(text);
              if (played) noteTurnOpened(sessionId);
              return played;
            },
          },
          input.lastUserFinalTranscript,
          (since) => replyAudioSince(sessionId, since),
          earlyWaitMs === null
            ? undefined
            : {
                waitMs: earlyWaitMs,
                replyTextSince: (since) => replyTextSince(sessionId, since),
                // 24 kHz mono s16le: 48 bytes a millisecond.
                clipMs: (text) =>
                  (getCachedAudioForPersona(text, input.personaId())?.byteLength ?? 0) / 48,
                holdReply: (ms) => holdReplyAudio(sessionId, ms),
              }
        )
      );
    }
    // A backchannel is a move too, on the reply whose answer it is heard in.
    const play = clips.playClip;
    return {
      ...clips,
      playClip: (text: string) => {
        const played = play(text);
        if (played) noteMove(session, 'backchannel');
        return played;
      },
    };
  }
  return clips;
}
