/**
 * A date is raised once per call across the hello and the first recall note.
 * With DATES_IN_HELLO on the hello takes it (dateFor, then the winner's commit)
 * and the first note leaves out its date line and the thread line; off, the
 * hello never has it and the first note raises it as before. The dates recall
 * is loaded before the hello commits, as at call start. Only the database is a
 * fake; the caller is fictional.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRecall } from '../memory-recall-hook.js';
import { dateFor } from '../greeting-date.js';
import {
  createDatesRecall,
  type RaisableDate,
} from '../../../intelligence/world-model/dates/recall.js';
import { clearOpenerClaims } from '../../../memory/recall/opener-claim.js';

const USER = 'voice-eval-riley';
const NOW = new Date('2026-10-14T15:00:00Z');
const THREAD = 'ask about the one open thread';

function store() {
  const facts: RaisableDate[] = [
    {
      id: 'wd_visit',
      subject: 'Priya',
      subjectKind: 'person',
      relation: 'sister',
      subjectKey: 'person:priya',
      attribute: 'event',
      value: 'visit',
      observedAt: '2026-10-01T18:00:00Z',
      validFrom: '2026-10-01T18:00:00Z',
      validTo: null,
      confidence: 0.9,
      source: { kind: 'summary', sessionId: 's0' },
      kind: 'event',
      recurrence: 'once',
      when: 'tomorrow',
      needsConfirmation: false,
      eventDate: '2026-10-15',
    },
  ];
  return {
    facts,
    listOpen: async () => facts.map((f) => ({ ...f })),
    listRaisedSince: async () => [],
    apply: async () => undefined,
    mark: async (_u: string, id: string, raisedOn: string, raisedAs: string) => {
      Object.assign(
        facts.find((f) => f.id === id)!,
        { raisedOn, raisedAs }
      );
    },
  };
}

/** The hello, then the caller's first words: how many times was the visit raised? */
async function oneCall(): Promise<{ hello: number; note: string }> {
  clearOpenerClaims();
  const s = store();
  const deps = { now: () => NOW, store: s, mark: s.mark, forgotten: async () => [] };
  const dates = createDatesRecall({ userId: USER, ...deps });
  const recall = createMemoryRecall({
    userId: USER,
    userName: 'Riley',
    store: {
      facts: async () => [],
      summaries: async () => [
        { callerProvenance: 1, followUpItems: ['Ask how the pottery class is going'] },
      ],
    },
    ledgerStore: { save: async () => undefined, recent: async () => [] },
    dates,
    opener: true,
  });
  const hello = await dateFor({ userId: USER, sessionId: 'once-1', zone: 'UTC' }, deps);
  await hello?.commit(); // it won the arbiter
  await recall.ready;
  const note = recall.noteFor('Hey, it is me.', { final: true }) ?? '';
  return { hello: hello ? 1 : 0, note };
}

const raisedIn = (note: string): number => (note.includes("Priya's visit") ? 1 : 0);

afterEach(() => vi.unstubAllEnvs());

describe('a date is raised once per call', () => {
  it('DATES_IN_HELLO on: by the hello, and the first note has no date line and no thread line', async () => {
    vi.stubEnv('DATES_IN_HELLO', 'on');
    const { hello, note } = await oneCall();
    expect(hello).toBe(1);
    expect(raisedIn(note)).toBe(0);
    expect(note).not.toContain(THREAD);
    expect(hello + raisedIn(note)).toBe(1);
  });

  it('DATES_IN_HELLO off: by the first note, as before', async () => {
    vi.stubEnv('DATES_IN_HELLO', 'off');
    const { hello, note } = await oneCall();
    expect(hello).toBe(0);
    expect(raisedIn(note)).toBe(1);
    expect(hello + raisedIn(note)).toBe(1);
  });
});
