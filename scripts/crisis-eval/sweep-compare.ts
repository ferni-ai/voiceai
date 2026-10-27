/**
 * Compares two crisis sweeps of the same fixture set: the base tree's scores and
 * the head tree's (sweep-lowerings.ts). The crisis lane is recall-first, so a read
 * going down on any line is a lowering: severity, isCrisis, imminent danger, who
 * is at risk (self > third party > bereaved > none) or assessSafety's level.
 */

export interface SweepRow {
  /** Stable id within one fixture set: source, index, and "+earlier" when scored with prior turns. */
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
  /** One line per distinct change (the same text recurs across fixtures). */
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

export function describeChange(base: SweepRow, head: SweepRow): string {
  return (
    `[${head.src}/${head.label}] sev ${base.sev}->${head.sev} crisis ${base.crisis}->${head.crisis} ` +
    `imminent ${base.imminent}->${head.imminent} subject ${base.subject}->${head.subject} ` +
    `level ${base.level}->${head.level} | ${head.text}`
  );
}

/** Both sweeps must score the same rows in the same order (the head's fixture set). */
export function compareSweeps(base: SweepRow[], head: SweepRow[]): SweepComparison {
  if (base.length !== head.length) {
    throw new Error(`sweeps differ in length: base ${base.length}, head ${head.length}`);
  }
  const lowered = new Set<string>();
  const raised = new Set<string>();
  const counts = { loweredRows: 0, raisedRows: 0, identical: 0 };
  base.forEach((b, i) => {
    const h = head[i];
    if (b.id !== h.id || b.text !== h.text) throw new Error(`row ${i} differs: ${b.id} vs ${h.id}`);
    const dir = direction(b, h);
    if (dir < 0) {
      counts.loweredRows++;
      lowered.add(describeChange(b, h));
    } else if (dir > 0) {
      counts.raisedRows++;
      raised.add(describeChange(b, h));
    } else counts.identical++;
  });
  return { lowered: [...lowered], raised: [...raised], ...counts };
}
