/**
 * callerIdFor forgets server sessions it no longer needs: an entry older than
 * the 12 h TTL, or beyond the 5,000-session cap, is dropped on the next mint,
 * so the map never grows without bound. A forgotten session's next id-less
 * call gets a fresh anon: id.
 */
import { describe, expect, it } from 'vitest';
import { callerIdFor } from '../call-caller-id.js';

const HOUR = 60 * 60 * 1000;
const sessionAt = (job: string, startedMs: number) => `session-${job}-${startedMs}`;

describe('callerIdFor pruning', () => {
  it('drops a session older than 12 h on the next mint, keeps a younger one', () => {
    const old = sessionAt('AJ_old', Date.now() - 13 * HOUR);
    const young = sessionAt('AJ_young', Date.now() - 11 * HOUR);
    const oldId = callerIdFor(undefined, old);
    const youngId = callerIdFor(undefined, young);

    callerIdFor(undefined, sessionAt('AJ_new', Date.now())); // a mint prunes

    expect(callerIdFor(undefined, young)).toBe(youngId);
    expect(callerIdFor(undefined, old)).not.toBe(oldId);
  });

  it('keeps at most 5,000 sessions: the oldest goes first', () => {
    const now = Date.now();
    const first = sessionAt('AJ_cap0', now);
    const firstId = callerIdFor(undefined, first);
    for (let i = 1; i < 5000; i++) callerIdFor(undefined, sessionAt(`AJ_cap${i}`, now));
    const last = sessionAt('AJ_cap5000', now);
    const lastId = callerIdFor(undefined, last); // the 5,001st session of this test

    expect(callerIdFor(undefined, last)).toBe(lastId);
    expect(callerIdFor(undefined, first)).not.toBe(firstId);
  });
});
