/**
 * Turn driver: the avatar follows real turns, not audio tracks.
 *
 * Without it, "speaking" means the agent's audio track is subscribed and
 * "listening" means the mic is on, both true for the whole call, so Ferni
 * never blinks, never leans in when you start talking and never shows that he
 * is thinking. This reads the same signals as the speaker cues (LiveKit's
 * `lk.agent.state` and whether you are an active speaker) and sets:
 *
 * - Ferni speaking: speaking presence and eyes.
 * - You speaking: listening presence (lean-in) and attentive eyes.
 * - Ferni thinking: the thinking pose (curious tilt, eyes up, "Thinking").
 * - Nobody: idle eyes, so the natural blink and micro-idle run again.
 *
 * Each settled change also fires a window `ferni:avatar-turn` event (detail
 * `{ speaker }`, a Speaker), which the spring body, blinks, gaze and turn
 * gestures follow. It only fires while this driver runs.
 *
 * A turn must hold for a short settle time before the avatar follows it, so
 * brief flips don't flicker. With reduced motion the settle is longer, so the
 * avatar changes pose less often.
 *
 * Off by default. Turn on: localStorage.setItem('ferni:avatar-turns', 'true')
 */

import { DURATION } from '../../config/animation-constants.js';
import { t } from '../../i18n/index.js';
import { connectionService } from '../../services/connection.service.js';
import { setAudioState } from '../../state/app.state.js';
import type { AudioState } from '../../types/events.js';
import { createLogger } from '../../utils/logger.js';
import { expressiveEyes, type VoiceState } from '../expressive-eyes.ui.js';
import { presenceUI } from '../presence.ui.js';
import { watchSpeakerSignals, type CueRoom, type SpeakerSignals } from '../speaker-cues-signals.js';
import { speakerFrom, type Speaker } from '../speaker-cues.ui.js';
import { thinkingUI } from '../thinking.ui.js';

const log = createLogger('AvatarTurns');

export const AVATAR_TURNS_FLAG_KEY = 'ferni:avatar-turns';
/** Window event fired once per settled turn change, detail `{ speaker }`. */
export const AVATAR_TURN_EVENT = 'ferni:avatar-turn';
/** How long a turn must hold before the avatar follows it. */
export const TURN_SETTLE_MS = DURATION.FAST_RELEASE;
/** The settle time when the viewer prefers reduced motion: fewer pose changes. */
export const TURN_SETTLE_REDUCED_MS = DURATION.MODERATE;

/** What the avatar shows, given who is talking. */
export interface AvatarPose {
  audio: AudioState;
  speaking: boolean;
  listening: boolean;
  eyes: VoiceState;
  thinking: boolean;
}

export const POSES: Readonly<Record<Speaker, AvatarPose>> = {
  ferni: { audio: 'speaking', speaking: true, listening: false, eyes: 'speaking', thinking: false },
  user: {
    audio: 'listening',
    speaking: false,
    listening: true,
    eyes: 'listening',
    thinking: false,
  },
  thinking: { audio: 'idle', speaking: false, listening: false, eyes: 'thinking', thinking: true },
  none: { audio: 'idle', speaking: false, listening: false, eyes: 'idle', thinking: false },
};

/** The avatar APIs the driver writes to; injectable for tests. */
export interface AvatarTargets {
  setAudioState(state: AudioState): void;
  setSpeaking(speaking: boolean): void;
  setListening(listening: boolean): void;
  setEyes(state: VoiceState): void;
  showThinking(): void;
  hideThinking(): void;
}

export const defaultTargets: AvatarTargets = {
  setAudioState,
  setSpeaking: (speaking) => presenceUI.setSpeaking(speaking),
  setListening: (listening) => presenceUI.setListening(listening),
  setEyes: (state) => expressiveEyes.setVoiceState(state),
  showThinking: () => thinkingUI.show(t('accessibility.thinking')),
  hideThinking: () => thinkingUI.hide(),
};

export interface TurnDriver {
  /** Feed the latest signals; the avatar follows once the turn settles. */
  update(signals: SpeakerSignals): void;
  /** The speaker the avatar currently shows. */
  shown(): Speaker;
  /** Stop any pending change and turn off speaking, listening and thinking. */
  dispose(): void;
}

