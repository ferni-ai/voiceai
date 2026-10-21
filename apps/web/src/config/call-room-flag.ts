/**
 * Call room flag. Off by default.
 *
 * On: while a call is connecting or live, Home's chrome steps aside (the
 * engagement buttons, the grid menu button, the helper line and the roster
 * tile), a state line under Ferni's name says who is doing what ("Ferni's
 * listening", "Ferni's talking", "You're muted"), the end control reads "End"
 * in the clay error colour, and Android back no longer leaves the app mid-call
 * (ui/call-room/). Off: the call screen is exactly what it was.
 *
 * Try it in one browser: `localStorage.setItem('ferni:flag:call-room','on')`,
 * then reload ('off' forces it off on a build that has it on). Turn it on for a
 * build with VITE_CALL_ROOM=on.
 *
 * This is the only place the flag is read.
 *
 * @module config/call-room-flag
 */

import { createLogger } from '../utils/logger.js';

const log = createLogger('CallRoomFlag');

export const CALL_ROOM_STORAGE_KEY = 'ferni:flag:call-room';

const isOn = (value: unknown): boolean => value === 'on' || value === 'true';
const isOff = (value: unknown): boolean => value === 'off' || value === 'false';

export function isCallRoomEnabled(): boolean {
  try {
    const override = localStorage.getItem(CALL_ROOM_STORAGE_KEY);
    if (isOn(override)) return true;
    if (isOff(override)) return false;
  } catch (error) {
    log.debug('localStorage unavailable for call room flag', { error: String(error) });
  }
  return isOn(import.meta.env.VITE_CALL_ROOM);
}
