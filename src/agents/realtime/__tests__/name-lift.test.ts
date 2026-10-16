import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../utils/firestore-utils.js', () => ({ getFirestoreDb: () => null }));
import {
  createNameLift,
  MAX_LIFTS_PER_CALL,
  nameLiftEnabled,
  startNameLift,
  type NameLiftSend,
} from '../name-lift.js';
import { rememberedPeople } from '../../../memory/recall/person-valence.js';
import { createMemoryRecall } from '../../multi-agent/memory-recall-hook.js';
import type { RecallFact, RecallSnapshot } from '../../../memory/recall/session-recall.js';

const f = (entity: string, key: string, value: string): RecallFact => ({
  entity,
  key,
  value,
  confidence: 0.9,
});

const SNAPSHOT: RecallSnapshot = {
  facts: [
    f('Mom', 'surgery', 'went well, home on Tuesday'),
    f('Joan', 'sister of speaker', 'biopsy results come next week'),
    f('Dad', 'status', 'passed away last spring'),
    f('Walt', 'spouse of', 'User'),
    f('Walt', 'relationship', "we're not speaking"),
    f('Priya', 'relation', 'best friend'),
    f('Priya', 'job', 'got promoted'),
    f('Leo', 'relation', 'nephew'),
    f('Leo', 'school', 'graduated in May'),
  ],
  followUps: [],
};

function harness(env: Record<string, string> = { NAME_LIFT: 'on' }) {
  const send = vi.fn<NameLiftSend>(async () => undefined);
  const observe = startNameLift({ snapshot: () => SNAPSHOT }, send, env);
  return { send, observe };
}
const effects = (send: ReturnType<typeof harness>['send']) =>
  send.mock.calls.map(([type, payload]) => [type, payload.effect]);

describe('name lift', () => {
  it('is off by default: no observer, no signal', () => {
    expect(nameLiftEnabled({})).toBe(false);
    const { send, observe } = harness({});
    expect(observe).toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('brightens for good news the instant the name is heard', () => {
    const { send, observe } = harness();
    observe?.('so my mom');
    expect(effects(send)).toEqual([['humanization_signal', 'brighten']]);
  });

  it('is attentive for something pending', () => {
    const { send, observe } = harness();
    observe?.('I talked to Joan today');
    expect(effects(send)).toEqual([['humanization_signal', 'attentive']]);
  });

  it.each([
    ['a death', 'thinking about Dad today'],
    ['a falling-out', 'Walt texted me'],
  ])('only ever comforts for %s', (_label, said) => {
    const { send, observe } = harness();
    observe?.(said);
    expect(effects(send)).toEqual([['humanization_signal', 'comfort']]);
    expect(send.mock.calls.some(([, p]) => p.effect === 'brighten')).toBe(false);
  });

  it('sends nothing for someone unknown or a name inside another word', () => {
    const { send, observe } = harness();
    observe?.('my coworker Gerald was weird today');
    observe?.('Joanna and Momo came by'); // not Joan, not Mom
    observe?.('I will call later'); // not Walt, Will or anyone
    expect(send).not.toHaveBeenCalled();
  });

  it('lifts once per person, however many interims repeat the name', () => {
    const { send, observe } = harness();
    observe?.('my mom');
    observe?.("my mom's surgery");
    observe?.("my mom's surgery went great");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it(`lifts at most ${MAX_LIFTS_PER_CALL} times a call`, () => {
    const { send, observe } = harness();
    for (const said of ['Mom called', 'Joan called', 'Priya called', 'Leo called', 'Dad'])
      observe?.(said);
    expect(send).toHaveBeenCalledTimes(MAX_LIFTS_PER_CALL);
  });

  it('carries only the effect kind: no name, no remembered text', () => {
    const { send, observe } = harness();
    for (const said of ['Mom', 'Joan', 'Dad']) observe?.(said);
    for (const [, payload] of send.mock.calls) {
      expect(Object.keys(payload).sort()).toEqual(['effect', 'signalType', 'timestamp']);
      const wire = JSON.stringify(payload).toLowerCase();
      for (const secret of ['mom', 'joan', 'dad', 'surgery', 'biopsy', 'passed', 'spring']) {
        expect(wire).not.toContain(secret);
      }
    }
  });

  it("reads people from the call's real memory recall once it has loaded", async () => {
    const send = vi.fn<NameLiftSend>(async () => undefined);
    const store = {
      facts: async () => [
        { entityName: 'Mom', key: 'surgery', value: 'went well', confidence: 0.9 },
      ],
      summaries: async () => [],
    };
    const recall = createMemoryRecall({ userId: 'u-lift', store, semantic: false });
    const observe = startNameLift(recall, send, { NAME_LIFT: 'on' });
    await recall.ready;
    observe?.('my mom called');
    expect(effects(send)).toEqual([['humanization_signal', 'brighten']]);
  });

  it('waits for the snapshot, then lifts', () => {
    const send = vi.fn<NameLiftSend>(async () => undefined);
    const recall: { loaded?: RecallSnapshot } = {};
    const observe = startNameLift({ snapshot: () => recall.loaded }, send, { NAME_LIFT: 'on' });
    observe?.('my mom');
    expect(send).not.toHaveBeenCalled();
    recall.loaded = SNAPSHOT;
    observe?.('my mom');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('a failed send is logged, never thrown', async () => {
    const send = vi.fn<NameLiftSend>(async () => {
      throw new Error('room gone');
    });
    const lift = createNameLift(rememberedPeople(SNAPSHOT), send);
    expect(lift.observe('Mom')).toBe('brighten');
    await Promise.resolve();
  });
});
