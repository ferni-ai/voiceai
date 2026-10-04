/**
 * Review L3: the Director's carried emotion and speed must not outlive the
 * session. cleanupSpeechSession() (called by the voice agent's cleanup
 * handler and multi-agent setup when a call ends) clears it.
 */
import { describe, expect, it } from 'vitest';

import { cleanupSpeechSession } from '../../../session-cleanup.js';
import { directorSessions } from '../session-state.js';

describe('session end', () => {
  it('clears the Director carry-over for every persona of the session', () => {
    const sessionId = `director-session-end-${Date.now()}`;
    directorSessions.update(sessionId, 'ferni', { emotion: 'sympathetic', speed: 0.94 });
    directorSessions.update(sessionId, 'maya', { emotion: 'content', speed: 1.03 });

    cleanupSpeechSession(sessionId, { verbose: false, reason: 'normal' });

    expect(directorSessions.get(sessionId, 'ferni')).toEqual({ speed: 1 });
    expect(directorSessions.get(sessionId, 'maya')).toEqual({ speed: 1 });
  });
});
