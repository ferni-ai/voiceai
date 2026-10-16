/**
 * Dates that matter across three calls: call 1's date goes through the real
 * store planner, call 2's first note asks about it once, call 3 doesn't
 * repeat it. Only the database is a fake.
 */
import { describe, expect, it } from 'vitest';
import { createMemoryRecall } from '../memory-recall-hook.js';
import {
  createDatesRecall,
  type RaisableDate,
} from '../../../intelligence/world-model/dates/recall.js';
import { recordDates } from '../../../intelligence/world-model/dates/store.js';
import type { DateObservation } from '../../../intelligence/world-model/dates/extract.js';
import type { WorldFactStore } from '../../../intelligence/world-model/temporal/store.js';

const emptyLedger = { save: async () => undefined, recent: async () => [] };
const withThread = {
  facts: async () => [],
  summaries: async () => [
    { callerProvenance: 1, followUpItems: ['Ask how the sourdough starter is doing'] },
  ],
};

function memoryStore(): WorldFactStore & { facts: RaisableDate[] } {
  const facts: RaisableDate[] = [];
  return {
    facts,
    listOpen: async () => facts.filter((f) => f.validTo === null).map((f) => ({ ...f })),
    apply: async (_u, plan) => {
      for (const f of plan.create) facts.push(f as RaisableDate);
      for (const c of plan.close)
        Object.assign(
          facts.find((f) => f.id === c.id)!,
          c
        );
    },
  };
}

const INTERVIEW: DateObservation = {
  subject: 'Kate',
  subjectKind: 'person',
  relation: 'sister',
  attribute: 'event',
  value: 'job interview',
  eventDate: '2026-10-15',
  observedAt: '2026-10-13T18:00:00Z',
  confidence: 0.9,
  source: { kind: 'summary', sessionId: 'call-1' },
  origin: 'dates',
  kind: 'event',
  recurrence: 'once',
  when: 'Thursday',
  needsConfirmation: false,
};

async function firstNote(store: ReturnType<typeof memoryStore>, day: string) {
  const dates = createDatesRecall({
    userId: 'u1',
    store,
    now: () => new Date(`${day}T15:00:00Z`),
    mark: async (_u, id, raisedOn) => {
      Object.assign(
        store.facts.find((f) => f.id === id)!,
        { raisedOn }
      );
    },
  });
  const recall = createMemoryRecall({
    userId: 'u1',
    userName: 'Sam',
    store: withThread,
    ledgerStore: emptyLedger,
    dates,
    opener: true,
  });
  await recall.ready;
  const note = recall.noteFor('Hey Ferni, it is me!', { final: true });
  await new Promise((r) => {
    setTimeout(r, 0);
  });
  return note ?? '';
}

describe('dates that matter in the first note (FRIEND_FOLLOWUPS)', () => {
  it("asks once how the sister's interview went, after it happened, then never again", async () => {
    const store = memoryStore();
    await recordDates('u1', [INTERVIEW], store, '2026-10-13');

    // Call 2, the day before: no "how did it go".
    const before = await firstNote(store, '2026-10-13');
    expect(before).not.toContain('how it went');

    // Call 2 on Friday's clock: asked, by relation and name, and it takes the opener.
    store.facts.forEach((f) => delete f.raisedOn);
    const friday = await firstNote(store, '2026-10-16');
    expect(friday).toContain("Their sister Kate's job interview was yesterday");
    expect(friday).toContain('Ask how it went');
    expect(friday).not.toContain('ask about the one open thread');

    // Call 3: no repeat; the open thread opener is back.
    const next = await firstNote(store, '2026-10-17');
    expect(next).not.toContain('job interview');
    expect(next).toContain('ask about the one open thread');
  });
});
