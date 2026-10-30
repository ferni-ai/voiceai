/**
 * The call gets its own room (behind config/call-room-flag.ts, off by default).
 *
 * While a call is connecting or live:
 * - `body.call-room` hides Home's chrome (styles/call-room.css);
 * - a polite live state line under the name says who is doing what. It follows
 *   the app's connection, mute and audio state; the audio state is the one the
 *   avatar's turn driver sets from `lk.agent.state` (avatar-motion/turn-driver);
 * - the end control reads "End call";
 * - back keeps the call (call-back-guard.ts).
 *
 * @module ui/call-room/call-room
 */

import { isCallRoomEnabled } from '../../config/call-room-flag.js';
import { t } from '../../i18n/index.js';
import { appState } from '../../state/app.state.js';
import type { AudioState, ConnectionState } from '../../types/events.js';
import { createLogger } from '../../utils/logger.js';
import { showToast } from '../overlay/toast-region.js';
import { createCallBackGuard } from './call-back-guard.js';

const log = createLogger('CallRoom');

export const CALL_ROOM_CLASS = 'call-room';
const STATE_LINE_CLASS = 'call-room-state';
const END_KEY = 'callRoom.end';
const IN_CALL: ReadonlySet<ConnectionState> = new Set<ConnectionState>([
  'connecting',
  'reconnecting',
  'connected',
]);

export interface CallMoment {
  connection: ConnectionState;
  muted: boolean;
  audio: AudioState;
}

/** The state line's i18n key, or null outside a call. */
export function stateLineKey({ connection, muted, audio }: CallMoment): string | null {
  if (!IN_CALL.has(connection)) return null;
  if (connection === 'reconnecting') return 'entrance.reconnecting';
  if (connection !== 'connected') return 'callRoom.connecting';
  if (muted) return 'callRoom.muted';
  return audio === 'speaking' ? 'callRoom.talking' : 'callRoom.listening';
}

/** The end control's label key: the call room's own, the entrance's otherwise (both "End call"). */
export function endLabelKey(): string {
  return isCallRoomEnabled() ? END_KEY : 'entrance.endTalk';
}

function stateLine(): HTMLElement | null {
  const existing = document.querySelector<HTMLElement>(`.${STATE_LINE_CLASS}`);
  if (existing) return existing;
  const name = document.getElementById('personaName');
  if (!name) return null;
  const line = document.createElement('p');
  line.className = STATE_LINE_CLASS;
  line.setAttribute('aria-live', 'polite');
  name.insertAdjacentElement('afterend', line);
  return line;
}

function render(): void {
  const moment: CallMoment = {
    connection: appState.get('connection'),
    muted: appState.get('isMuted'),
    audio: appState.get('audio'),
  };
  const key = stateLineKey(moment);
  document.body.classList.toggle(CALL_ROOM_CLASS, key !== null);
  const line = stateLine();
  if (!line) return;
  const name = appState.get('activePersona')?.name || 'Ferni';
  const text = key ? t(key, { name }) : '';
  if (line.textContent !== text) line.textContent = text;
  line.dataset.state = key?.split('.')[1] ?? '';
}

/** Relabel the end control so locale refreshes (data-i18n) keep the call room's key. */
function relabelEnd(): void {
  const label = document.querySelector<HTMLElement>('#disconnectBtn .btn-content');
  if (!label) return;
  label.dataset.i18n = END_KEY;
  label.textContent = t(END_KEY);
}

/** Install the call room if its flag is on; returns an uninstall function. */
export function installCallRoom(): () => void {
  if (!isCallRoomEnabled()) return () => undefined;
  log.debug('Call room on');
  relabelEnd();
  const guard = createCallBackGuard(() => {
    showToast({ message: t('callRoom.backHint'), priority: 'system', key: 'call-room-back' });
  });
  const sync = (): void => {
    render();
    if (IN_CALL.has(appState.get('connection'))) guard.enter();
    else guard.leave();
  };
  const unsubscribers = [
    appState.subscribe('connection', sync),
    appState.subscribe('isMuted', render),
    appState.subscribe('audio', render),
    appState.subscribe('activePersona', render),
  ];
  sync();
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
    guard.leave();
    guard.dispose();
    document.body.classList.remove(CALL_ROOM_CLASS);
    document.querySelector(`.${STATE_LINE_CLASS}`)?.remove();
  };
}
