// Which persona a nightly call was with, so the judge's scores stay per persona: a teammate
// called directly (teammate-*.txt, "#@persona <id>") never averages into Ferni's numbers, and a
// teammate call the judge scored as someone else shows up (#3752).
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCENARIOS = join(dirname(fileURLToPath(import.meta.url)), '..', 'scenarios');

/** The scenario's "#@persona <id>" line, the persona run.sh starts it as, or null. */
export function scenarioPersona(scenario, dir = SCENARIOS) {
  const file = join(dir, `${scenario}.txt`);
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8').match(/^#@persona[ \t]+(\S+)/m)?.[1] ?? null;
}

/** Who answered, from what was recorded at call time first: meta.persona (run.sh), then the
 *  judge verdict's persona; the scenario file's line only when neither is set; else ferni. */
export const calledPersona = (r) =>
  r.run?.meta?.persona || r.judge?.persona || scenarioPersona(r.scenario) || 'ferni';

/** The runs a check with a `persona` field scores (every run without one). */
export const forPersona = (check, runs) =>
  check.persona ? runs.filter((r) => calledPersona(r) === check.persona) : runs;

/** judgedAs: calls whose judge verdict names another persona than the scenario's (#@persona,
 *  else ferni). A verdict without a persona (an older judge) measured nothing. */
export function judgedAsOther(runs) {
  const j = runs.filter((r) => typeof r.judge?.persona === 'string');
  const other = j.filter((r) => r.judge.persona !== (scenarioPersona(r.scenario) ?? 'ferni'));
  return { value: j.length ? other.length : null, n: j.length };
}
