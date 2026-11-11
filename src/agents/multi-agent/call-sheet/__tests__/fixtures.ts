/**
 * A stored call sheet for the fictional Riley Test, built `daysOld` before `at`, and counting
 * fake ports. Every section's provenance has the sheet's own build time.
 */
import type { CallSheetPorts } from '../ports.js';
import type { StoredPersonModel } from '../../../../services/stores/person-model-store.js';

const DAY_MS = 86_400_000;

export function storedSheet(at: Date, daysOld = 0.2, generation = 2): StoredPersonModel {
  const builtAt = new Date(at.getTime() - daysOld * DAY_MS).toISOString();
  const prov = { builtAt, sources: ['summaries'], method: 'code' as const, inputDocs: 4 };
  const lastCall = new Date(at.getTime() - (daysOld + 1) * DAY_MS).toISOString();
  return {
    v: 1,
    userId: 'riley-test',
    builtAt,
    throughSessionId: 'session-41',
    forgetGeneration: generation,
    rendered: 'stale stored text that the reader never uses',
    inputHash: 'hash-1',
    rhythms: {
      value: {
        callsLast30d: 6,
        medianGapDays: 3,
        usualHours: [{ dow: 'any', startHour: 18, endHour: 20, share: 0.6 }],
        reachWindows: [],
        medianMinutes: 12,
        lastCallAt: lastCall,
        timezone: 'UTC',
      },
      prov,
    },
    followThrough: {
      value: { byKind: {}, slips: [], ferniPromisesOpen: 1, ferniPromisesMissed30d: 0 },
      prov,
    },
    mood: { value: { points: [], trend: 'steady', vsBaseline: null, note: null }, prov },
    people: {
      value: [
        {
          name: 'Mia',
          relation: 'daughter',
          mentions90d: 5,
          lastMentioned: lastCall,
          sentiment: 'warm',
          openThread: 'recital nerves',
          sensitive: false,
        },
        {
          name: 'Sam',
          relation: 'brother',
          mentions90d: 2,
          lastMentioned: lastCall,
          sentiment: 'unknown',
          openThread: null,
          sensitive: false,
        },
      ],
      prov,
    },
    unfinished: {
      value: {
        openLoops: [
          { text: 'ask how the dentist visit went', ageDays: 2, kind: 'thread', dueAt: null },
        ],
        upcomingDates: [],
        ferniOwes: [{ text: 'send the pasta recipe', since: lastCall }],
      },
      prov,
    },
    topics: { value: { recurring: [], new: [], fading: [] }, prov },
    changed: { value: [], prov },
  };
}

export interface FakeState {
  sheet: StoredPersonModel | null;
  topics: string[] | null;
  generation: number;
  minorCare: boolean | Error;
  recentCrisis: boolean;
  heldNow: boolean;
  seen: number;
  /** When set, the sheet read waits on this. */
  gate: Promise<void> | null;
  reads: number;
}

export function fakeState(sheet: StoredPersonModel | null): FakeState {
  return {
    sheet,
    topics: [],
    generation: sheet?.forgetGeneration ?? 0,
    minorCare: false,
    recentCrisis: false,
    heldNow: false,
    seen: 0,
    gate: null,
    reads: 0,
  };
}

export function fakePorts(state: FakeState): CallSheetPorts {
  return {
    async sheet() {
      state.reads++;
      if (state.gate) await state.gate;
      return state.sheet;
    },
    async forgotten() {
      state.reads++;
      return { topics: state.topics && [...state.topics], generation: state.generation };
    },
    async minorCare() {
      state.reads++;
      if (state.minorCare instanceof Error) throw state.minorCare;
      return state.minorCare;
    },
    async recentCrisis() {
      state.reads++;
      return state.recentCrisis;
    },
    heldNow: () => state.heldNow,
    generationSeen: () => state.seen,
  };
}

/** Never settles. */
export const never = (): Promise<void> =>
  new Promise<void>(() => {
    /* a read that never answers */
  });
