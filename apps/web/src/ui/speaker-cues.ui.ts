/**
 * Speaker cues: during a call, show who is talking and that you can cut in.
 * Ferni talking: the avatar glows, plus "Tap to interrupt" when the agent can
 * act on it. You talking: a ring that follows your mic level. Ferni thinking:
 * a slow breath, no text. Screen readers hear one polite announcement per
 * settled change of speaker.
 *
 * Off by default. Turn on: localStorage.setItem('ferni:speaker-cues', 'true')
 */

import { t } from '../i18n/index.js';
import { connectionService } from '../services/connection.service.js';
import { createLogger } from '../utils/logger.js';
import {
  sendInterrupt,
  watchSpeakerSignals,
  type CueRoom,
  type SpeakerSignals,
} from './speaker-cues-signals.js';
import { SPEAKER_CUES_CSS } from './speaker-cues-styles.js';

const log = createLogger('SpeakerCues');

export const SPEAKER_CUES_FLAG_KEY = 'ferni:speaker-cues';
/** A speaker must hold this long before screen readers hear about it. */
export const ANNOUNCE_SETTLE_MS = 700;

export type Speaker = 'ferni' | 'user' | 'thinking' | 'none';

export function isSpeakerCuesEnabled(): boolean {
  try {
    return localStorage.getItem(SPEAKER_CUES_FLAG_KEY) === 'true';
  } catch {
    return false;
  }
}

export function speakerFrom(signals: SpeakerSignals): Speaker {
  if (signals.agentState === 'speaking') return 'ferni';
  if (signals.userSpeaking) return 'user';
  return signals.agentState === 'thinking' ? 'thinking' : 'none';
}

const ANNOUNCEMENT_KEYS: Record<Exclude<Speaker, 'none'>, string> = {
  ferni: 'speakerCues.ferniSpeaking',
  user: 'speakerCues.youSpeaking',
  thinking: 'speakerCues.ferniThinking',
};

type GetRoom = () => CueRoom | null;
const defaultGetRoom: GetRoom = () => connectionService.getRoom() as CueRoom | null;

interface Mounted {
  coach: HTMLElement;
  button: HTMLButtonElement;
  live: HTMLElement;
}

let getRoom: GetRoom = defaultGetRoom;
let mounted: Mounted | null = null;
let stopWatching: (() => void) | null = null;
let announceTimer: ReturnType<typeof setTimeout> | null = null;
let pending: Speaker = 'none';
let announced: Speaker = 'none';

function part(tag: string, className: string, parent: HTMLElement, first = false): HTMLElement {
  const el = document.createElement(tag);
  el.className = `speaker-cues__part ${className}`;
  if (first) parent.prepend(el);
  else parent.appendChild(el);
  return el;
}

function mount(): Mounted | null {
  const coach = document.getElementById('coach');
  const avatar = coach?.querySelector<HTMLElement>('.avatar-container');
  if (!coach || !avatar) {
    log.warn('Avatar not found; speaker cues not shown');
    return null;
  }
  part('style', '', document.head).textContent = SPEAKER_CUES_CSS;
  part('div', 'speaker-cues__mic-ring', avatar, true).setAttribute('aria-hidden', 'true');
  part('div', 'speaker-cues__glow', avatar, true).setAttribute('aria-hidden', 'true');

  const button = part('button', 'speaker-cues__interrupt', avatar) as HTMLButtonElement;
  button.type = 'button';
  button.textContent = t('speakerCues.tapToInterrupt');
  button.hidden = true;
  button.addEventListener('click', () => void interrupt());

  const live = part('div', 'sr-only', coach);
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  return { coach, button, live };
}

function scheduleAnnouncement(speaker: Speaker): void {
  if (speaker === pending) return;
  pending = speaker;
  if (announceTimer) clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    announceTimer = null;
    if (!mounted || speaker === 'none' || speaker === announced) return;
    announced = speaker;
    mounted.live.textContent = t(ANNOUNCEMENT_KEYS[speaker]);
  }, ANNOUNCE_SETTLE_MS);
}

function render(signals: SpeakerSignals): void {
  if (!mounted) return;
  const { coach, button } = mounted;
  coach.classList.toggle('cue-ferni-speaking', signals.agentState === 'speaking');
  coach.classList.toggle('cue-user-speaking', signals.userSpeaking);
  coach.classList.toggle('cue-thinking', signals.agentState === 'thinking');
  coach.style.setProperty('--cue-mic-level', String(signals.userLevel));
  button.hidden = !(signals.agentState === 'speaking' && signals.canInterrupt);
  scheduleAnnouncement(speakerFrom(signals));
}

async function interrupt(): Promise<void> {
  const result = await sendInterrupt(getRoom());
  // Hide at once so a second tap can't land on Ferni's next turn.
  if (result === 'sent' && mounted) mounted.button.hidden = true;
  else if (result !== 'sent') log.warn('Tap to interrupt did not reach the agent', { result });
}

function detach(): void {
  stopWatching?.();
  stopWatching = null;
  if (announceTimer) clearTimeout(announceTimer);
  announceTimer = null;
  pending = 'none';
  announced = 'none';
  if (!mounted) return;
  mounted.coach.classList.remove('cue-ferni-speaking', 'cue-user-speaking', 'cue-thinking');
  mounted.coach.style.removeProperty('--cue-mic-level');
  mounted.button.hidden = true;
  mounted.live.textContent = '';
}

function attach(): void {
  detach();
  const room = getRoom();
  if (room && mounted) stopWatching = watchSpeakerSignals(room, render);
}

/** Starts the cues when the flag is on; returns whether they started. */
export function initSpeakerCues(roomSource: GetRoom = defaultGetRoom): boolean {
  if (!isSpeakerCuesEnabled()) return false;
  disposeSpeakerCues();
  getRoom = roomSource;
  mounted = mount();
  if (!mounted) return false;
  document.addEventListener('ferni:connected', attach);
  document.addEventListener('ferni:disconnected', detach);
  attach();
  return true;
}

export function disposeSpeakerCues(): void {
  detach();
  document.removeEventListener('ferni:connected', attach);
  document.removeEventListener('ferni:disconnected', detach);
  document.querySelectorAll('.speaker-cues__part').forEach((el) => el.remove());
  mounted = null;
  getRoom = defaultGetRoom;
}
