/**
 * The telephony audio profile: Ferni's reply audio shaped for a phone line
 * (phone-voice-dsp.ts), only when the person listening is on a phone.
 *
 * PHONE_VOICE_PROFILE=on (default off) turns it on. It applies to a session
 * whose caller joined as a SIP participant (kind SIP, or a `sip_`/`phone_`
 * identity): the entry notes the participant when they join
 * (`notePhoneListener`), and the post-TTS step runs every reply stream of
 * that session through the chain last, after Stage 2, so an opening breath
 * is shaped too. App and web sessions get the stream back untouched.
 *
 * Sample rate: Sonic stays at 24 kHz. The agent never sends the phone 8 kHz
 * itself: it publishes a WebRTC track (Opus, 48 kHz) and LiveKit SIP
 * transcodes it to 8 kHz PCMU. Asking Sonic for 8 kHz would add a resample
 * (8 -> 24 kHz in the agent's audio output) on top of the two that happen
 * anyway; band-limiting here leaves those resamplers nothing to alias.
 *
 * Not covered: side-track audio (backchannel clips, presence sounds via the
 * BackgroundAudioPlayer) is a separate track that LiveKit SIP mixes into the
 * call without this chain.
 *
 * @module agents/shared/performance/phone-voice-profile
 */

import { AudioFrame, ParticipantKind } from '@livekit/rtc-node';
import {
  TransformStream as NodeTransformStream,
  type ReadableStream as NodeReadableStream,
} from 'node:stream/web';

import { getLogger } from '../../../utils/safe-logger.js';
import { PhoneVoiceChain } from './phone-voice-dsp.js';

type Env = Record<string, string | undefined>;

export function phoneVoiceProfileEnabled(env: Env = process.env): boolean {
  return env.PHONE_VOICE_PROFILE?.trim().toLowerCase() === 'on';
}

export interface ParticipantLike {
  identity?: string;
  kind?: ParticipantKind | number;
}

export function isSipParticipant(p: ParticipantLike | null | undefined): boolean {
  if (!p) return false;
  return p.kind === ParticipantKind.SIP || /^(sip|phone)_/i.test(p.identity ?? '');
}

/** Phone sessions, with the leveller gain carried across their replies. */
interface PhoneListener {
  levellerGainDb: number;
}

/** Session ids are unique per call, so a stale entry never misapplies; the cap bounds memory. */
export const MAX_PHONE_SESSIONS = 256;
const phoneListeners = new Map<string, PhoneListener>();

/** Record who Ferni is talking to in this session. A non-SIP participant clears it. */
export function notePhoneListener(sessionId: string, participant: ParticipantLike | null): void {
  if (!isSipParticipant(participant)) {
    phoneListeners.delete(sessionId);
    return;
  }
  if (phoneListeners.has(sessionId)) return;
  if (phoneListeners.size >= MAX_PHONE_SESSIONS) {
    const oldest = phoneListeners.keys().next().value;
    if (oldest !== undefined) phoneListeners.delete(oldest);
  }
  phoneListeners.set(sessionId, { levellerGainDb: 0 });
  if (phoneVoiceProfileEnabled())
    getLogger().info({ sessionId }, 'PHONE_VOICE_PROFILE on for this call');
}

export function isPhoneListener(sessionId: string | undefined): boolean {
  return sessionId !== undefined && phoneListeners.has(sessionId);
}

/** For tests. */
export function clearPhoneListenersForTests(): void {
  phoneListeners.clear();
}

/**
 * The chain as a frame transform. Same frame sizes out as in; a frame that is
 * not mono passes through. `listener` (optional) carries the leveller gain.
 */
export function createPhoneVoiceTransform(
  listener?: PhoneListener
): NodeTransformStream<AudioFrame, AudioFrame> {
  let chain: PhoneVoiceChain | null = null;
  return new NodeTransformStream<AudioFrame, AudioFrame>({
    transform(frame, controller) {
      if (frame.channels !== 1) return controller.enqueue(frame);
      if (!chain || chain.sampleRate !== frame.sampleRate) {
        chain = new PhoneVoiceChain(frame.sampleRate, listener?.levellerGainDb ?? 0);
      }
      const n = frame.samplesPerChannel;
      const pcm = new Int16Array(frame.data.buffer, frame.data.byteOffset, n);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = pcm[i] / 32768;
      chain.process(x);
      const out = new Int16Array(n);
      // Int16Array wraps out-of-range values; the chain's ceiling keeps |x| < 1, this makes sure.
      for (let i = 0; i < n; i++) out[i] = Math.round(Math.max(-1, Math.min(1, x[i])) * 32767);
      if (listener) listener.levellerGainDb = chain.levellerGainDb;
      controller.enqueue(new AudioFrame(out, frame.sampleRate, 1, n));
    },
  });
}

/**
 * Last step of the post-TTS path. Returns `stream` itself unless the flag is
 * on and this session's listener is on a phone.
 */
export function applyPhoneVoiceProfile(
  stream: NodeReadableStream<AudioFrame>,
  sessionId: string | undefined,
  env: Env = process.env
): NodeReadableStream<AudioFrame> {
  if (!phoneVoiceProfileEnabled(env) || !isPhoneListener(sessionId)) return stream;
  return stream.pipeThrough(createPhoneVoiceTransform(phoneListeners.get(sessionId as string)));
}
