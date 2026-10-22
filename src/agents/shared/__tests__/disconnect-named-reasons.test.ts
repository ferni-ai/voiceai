/**
 * Named disconnect reasons for a normal hang-up are graceful.
 *
 * voice-agent-entry finishes a call with string reasons ('empty_room',
 * 'job.shutdownCallback', ...). analyzeDisconnect ran parseInt on them, got 0
 * (UNKNOWN_REASON), and treated only codes 1/8/12 as graceful, so ordinary
 * hang-ups were filed by crash-analytics as connection-drop crashes.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/safe-logger.js', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { analyzeDisconnect } from '../disconnect-diagnostics.js';

const SHORT_CALL_MS = 20_000; // under a minute, which flags any non-graceful drop

describe('analyzeDisconnect named reasons', () => {
  it.each([
    // [reason, wasGraceful, reasonName, requiresInvestigation]
    ['empty_room', true, 'EMPTY_ROOM', false],
    ['job.shutdownCallback', true, 'JOB_SHUTDOWN', false],
    ['participant_left', true, 'PARTICIPANT_LEFT', false],
    ['client_initiated', true, 'CLIENT_INITIATED', false],
    ['CLIENT_INITIATED', true, 'CLIENT_INITIATED', false],
    [1, true, 'CLIENT_INITIATED', false],
    ['1', true, 'CLIENT_INITIATED', false],
    [12, true, 'USER_REJECTED', false],
    ['room.!isConnected', false, 'UNKNOWN_REASON', true],
    ['timeout', false, 'UNKNOWN_REASON', true],
    ['connectionStateChanged:disconnected', false, 'UNKNOWN_REASON', true],
    [10, false, 'ROOM_CLOSED', true],
    ['something_new', false, 'UNKNOWN_REASON', true],
  ] as const)('%s → graceful %s (%s)', (reason, graceful, name, investigate) => {
    const analysis = analyzeDisconnect({
      sessionId: 's1',
      roomName: 'r1',
      reason,
      durationMs: SHORT_CALL_MS,
    });
    expect(analysis.wasGraceful).toBe(graceful);
    expect(analysis.reasonName).toBe(name);
    expect(analysis.requiresInvestigation).toBe(investigate);
    if (graceful) expect(analysis.severity).toBe('info');
  });
});
