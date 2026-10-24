/**
 * callerIdFor: the id a tool call runs as. Members and minted per-call ids are
 * kept; anything shared by every id-less caller becomes an anon: id of the
 * session's own, keyed only by something the server minted for that session.
 */
import { describe, expect, it } from 'vitest';
import { callerIdFor } from '../call-caller-id.js';

/** A session id the way voice-agent-entry mints it. */
const serverSession = (job: string) => `session-${job}-${Date.now()}`;

describe('callerIdFor', () => {
  it.each(['uid-member', 'phone:+15555550100', 'anon:3b0e7c1e', 'onbehalf:call-1'])(
    'keeps %s',
    (id) => {
      expect(callerIdFor(id, serverSession('AJ_keep'))).toBe(id);
      expect(callerIdFor(` ${id} `, {})).toBe(id);
    }
  );

  it.each([
    undefined,
    '',
    '  ',
    'anonymous',
    'Unknown',
    'default',
    'shared',
    'anon',
    'session',
    'gateway',
    'gateway-recovery',
    'anon:',
    'ONBEHALF:',
  ])('refuses %j', (id) => {
    const caller = callerIdFor(id, serverSession('AJ_refuse'));
    expect(caller).toMatch(/^anon:.+/);
    expect(caller).not.toBe(id);
  });

  it('gives an id-less caller one id for the whole server session, and another session a different one', () => {
    const sessA = serverSession('AJ_a');
    const first = callerIdFor(undefined, sessA);
    expect(callerIdFor('unknown', sessA)).toBe(first);
    expect(callerIdFor('', sessA)).toBe(first);
    expect(callerIdFor(undefined, serverSession('AJ_b'))).not.toBe(first);
  });

  it('keys by a server-created session object the same way', () => {
    const session = {};
    const first = callerIdFor(undefined, session);
    expect(callerIdFor('anon', session)).toBe(first);
    expect(callerIdFor(undefined, {})).not.toBe(first);
  });

  it.each([
    'default',
    'session',
    'unknown',
    '',
    'anonymous',
    `session-${Date.now()}`, // the bthSessionId fallback, no job id
    'session--1700000000000',
    'client-picked-session',
  ])('never shares an id between two callers keyed by session %j', (session) => {
    expect(callerIdFor(undefined, session)).not.toBe(callerIdFor(undefined, session));
  });

  it('with no session at all, never reuses an id', () => {
    expect(callerIdFor(undefined)).not.toBe(callerIdFor(undefined));
    expect(callerIdFor(undefined, null)).not.toBe(callerIdFor(undefined, null));
  });
});
