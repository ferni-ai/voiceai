/**
 * callerIdFor: the id a tool call runs as. Members and minted per-call ids are
 * kept; anything shared by every id-less caller becomes one anon: id per
 * session, so a caller keeps their own state for the call and no one else's.
 */
import { describe, expect, it } from 'vitest';
import { callerIdFor } from '../call-caller-id.js';

describe('callerIdFor', () => {
  it.each(['uid-member', 'phone:+15555550100', 'anon:3b0e7c1e', 'onbehalf:call-1'])(
    'keeps %s',
    (id) => {
      expect(callerIdFor(id, 's1')).toBe(id);
      expect(callerIdFor(` ${id} `, 's1')).toBe(id);
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
    const caller = callerIdFor(id, `session-for-${String(id)}`);
    expect(caller).toMatch(/^anon:.+/);
    expect(caller).not.toBe(id);
  });

  it('gives an id-less caller one id for the whole session, and another session a different one', () => {
    const first = callerIdFor(undefined, 'sess-a');
    expect(callerIdFor('unknown', 'sess-a')).toBe(first);
    expect(callerIdFor('', 'sess-a')).toBe(first);
    expect(callerIdFor(undefined, 'sess-b')).not.toBe(first);
  });

  it('keys by a session object the same way', () => {
    const session = {};
    const first = callerIdFor(undefined, session);
    expect(callerIdFor('anon', session)).toBe(first);
    expect(callerIdFor(undefined, {})).not.toBe(first);
  });

  it('with no session at all, never reuses an id', () => {
    expect(callerIdFor(undefined)).not.toBe(callerIdFor(undefined));
  });
});
