/**
 * One worker process runs several calls at once; each caller's weather must
 * use that caller's own location.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  clearCurrentActiveSession,
  getCurrentSessionLocation,
  setCurrentActiveSession,
} from '../location-preference.js';

describe('active session locations with concurrent calls', () => {
  afterEach(() => {
    clearCurrentActiveSession('session-a');
    clearCurrentActiveSession('session-b');
  });

  it("gives each caller their own city, not the latest caller's", () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'user-a', location: 'Austin, TX' });
    setCurrentActiveSession({ sessionId: 'session-b', userId: 'user-b', location: 'Denver, CO' });

    expect(getCurrentSessionLocation('session-a')).toBe('Austin, TX');
    expect(getCurrentSessionLocation('session-b')).toBe('Denver, CO');
  });

  it("does not clear another caller's location when one call ends", () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'user-a', location: 'Austin, TX' });
    setCurrentActiveSession({ sessionId: 'session-b', userId: 'user-b', location: 'Denver, CO' });

    clearCurrentActiveSession('session-a');

    expect(getCurrentSessionLocation('session-a')).toBeNull();
    expect(getCurrentSessionLocation('session-b')).toBe('Denver, CO');
  });

  it('returns no location for an unkeyed lookup while several calls are live', () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'user-a', location: 'Austin, TX' });
    setCurrentActiveSession({ sessionId: 'session-b', userId: 'user-b', location: 'Denver, CO' });

    expect(getCurrentSessionLocation()).toBeNull();
  });

  it('keeps the geo location when the session is re-registered without one', () => {
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'user-a', location: 'Austin, TX' });
    setCurrentActiveSession({ sessionId: 'session-a', userId: 'user-a' });

    expect(getCurrentSessionLocation('session-a')).toBe('Austin, TX');
  });
});
