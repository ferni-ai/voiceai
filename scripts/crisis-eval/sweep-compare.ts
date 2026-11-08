/**
 * Compares two crisis sweeps of the same fixture set: the base tree's scores and
 * the head tree's (sweep-lowerings.ts). The crisis lane is recall-first, so a read
 * going down on any line is a lowering: severity, isCrisis, imminent danger, who
 * is at risk (self > third party > bereaved > none) or assessSafety's level.
 *
 * The fixtures include the held-out set, and the sweep runs in public CI logs, so
 * a row's text never leaves compareSweeps: changes are reported by row id.
 */

export interface SweepRow {
  /** Stable id within one fixture set: source, index within that source, and "+earlier" when scored with prior turns. */
  id: string;
  src: string;
  label: string;
  text: string;
  sev: number;
  crisis: boolean;
  imminent: boolean;
  subject: string | null;
  level: string;
}

export interface SweepComparison {
  /** One line per distinct change (the same text can recur), naming every row it hit by id. */
  lowered: string[];
  raised: string[];
  /** Row counts. */
  loweredRows: number;
  raisedRows: number;
  identical: number;
}

const LEVEL_RANK: Record<string, number> = { safe: 0, concerning: 1, urgent: 2, crisis: 3 };
const SUBJECT_RANK: Record<string, number> = { bereaved: 1, third_party: 2, self: 3 };

const rank = (table: Record<string, number>, key: string | null): number => {
  if (key === null) return 0;
  const value = table[key];
  // An unknown value can't be ordered, so it can't be proven not lower.
  if (value === undefined) throw new Error(`unknown crisis read "${key}"`);
  return value;
};

/** -1 when any read went down, 1 when none did and some went up, 0 when all are equal. */
export function direction(base: SweepRow, head: SweepRow): -1 | 0 | 1 {
  const pairs: Array<[number, number]> = [
    [base.sev, head.sev],
    [Number(base.crisis), Number(head.crisis)],
    [Number(base.imminent), Number(head.imminent)],
    [rank(SUBJECT_RANK, base.subject), rank(SUBJECT_RANK, head.subject)],
    [rank(LEVEL_RANK, base.level), rank(LEVEL_RANK, head.level)],
  ];
  if (pairs.some(([b, h]) => h < b)) return -1;
  return pairs.some(([b, h]) => h > b) ? 1 : 0;
}

/** What changed on one row, without its text. */
export function describeChange(base: SweepRow, head: SweepRow): string {
  return (
    `[${head.src}/${head.label}] sev ${base.sev}->${head.sev} crisis ${base.crisis}->${head.crisis} ` +
    `imminent ${base.imminent}->${head.imminent} subject ${base.subject}->${head.subject} ` +
    `level ${base.level}->${head.level}`
  );
}

/** Both sweeps must score the same rows in the same order (the head's fixture set). */
export function compareSweeps(base: SweepRow[], head: SweepRow[]): SweepComparison {
  if (base.length !== head.length) {
    throw new Error(`sweeps differ in length: base ${base.length}, head ${head.length}`);
  }
  // Keyed by change and text, so a line that recurs is listed once with all its ids.
  const lowered = new Map<string, { change: string; ids: string[] }>();
  const raised = new Map<string, { change: string; ids: string[] }>();
  const add = (into: typeof lowered, b: SweepRow, h: SweepRow) => {
    const change = describeChange(b, h);
    const key = `${change}\n${h.text}`;
    const entry = into.get(key) ?? { change, ids: [] };
    entry.ids.push(h.id);
    into.set(key, entry);
  };
  const lines = (from: typeof lowered) =>
    [...from.values()].map((e) => `${e.change} | ${e.ids.join(' ')}`);
  const counts = { loweredRows: 0, raisedRows: 0, identical: 0 };
  base.forEach((b, i) => {
    const h = head[i];
    if (b.id !== h.id || b.text !== h.text) throw new Error(`row ${i} differs: ${b.id} vs ${h.id}`);
    const dir = direction(b, h);
    if (dir < 0) {
      counts.loweredRows++;
      add(lowered, b, h);
    } else if (dir > 0) {
      counts.raisedRows++;
      add(raised, b, h);
    } else counts.identical++;
  });
  return { lowered: lines(lowered), raised: lines(raised), ...counts };
}

/** Raised reads are fine and can run to thousands (a new pattern hits the adversarial set). */
const RAISED_SHOWN = 50;

/** What sweep-lowerings.ts prints for a comparison of `reads` rows that took `secs` seconds. */
export function reportLines(
  cmp: SweepComparison,
  reads: number,
  secs: string
): { stdout: string[]; stderr: string[] } {
  const stdout = [
    `${reads} reads in ${secs}s: ${cmp.loweredRows} lowered, ${cmp.raisedRows} raised, ` +
      `${cmp.identical} identical`,
    ...cmp.raised.slice(0, RAISED_SHOWN).map((r) => `raised  ${r}`),
    ...(cmp.raised.length > RAISED_SHOWN
      ? [`raised  ... and ${cmp.raised.length - RAISED_SHOWN} more`]
      : []),
    ...cmp.lowered.map((r) => `LOWERED ${r}`),
  ];
  const stderr =
    cmp.loweredRows === 0
      ? []
      : [
          `\n${cmp.lowered.length} distinct crisis reads went DOWN vs base. The crisis lane is ` +
            'recall-first: patterns are only ever added. Restore the lowered reads, or, if lowering ' +
            "them is intended, that is Seth's call: he approves it with the PR label " +
            'crisis:lowering-approved.',
        ];
  return { stdout, stderr };
}