function announceTurn(speaker: Speaker): void {
  window.dispatchEvent(new CustomEvent(AVATAR_TURN_EVENT, { detail: { speaker } }));
}

function applyPose(targets: AvatarTargets, pose: AvatarPose): void {
  // Thinking first: hiding it clears the class the eyes are about to set.
  if (!pose.thinking) targets.hideThinking();
  targets.setAudioState(pose.audio);
  targets.setEyes(pose.eyes);
  targets.setSpeaking(pose.speaking);
  targets.setListening(pose.listening);
  if (pose.thinking) targets.showThinking();
}

/** Maps signals to avatar poses, holding each change for `settleMs` first. */
export function createTurnDriver(targets: AvatarTargets, settleMs: number): TurnDriver {
  let shown: Speaker | null = null;
  let pending: Speaker | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const show = (speaker: Speaker): void => {
    clearTimer();
    const changed = speaker !== shown;
    shown = speaker;
    applyPose(targets, POSES[speaker]);
    if (changed) announceTurn(speaker);
  };

  return {
    update(signals) {
      const next = speakerFrom(signals);
      if (shown === null) return show(next); // first signal of a call: no flicker to filter
      if (next === shown) return clearTimer(); // a brief flip came back
      if (next === pending) return; // already waiting on this change
      clearTimer();
      pending = next;
      timer = setTimeout(() => show(next), settleMs);
    },
    shown: () => shown ?? 'none',
    dispose() {
      clearTimer();
      if (shown === null) return;
      if (shown !== 'none') announceTurn('none'); // the call ended: settle to rest
      shown = null;
      // Only what the driver turned on: the call's own teardown owns the rest.
      targets.hideThinking();
      targets.setSpeaking(false);
      targets.setListening(false);
    },
  };
}

export function isAvatarTurnsEnabled(): boolean {
  try {
    return localStorage.getItem(AVATAR_TURNS_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

type GetRoom = () => CueRoom | null;
const defaultGetRoom: GetRoom = () => connectionService.getRoom() as CueRoom | null;

let enabled = false;
let getRoom: GetRoom = defaultGetRoom;
let targets: AvatarTargets = defaultTargets;
let driver: TurnDriver | null = null;
let stopWatching: (() => void) | null = null;

function detach(): void {
  stopWatching?.();
  stopWatching = null;
  driver?.dispose();
  driver = null;
}

function attach(): void {
  detach();
  const room = getRoom();
  if (!room) {
    log.warn('No room on connect; avatar keeps its last pose');
    return;
  }
  const settleMs = prefersReducedMotion() ? TURN_SETTLE_REDUCED_MS : TURN_SETTLE_MS;
  const current = createTurnDriver(targets, settleMs);
  driver = current;
  stopWatching = watchSpeakerSignals(room, (signals) => current.update(signals));
}

/** Starts the driver when the flag is on; returns whether it started. */
export function initAvatarTurns(
  roomSource: GetRoom = defaultGetRoom,
  avatarTargets: AvatarTargets = defaultTargets
): boolean {
  disposeAvatarTurns();
  if (!isAvatarTurnsEnabled()) return false;
  enabled = true;
  getRoom = roomSource;
  targets = avatarTargets;
  document.addEventListener('ferni:connected', attach);
  document.addEventListener('ferni:disconnected', detach);
  if (getRoom()) attach();
  log.info('Avatar follows real turns');
  return true;
}

export function disposeAvatarTurns(): void {
  detach();
  document.removeEventListener('ferni:connected', attach);
  document.removeEventListener('ferni:disconnected', detach);
  enabled = false;
  getRoom = defaultGetRoom;
  targets = defaultTargets;
}

export type TrackTurnEvent = 'agent-audio' | 'agent-audio-end' | 'mic-on' | 'mic-off';

/**
 * What app.ts's audio-track and mic callbacks did before this driver: set the
 * avatar from track events. Does nothing while the driver owns the avatar.
 */
export function trackTurnFallback(event: TrackTurnEvent, avatar: AvatarTargets = targets): void {
  if (enabled) return;
  if (event === 'mic-on' || event === 'mic-off') return avatar.setListening(event === 'mic-on');
  const speaking = event === 'agent-audio';
  avatar.setAudioState(speaking ? 'speaking' : 'listening');
  avatar.setSpeaking(speaking);
  avatar.setEyes(speaking ? 'speaking' : 'listening');
}
