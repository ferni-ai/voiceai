/**
 * A request to call someone is never asked about as if the call happened
 * (call-status.ts). Owner call 2026-10-18 (paraphrased): the call opened on
 * "how did that phone call with your mom go yesterday?" while that call was
 * still held for a better hour and had never rung.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  callStatusNote,
  callStatusOf,
  ferniCallsFor,
  personToCall,
  type CallRecords,
} from '../call-status.js';

const NOW = Date.parse('2026-10-18T14:42:00Z'); // 8:42 AM in Denver
const NINE = '2026-10-18T15:00:00.000Z';
const mom = { contactQuery: 'my mom', resolvedContact: { name: 'Mom', phone: '+13035550100' } };
const heldMom = {
  kind: 'on_behalf',
  status: 'pending',
  scheduledFor: NINE,
  timezone: 'America/Denver',
  createdAt: '2026-10-17T22:00:00.000Z',
  request: mom,
};
const records = (deferred: object[] = [], results: object[] = []): CallRecords => ({
  load: vi.fn(async () => ({
    deferred: deferred as Array<Record<string, unknown>>,
    results: results as Array<Record<string, unknown>>,
  })),
});

describe('personToCall', () => {
  it.each([
    ['Call my mom to check in on her', 'mom'],
    ['I need you to call my mother tonight', 'mom'],
    ['Give my sister a call about Sunday', 'sister'],
    ['Ring Dad when he lands', 'dad'],
  ])('%j asks to call %s', (statement, person) => {
    expect(personToCall(statement)).toBe(person);
  });

  it.each(["I'll call you back later", 'Call it a day', "I'm going to start running", 'call her'])(
    '%j names no one to call',
    (statement) => {
      expect(personToCall(statement)).toBeNull();
    }
  );
});

describe('callStatusOf', () => {
  it('a call held for its hour has not happened, and says when it rings', () => {
    const call = callStatusOf('mom', { deferred: [heldMom], results: [] }, NOW);
    expect(call?.state).toBe('held');
    expect(call?.when).toMatch(/^later today at 9:00\sAM$/);
    expect(callStatusNote(call!)).toMatch(
      /has not happened yet: it is set for later today at 9:00\sAM/
    );
  });

  it('a result decides once the call rang: completed, or not reached', () => {
    const done = {
      capturedAt: '2026-10-18T16:00:00Z',
      request: mom,
      outcome: { status: 'completed' },
    };
    const missed = { ...done, outcome: { status: 'no_answer' } };
    const placed = { ...heldMom, status: 'placed' };
    expect(callStatusOf('mom', { deferred: [placed], results: [done] }, NOW)?.state).toBe(
      'completed'
    );
    expect(callStatusOf('mom', { deferred: [placed], results: [missed] }, NOW)?.state).toBe(
      'failed'
    );
    expect(callStatusOf('mom', { deferred: [placed], results: [] }, NOW)?.state).toBe('unknown');
    expect(
      callStatusOf('mom', { deferred: [{ ...heldMom, status: 'missed' }], results: [] }, NOW)?.state
    ).toBe('failed');
  });

  it('another person, or no call, is not this call', () => {
    expect(callStatusOf('sister', { deferred: [heldMom], results: [] }, NOW)).toBeUndefined();
    expect(callStatusOf('mom', { deferred: [], results: [] }, NOW)).toBeUndefined();
  });
});

describe('ferniCallsFor', () => {
  it('notes only calls that have not completed, from one read', async () => {
    const store = records([heldMom]);
    const found = await ferniCallsFor(
      'u1',
      ['Call my mom to check in', 'Run three mornings a week'],
      NOW,
      store
    );
    expect([...found.keys()]).toEqual(['Call my mom to check in']);
    expect(found.get('Call my mom to check in')?.state).toBe('held');
    expect(store.load).toHaveBeenCalledTimes(1);
  });

  it('reads nothing when no statement asks for a call, and a failed read changes nothing', async () => {
    const store = records();
    expect((await ferniCallsFor('u1', ['Run three mornings a week'], NOW, store)).size).toBe(0);
    expect(store.load).not.toHaveBeenCalled();
    const broken: CallRecords = { load: async () => Promise.reject(new Error('offline')) };
    expect((await ferniCallsFor('u1', ['Call my mom'], NOW, broken)).size).toBe(0);
  });
});
