/**
 * Sound director: one gate in front of every sound engine on the web app.
 *
 * Without it four engines (sound.ui, audio.service with procedural sounds,
 * the Ferni audio engine behind the ritual engine, persona-magic) play on
 * their own, so a call start is three chimes, a persona switch up to three,
 * every tap clicks on a phone, and chimes land over Ferni's voice.
 *
 * With the director on, a call has three notes and a lot of silence:
 * - arrival: once per call, when Ferni joins (not on the tap);
 * - handoff: once per persona switch;
 * - goodbye: once per call end.
 * Everything else (clicks, success, message, open/close, team unlock,
 * celebrations, ritual audio) is silent. An earcon is also dropped while
 * Ferni or the caller is speaking, after MAX_EARCONS_PER_CALL in a call,
 * within MIN_EARCON_GAP_MS of the last one, and on a rejoin after a drop.
 * One saved Sound setting turns every engine off.
 *
 * Off by default: the soundDirector switch in config/motion-flags.ts (a
 * browser override or a build value). Off, every request passes and nothing
 * here changes what plays.
 *
 * @module services/sound-director
 */

import { isMotionFlagOn } from '../config/motion-flags.js';
import { createLogger } from '../utils/logger.js';
import { installEarconUnlock, playEarcon, type Earcon } from './earcon-player.js';

const log = createLogger('SoundDirector');

/** The saved Sound setting: 'off' silences every engine (director on). */
export const SOUND_SETTING_KEY = 'ferni:sound';
export const MAX_EARCONS_PER_CALL = 4;
export const MIN_EARCON_GAP_MS = 20_000;
/** A call that starts this soon after a drop is the same call coming back. */
export const REJOIN_WINDOW_MS = 120_000;

/** Which engine asks: sound.ui, audio.service, the Ferni audio engine, persona-magic. */
export type SoundEngine = 'ui' | 'effects' | 'brand' | 'magic';
export type { Earcon };

/** The slice of a livekit-client Room the speech check reads. */
export interface SpeechRoom {
  localParticipant?: { isSpeaking?: boolean };
  remoteParticipants: Map<string, unknown>;
}

export function isSoundDirectorOn(): boolean {
  return isMotionFlagOn('soundDirector');
}

/** In-memory copy, for when storage is blocked: the toggle still works for this page. */
let memorySetting = true;

export function isSoundOn(): boolean {
  try {
    const stored = localStorage.getItem(SOUND_SETTING_KEY);
    if (stored !== null) return stored !== 'off';
  } catch {
    // Storage blocked: use the in-memory value.
  }
  return memorySetting;
}

export function setSoundOn(on: boolean): void {
  memorySetting = on;
  try {
    localStorage.setItem(SOUND_SETTING_KEY, on ? 'on' : 'off');
  } catch {
    // Storage blocked: the setting lasts for this page only.
  }
}

/** Ferni (lk.agent.state) or the caller (LiveKit's active speaker) is talking. */
export function roomHasSpeech(room: SpeechRoom | null): boolean {
  if (!room) return false;
  if (room.localParticipant?.isSpeaking === true) return true;
  for (const participant of room.remoteParticipants.values()) {
    const attrs = (participant as { attributes?: Record<string, string> } | null)?.attributes;
    if (attrs?.['lk.agent.state'] === 'speaking') return true;
  }
  return false;
}

export interface SoundDirectorDeps {
  now: () => number;
  isSpeaking: () => boolean;
}

export interface SoundDirector {
  /** Whether this sound may play now. An allowed earcon counts against the call. */
  allow(engine: SoundEngine, name: string, earcon?: Earcon): boolean;
  /** A call is connecting (a tap, a retry). */
  callStarting(): void;
  /** The call dropped on its own; its end is silent and a quick retry is a rejoin. */
  callDropped(): void;
}

interface CallState {
  arrivalAsked: boolean;
  goodbyePlayed: boolean;
  played: number;
  droppedAt: number | null;
}

const freshCall = (): CallState => ({
  arrivalAsked: false,
  goodbyePlayed: false,
  played: 0,
  droppedAt: null,
});

export function createSoundDirector(deps: SoundDirectorDeps): SoundDirector {
  let call = freshCall();
  let lastEarconAt = Number.NEGATIVE_INFINITY;

  const deny = (engine: SoundEngine, name: string, reason: string): false => {
    log.debug('Sound held back', { engine, name, reason });
    return false;
  };

  return {
    allow(engine, name, earcon) {
      if (!earcon) return deny(engine, name, 'not-an-earcon');
      if (call.droppedAt !== null) return deny(engine, name, 'dropped');
      if (earcon === 'arrival') {
        // The first arrival request uses up the moment, so a rejoin never plays it.
        if (call.arrivalAsked) return deny(engine, name, 'arrival-once');
        call.arrivalAsked = true;
      }
      if (earcon === 'goodbye' && call.goodbyePlayed) return deny(engine, name, 'goodbye-once');
      if (call.played >= MAX_EARCONS_PER_CALL) return deny(engine, name, 'budget');
      const now = deps.now();
      if (now - lastEarconAt < MIN_EARCON_GAP_MS) return deny(engine, name, 'too-soon');
      if (deps.isSpeaking()) return deny(engine, name, 'speech');
      if (earcon === 'goodbye') call.goodbyePlayed = true;
      call.played += 1;
      lastEarconAt = now;
      return true;
    },
    callStarting() {
      const { droppedAt } = call;
      if (droppedAt !== null && deps.now() - droppedAt < REJOIN_WINDOW_MS) {
        call.droppedAt = null; // the same call, back: its arrival and budget carry over
        return;
      }
      call = freshCall();
    },
    callDropped() {
      call.droppedAt = deps.now();
    },
  };
}

let getSpeechRoom: () => SpeechRoom | null = () => null;
const director = createSoundDirector({
  now: () => Date.now(),
  isSpeaking: () => roomHasSpeech(getSpeechRoom()),
});

/**
 * Every engine asks here before it plays. True: the engine plays it as before
 * (director off). False: the engine stays silent; with the director on, an
 * earcon it allows plays here instead, through the one earcon output
 * (earcon-player.ts). `personaId` is the handoff's new persona.
 */
export function soundGate(
  engine: SoundEngine,
  name: string,
  earcon?: Earcon,
  personaId?: string
): boolean {
  if (!isSoundDirectorOn()) return true;
  if (earcon && isSoundOn() && director.allow(engine, name, earcon)) {
    void playEarcon(earcon, personaId);
  }
  return false;
}

export interface SoundDirectorWiring {
  getRoom: () => SpeechRoom | null;
  onConnectionState: (callback: (state: string) => void) => void;
}

/** App wiring: where to read who is speaking, and when a call starts. */
export function installSoundDirector(wiring: SoundDirectorWiring): void {
  getSpeechRoom = wiring.getRoom;
  installEarconUnlock(isSoundDirectorOn);
  wiring.onConnectionState((state) => {
    if (state === 'connecting') director.callStarting();
  });
}

/** The call dropped on its own (not a hang-up, not a planned goodbye). */
export function noteCallDropped(): void {
  director.callDropped();
}
