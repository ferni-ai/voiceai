/**
 * A worker hosts several calls. Location must stay on the call that set it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../utils/safe-logger.js', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    getLogger: () => ({ ...logger, child: vi.fn(() => logger) }),
  };
});

import {
  clearCurrentActiveSession,
  getCurrentSessionLocation,
  setCurrentActiveSession,
} from '../location-preference.js';

afterEach(() => {
  clearCurrentActiveSession('session-a');
  clearCurrentActiveSession('session-b');
});

describe('location preference isolation between calls', () => {
  it('returns the city for the session that set it', () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'ada', location: 'St. George, UT' });
    setCurrentActiveSession({ sessionId: 'session-b', userId: 'bea', location: 'Miami, FL' });

    expect(getCurrentSessionLocation('session-a')).toBe('St. George, UT');
    expect(getCurrentSessionLocation('session-b')).toBe('Miami, FL');
  });

  it('ending one call does not clear the other', () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'ada', location: 'St. George, UT' });
    setCurrentActiveSession({ sessionId: 'session-b', userId: 'bea', location: 'Miami, FL' });
    clearCurrentActiveSession('session-a');

    expect(getCurrentSessionLocation('session-a')).toBeNull();
    expect(getCurrentSessionLocation('session-b')).toBe('Miami, FL');
  });

  it('does not guess a city when two calls are live and no session is given', () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'ada', location: 'St. George, UT' });
    setCurrentActiveSession({ sessionId: 'session-b', userId: 'bea', location: 'Miami, FL' });

    expect(getCurrentSessionLocation()).toBeNull();
  });
});
