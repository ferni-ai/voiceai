/**
 * The call room flag is off unless a build or one browser turns it on.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALL_ROOM_STORAGE_KEY, isCallRoomEnabled } from '../../../src/config/call-room-flag.js';

afterEach(() => {
  localStorage.removeItem(CALL_ROOM_STORAGE_KEY);
  vi.unstubAllEnvs();
});

describe('isCallRoomEnabled', () => {
  it('is off by default', () => {
    vi.stubEnv('VITE_CALL_ROOM', '');
    expect(isCallRoomEnabled()).toBe(false);
  });

  it.each(['on', 'true'])('a build with VITE_CALL_ROOM=%s turns it on', (value) => {
    vi.stubEnv('VITE_CALL_ROOM', value);
    expect(isCallRoomEnabled()).toBe(true);
  });

  it.each(['on', 'true'])("localStorage '%s' forces it on", (value) => {
    vi.stubEnv('VITE_CALL_ROOM', '');
    localStorage.setItem(CALL_ROOM_STORAGE_KEY, value);
    expect(isCallRoomEnabled()).toBe(true);
  });

  it.each(['off', 'false'])(
    "localStorage '%s' forces it off on a build that has it on",
    (value) => {
      vi.stubEnv('VITE_CALL_ROOM', 'on');
      localStorage.setItem(CALL_ROOM_STORAGE_KEY, value);
      expect(isCallRoomEnabled()).toBe(false);
    }
  );

  it('ignores other stored values', () => {
    vi.stubEnv('VITE_CALL_ROOM', '');
    localStorage.setItem(CALL_ROOM_STORAGE_KEY, 'yes');
    expect(isCallRoomEnabled()).toBe(false);
  });
});
