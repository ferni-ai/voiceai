/**
 * "Tap to hear Ferni": a button shown while the browser is blocking call audio.
 *
 * Browsers won't play audio until the page has had a user gesture. Without
 * this the call looks live (avatar, captions) and the user hears nothing and
 * is never told why. Two signals show the button:
 *
 * - LiveKit's `audioPlaybackChanged` event, with `room.canPlaybackAudio` false.
 * - The connection service's own rejected play() (AUDIO_PLAY_BLOCKED_EVENT).
 *
 * Tapping it calls `room.startAudio()`, which resumes the audio context and
 * plays every attached agent track inside the gesture (the service's own
 * click-to-unlock retry runs on the same tap). The button hides once playback
 * works, and on hang-up.
 */

import { t } from '../i18n/index.js';
import { AUDIO_PLAY_BLOCKED_EVENT } from '../services/audio-play-blocked.js';
import { connectionService } from '../services/connection.service.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('TapToHear');

/** livekit-client's RoomEvent.AudioPlaybackStatusChanged. */
export const AUDIO_PLAYBACK_CHANGED = 'audioPlaybackChanged';

/** The slice of a livekit-client Room this uses. */
export interface PlaybackRoom {
  readonly canPlaybackAudio: boolean;
  startAudio(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): unknown;
  off(event: string, callback: (...args: unknown[]) => void): unknown;
}

type GetRoom = () => PlaybackRoom | null;
const defaultGetRoom: GetRoom = () => connectionService.getRoom() as PlaybackRoom | null;

const TAP_TO_HEAR_CSS = `
.tap-to-hear { display: flex; justify-content: center; margin-block: 12px; }
.tap-to-hear[hidden] { display: none; }
.tap-to-hear__button:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
`;

interface Mounted {
  row: HTMLElement;
  style: HTMLStyleElement;
}

let getRoom: GetRoom = defaultGetRoom;
let mounted: Mounted | null = null;
let watched: PlaybackRoom | null = null;
let starting = false;

function setShown(shown: boolean): void {
  if (mounted) mounted.row.hidden = !shown;
}

function mount(): Mounted {
  const style = document.createElement('style');
  style.textContent = TAP_TO_HEAR_CSS;
  document.head.appendChild(style);

  const row = document.createElement('div');
  row.className = 'tap-to-hear';
  row.setAttribute('role', 'status');
  row.hidden = true;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-primary tap-to-hear__button';
  button.textContent = t('speakerCues.tapToHear');
  button.addEventListener('click', () => void tapToHear());
  row.appendChild(button);

  // Above the call controls, so it sits where the user is already looking.
  const controls = document.querySelector('.controls-row');
  if (controls) controls.before(row);
  else document.body.appendChild(row);
  return { row, style };
}

/** Starts audio inside the tap; hides the button once it plays. */
export async function tapToHear(): Promise<void> {
  const room = getRoom();
  if (!room) {
    log.warn('Tap to hear with no call; hiding the button');
    setShown(false);
    return;
  }
  if (starting) return;
  starting = true;
  try {
    await room.startAudio();
    setShown(false);
  } catch (error) {
    log.warn('Audio still blocked after tap to hear', { error: String(error) });
  } finally {
    starting = false;
  }
}

const onPlaybackChanged = (): void => {
  if (watched) setShown(!watched.canPlaybackAudio);
};
const onPlayBlocked = (): void => setShown(true);

function detach(): void {
  watched?.off(AUDIO_PLAYBACK_CHANGED, onPlaybackChanged);
  watched = null;
  setShown(false);
}

function attach(): void {
  watched?.off(AUDIO_PLAYBACK_CHANGED, onPlaybackChanged);
  watched = getRoom();
  if (!watched) return;
  watched.on(AUDIO_PLAYBACK_CHANGED, onPlaybackChanged);
  onPlaybackChanged();
}

export function initTapToHear(roomSource: GetRoom = defaultGetRoom): void {
  disposeTapToHear();
  getRoom = roomSource;
  mounted = mount();
  document.addEventListener(AUDIO_PLAY_BLOCKED_EVENT, onPlayBlocked);
  document.addEventListener('ferni:connected', attach);
  document.addEventListener('ferni:disconnected', detach);
  attach();
}

export function disposeTapToHear(): void {
  detach();
  document.removeEventListener(AUDIO_PLAY_BLOCKED_EVENT, onPlayBlocked);
  document.removeEventListener('ferni:connected', attach);
  document.removeEventListener('ferni:disconnected', detach);
  mounted?.row.remove();
  mounted?.style.remove();
  mounted = null;
  getRoom = defaultGetRoom;
  starting = false;
}
