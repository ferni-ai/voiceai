/**
 * The predicate and order moved from opener-pick.ts to askable.ts keep the
 * opener's behavior: the copy below is opener-pick.ts as it was on main
 * (300ce578e5), run beside the shared one over every subset of a fixed set of
 * fictional rows and three clocks.
 */
import { describe, expect, it } from 'vitest';
import { byOpenerOrder, isCallersOwn } from '../askable.js';
import type { FollowUp, FollowUpKind } from '../follow-up.js';
import { pickOpenerFollowUp } from '../opener-pick.js';
import { rightMoment } from '../right-moment.js';
import { followUp } from './fixtures.js';

// ---- FROZEN COPY of opener-pick.ts on main 300ce578e5 (test fixture, do not edit) ----
const OLD_ASKABLE: ReadonlySet<FollowUpKind> = new Set([
  'commitment',
  'reminder',
  'thread',
  'date',
  'dose',
]);
function oldRaisedByOpener(f: FollowUp): boolean {
  const since = f.dueAt ? Date.parse(f.dueAt) : 0;
  return f.surfaced.some((s) => s.via === 'opener' && Date.parse(s.at) >= since);
}
const oldOwn = (f: FollowUp): boolean => OLD_ASKABLE.has(f.kind) && !f.action;
function oldSort(rows: FollowUp[]): FollowUp[] {
  const key = (f: FollowUp) => (f.dueAt ? [1, Date.parse(f.dueAt)] : [0, Date.parse(f.createdAt)]);
  return rows.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    return kb[0] - ka[0] || kb[1] - ka[1];
  });
}
function oldPickOpenerFollowUp(live: readonly FollowUp[], now: Date): FollowUp | null {
  const askable = live.filter((f) => {
    if (!OLD_ASKABLE.has(f.kind) || f.action || oldRaisedByOpener(f)) return false;
    const moment = rightMoment(f, now);
    return moment === 'next-call' || moment === 'text-now';
  });
  return oldSort(askable)[0] ?? null;
}
// ---- end of frozen copy ----

const DAY = 86_400_000;
const T0 = Date.parse('2026-11-10T20:00:00.000Z');
const at = (days: number): string => new Date(T0 + days * DAY).toISOString();

const ROWS: FollowUp[] = [
  followUp({ id: 'r1', kind: 'reminder', text: 'call the vet', dueAt: at(-0.1) }),
  followUp({ id: 'r2', kind: 'commitment', text: 'send the deck to Ana', dueAt: at(-0.5) }),
  followUp({ id: 'r3', kind: 'thread', text: 'the pottery class', dueAt: null, createdAt: at(-2) }),
  followUp({ id: 'r4', kind: 'thread', text: 'the new bike', dueAt: null, createdAt: at(-1) }),
  followUp({ id: 'r5', kind: 'promise', text: 'Ferni finds a recipe', dueAt: at(-0.2) }),
  followUp({
    id: 'r6',
    kind: 'commitment',
    text: 'book the room',
    dueAt: at(-0.3),
    action: { tool: 'reachOut', waitingOn: 'you' },
  }),
  followUp({ id: 'r7', kind: 'date', text: "Lee's recital", dueAt: at(1) }),
  followUp({
    id: 'r8',
    kind: 'dose',
    text: 'evening vitamins',
    dueAt: at(-0.05),
    surfaced: [{ at: at(-0.01), via: 'opener' }],
  }),
  followUp({
    id: 'r9',
    kind: 'reminder',
    text: 'water the ferns',
    dueAt: at(-0.4),
    surfaced: [{ at: at(-1), via: 'opener' }],
  }),
  followUp({ id: 'r10', kind: 'thread', text: 'the cabin trip', dueAt: null, createdAt: at(-30) }),
];
const CLOCKS = [new Date(T0), new Date(T0 + 2 * DAY), new Date(T0 - DAY)];

const subsets = <T>(xs: readonly T[]): T[][] =>
  xs.reduce<T[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);

describe('askable.ts keeps the opener pick identical to main', () => {
  it("isCallersOwn agrees with main's predicate on every row", () => {
    expect(ROWS.map(isCallersOwn)).toEqual(ROWS.map(oldOwn));
    expect(ROWS.filter(isCallersOwn).map((f) => f.id)).toEqual(['r1', 'r2', 'r3', 'r4', 'r7', 'r8', 'r9', 'r10']); // prettier-ignore
  });

  it("byOpenerOrder sorts every row exactly as main's inline key did", () => {
    const ids = (rows: FollowUp[]) => rows.map((f) => f.id);
    expect(ids([...ROWS].sort(byOpenerOrder))).toEqual(ids(oldSort([...ROWS])));
    expect(ids([...ROWS].reverse().sort(byOpenerOrder))).toEqual(ids(oldSort([...ROWS].reverse())));
  });

  it('pickOpenerFollowUp picks what main picked, for all 1024 subsets at three clocks', () => {
    let compared = 0;
    let picked = 0;
    for (const now of CLOCKS) {
      for (const set of subsets(ROWS)) {
        const next = pickOpenerFollowUp(set, now)?.id ?? null;
        expect(next).toBe(oldPickOpenerFollowUp(set, now)?.id ?? null);
        compared += 1;
        if (next) picked += 1;
      }
    }
    expect(compared).toBe(3 * 1024);
    expect(picked).toBeGreaterThan(1000); // the comparison is not all nulls
  });
});
