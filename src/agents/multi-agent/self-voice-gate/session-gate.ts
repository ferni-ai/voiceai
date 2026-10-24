/**
 * The self-voice gate on a live call. SELF_VOICE_GATE=shadow taps Ferni's audio, scores
 * the caller's mic every 10 ms and, on each barge-in fast-path firing and each pause or
 * interruption that clears the room output, logs one SELF_VOICE_SHADOW line for the last
 * second. It changes nothing; off (the default) installs nothing at all.
 *
 * @module agents/multi-agent/self-voice-gate/session-gate
 */
import type { AudioFrame } from '@livekit/rtc-node';
import { getLogger } from '../../../utils/safe-logger.js';
import type { LiveCallBehaviorsInput } from '../live-call-behaviors.js';
import { chainAudioSource, type Queued } from '../resume-buffer.js';
import { GateV0 } from './gate-v0.js';
import { MediaClock } from './media-clock.js';
import { RefRing, tapAudioSource } from './reference-tap.js';

const log = getLogger();

type Env = Record<string, string | undefined>;

/** off | shadow for now; the fastpath and sdk modes come with the PRs that act on it. */
export function selfVoiceGateMode(env: Env = process.env): 'off' | 'shadow' {
  return env.SELF_VOICE_GATE?.trim().toLowerCase() === 'shadow' ? 'shadow' : 'off';
}

/** A pause right after a fast-path firing is the same event: one line for both. */
const DEDUPE_MS = 300;

interface GateState {
  readonly room: RefRing;
  readonly clip: RefRing;
  readonly gate: GateV0;
  clock: MediaClock | null;
  sessionId?: string;
  lastLogAt: number;
}

const states = new WeakMap<object, GateState>();
const now = (): number => performance.now();

function ensureState(session: object, sessionId?: string): GateState {
  let state = states.get(session);
  if (!state) {
    const room = new RefRing();
    const clip = new RefRing();
    const gate = new GateV0(
      { meanSquare: (at, ms) => room.meanSquare(at, ms) + clip.meanSquare(at, ms) },
      (error) => log.warn({ sessionId, error: String(error) }, 'self-voice gate failed open')
    );
    state = { room, clip, gate, clock: null, lastLogAt: -Infinity };
    states.set(session, state);
  }
  if (sessionId) state.sessionId = sessionId;
  return state;
}

/** The gate's view of the last second, logged in shadow mode. No transcript text. */
export function logSelfVoiceShadow(session: object, trigger: 'fastpath' | 'output-cleared'): void {
  const state = states.get(session);
  if (!state) return;
  try {
    const at = now();
    if (trigger === 'output-cleared' && at - state.lastLogAt < DEDUPE_MS) return;
    state.lastLogAt = at;
    log.info({ sessionId: state.sessionId, ...state.gate.window(), trigger }, 'SELF_VOICE_SHADOW');
  } catch (error) {
    log.warn({ sessionId: state.sessionId, error: String(error) }, 'self-voice shadow log failed');
  }
}

/** Every inbound mic frame (agent-setup.ts): the backchannel gets it as before, then the gate. */
export function micFrameTap(
  session: object,
  frame: AudioFrame,
  backchannel: { processAudioFrame: (frame: AudioFrame) => void } | null | undefined
): void {
  backchannel?.processAudioFrame(frame);
  const state = states.get(session);
  if (!state) return;
  try {
    state.clock ??= new MediaClock(frame.sampleRate);
    const at = state.clock.stamp(frame.samplesPerChannel, now());
    state.gate.pushMic(frame.data, at, frame.channels, frame.sampleRate);
  } catch (error) {
    log.warn({ sessionId: state.sessionId, error: String(error) }, 'self-voice mic tap failed');
  }
}

/** The backchannel clips play from the same phone speaker: they are reference too. */
export function tapClipSource(session: object, source: unknown, env: Env = process.env): void {
  if (selfVoiceGateMode(env) === 'off') return;
  tapAudioSource(source, ensureState(session).clip, { now });
}

/** Tap the room output now and whenever the room replaces it (never-silent-install triggers). */
export function installSelfVoiceGate(input: LiveCallBehaviorsInput, env: Env = process.env): void {
  if (selfVoiceGateMode(env) === 'off') return;
  const { session, sessionId, sessionEventHandlers } = input;
  // Shadow must never break call setup: a failure here only loses the shadow logs.
  try {
    const state = ensureState(session, sessionId);
    const onClear = (): void => logSelfVoiceShadow(session, 'output-cleared');
    const tapRoom = (): void => {
      try {
        const output = session.output.audio as unknown as Queued | undefined;
        tapAudioSource(chainAudioSource(output), state.room, { now, onClear });
      } catch (error) {
        log.warn({ sessionId, error: String(error) }, 'self-voice room tap failed');
      }
    };
    tapRoom();
    const events = input.sessionWithEvents as { on: (event: string, h: () => void) => void };
    for (const event of ['speech_created', 'agent_state_changed', 'user_state_changed']) {
      events.on(event, tapRoom);
      sessionEventHandlers.push({ event, handler: tapRoom });
    }
  } catch (error) {
    log.warn({ sessionId, error: String(error) }, 'self-voice gate install failed');
  }
}
