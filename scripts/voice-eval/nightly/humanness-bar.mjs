// Humanness text metrics (humanness.mjs) as a nightly metric: one field of computeHumanness over
// the night's recorded calls, so superhuman-bar.json can track how Ferni's replies are shaped
// (question endings, reaction openers) next to the judge's scores. Runs without a recording are
// left out; no recording at all is no data. The row is report only, so a run it can't read gives
// no data too, never a harness error for the whole night.
import { computeHumanness } from '../humanness.mjs';

/** { value, n } for one computeHumanness field (a dotted path such as wordsPerTurn.p50). */
export function humannessValue(runs, field) {
  const recorded = runs
    .map((r) => r.run)
    .filter((run) => Array.isArray(run?.events))
    // An event with no text (a clip that never played) has nothing to measure.
    .map((run) => ({ ...run, events: run.events.filter((e) => typeof e?.text === 'string') }));
  if (!recorded.length || !field) return { value: null, n: 0 };
  let m;
  try {
    m = computeHumanness(recorded);
  } catch (e) {
    process.stderr.write(`humanness bar: ${e instanceof Error ? e.message : e}\n`);
    return { value: null, n: 0 };
  }
  const value = field.split('.').reduce((o, k) => (o == null ? o : o[k]), m);
  return { value: typeof value === 'number' ? value : null, n: m.turns };
}
