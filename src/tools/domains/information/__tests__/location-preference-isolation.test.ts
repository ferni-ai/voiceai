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

afterEach(() => clearCurrentActiveSession());

describe('location preference isolation between calls', () => {
  it('returns the city for the session that set it', () => {
    setCurrentActiveSession('ada', 'St. George, UT', 'session-a');
    setCurrentActiveSession('bea', 'Miami, FL', 'session-b');

    expect(getCurrentSessionLocation('session-a')).toBe('St. George, UT');
    expect(getCurrentSessionLocation('session-b')).toBe('Miami, FL');
  });

  it('ending one call does not clear the other', () => {
    setCurrentActiveSession('ada', 'St. George, UT', 'session-a');
    setCurrentActiveSession('bea', 'Miami, FL', 'session-b');
    clearCurrentActiveSession('session-a');

    expect(getCurrentSessionLocation('session-a')).toBeNull();
    expect(getCurrentSessionLocation('session-b')).toBe('Miami, FL');
  });

  it('does not guess a city when two calls are live and no session is given', () => {
    setCurrentActiveSession('ada', 'St. George, UT', 'session-a');
    setCurrentActiveSession('bea', 'Miami, FL', 'session-b');

    expect(getCurrentSessionLocation()).toBeNull();
  });
});
