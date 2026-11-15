/**
 * The crisis memory hold's own contract (crisis-memory-hold.ts) and what it does and does not
 * hold in minor-care.ts: every memory writer's check refuses, the crisis_events record
 * (careHeld) and the call's tools (heldAfter careOnly) do not, and no other call of the caller
 * is held (userHeld). A capture that can run before its turn's read waits for it, and captures
 * nothing when no read starts or none settles.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  crisisTurnSettled,
  holdForCrisis,
  noteCrisisTurnRead,
} from '../crisis-memory-hold.js';
import {
  noteCrisisRisk,
  resetCrisisCallRisk,
  trackCrisisRead,
} from '../../services/safety/crisis-call-risk.js';
import {
  bindSessionUser,
  careHeld,
  heldAfter,
  memoryHeld,
  resetMinorCare,
  userHeld,
  writeHeld,
} from '../minor-care.js';

const FAST = { startMs: 300, settleMs: 300 };
const WORDS = 'An invented line the caller said, about the weekend.';
let n = 0;
const call = (): { sessionId: string; userId: string } => {
  n++;
  const sessionId = `crisis-hold-unit-${n}`;
  const userId = `user-${sessionId}`;
  bindSessionUser(sessionId, userId);
  return { sessionId, userId };
};

afterEach(() => {
  resetCrisisCallRisk(); // also the memory hold
  resetMinorCare();
});

describe('what a crisis hold holds', () => {
  it('every memory writer refuses; crisis_events and the call tools do not', () => {
    const { sessionId, userId } = call();
    expect([memoryHeld(sessionId), writeHeld(userId, sessionId)]).toEqual([false, false]);
    noteCrisisRisk(sessionId);
    expect(memoryHeld(sessionId)).toBe(true);
    expect(writeHeld(userId, sessionId)).toBe(true);
    expect(careHeld(userId, sessionId)).toBe(false);
    expect(heldAfter(sessionId, WORDS, { careOnly: true })).toBe(false);
    expect(heldAfter(sessionId, WORDS)).toBe(true);
  });

  it('only this call: the same caller on another call is not held', () => {
    const { sessionId, userId } = call();
    const other = `${sessionId}-other`;
    bindSessionUser(other, userId);
    holdForCrisis(sessionId);
    expect(memoryHeld(sessionId)).toBe(true);
    expect(memoryHeld(other)).toBe(false);
    expect(userHeld(userId)).toBe(false);
  });

  it('lasts for the rest of the call', () => {
    const { sessionId } = call();
    holdForCrisis(sessionId);
    trackCrisisRead(sessionId, WORDS, Promise.resolve({ risk: 'none' }));
    expect(memoryHeld(sessionId)).toBe(true);
  });
});

describe('crisisTurnSettled: a capture that can run before its turn read', () => {
  it('no read of the turn starts: false (fail closed)', async () => {
    const { sessionId } = call();
    expect(await crisisTurnSettled(sessionId, WORDS, FAST)).toBe(false);
  });

  it('the turn pattern read noted (no classifier read running): true', async () => {
    const { sessionId } = call();
    noteCrisisTurnRead(sessionId, WORDS);
    expect(await crisisTurnSettled(sessionId, WORDS, FAST)).toBe(true);
  });

  it('a classifier read that starts late and finds risk: waited for, held, false', async () => {
    const { sessionId } = call();
    let finish: (v: { risk: string }) => void = () => undefined;
    const read = new Promise<{ risk: string }>((resolve) => {
      finish = resolve;
    });
    setTimeout(() => {
      trackCrisisRead(sessionId, WORDS.toUpperCase(), read);
      setTimeout(() => finish({ risk: 'crisis' }), 100);
    }, 100);
    expect(await crisisTurnSettled(sessionId, WORDS, FAST)).toBe(false);
    expect(memoryHeld(sessionId)).toBe(true);
  });

  it('a read that never settles: false, and the call is held (counts as risk)', async () => {
    const { sessionId } = call();
    trackCrisisRead(sessionId, WORDS, new Promise<{ risk: string }>(() => undefined));
    expect(memoryHeld(sessionId)).toBe(false);
    expect(await crisisTurnSettled(sessionId, WORDS, FAST)).toBe(false);
    expect(memoryHeld(sessionId)).toBe(true);
  });

  it('no session: false', async () => {
    expect(await crisisTurnSettled(undefined, WORDS, FAST)).toBe(false);
  });
});
