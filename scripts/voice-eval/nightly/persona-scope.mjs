// Which nightly calls are teammate calls, so the judge's scores stay per persona: a teammate
// called directly (teammate-*.txt, "#@persona <id>") never averages into Ferni's numbers (#3752).
//
// Fail closed: a call is a teammate call only with positive evidence, and every other call stays
// in Ferni's gates. Unknown ids, other casing, a missing scenario file, a verdict that disagrees:
// all Ferni. A safety gate must never lose a call because of a label (#3756 review).
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

/** A teammate call: its scenario is listed for the teammate capability (the lane tags those
 *  lines `teammate`; lanes.test.mjs keeps the two in step), that scenario's file names a persona,
 *  and what was recorded at call time (meta.persona, the verdict's persona) names exactly that
 *  persona, at least one of them and neither disagreeing. */
export function isTeammateCall(r, caps) {
  if (!(caps.capabilities.teammate?.scenarios ?? []).includes(r.scenario)) return false;
  const want = scenarioPersona(r.scenario);
  const seen = [r.run?.meta?.persona, r.judge?.persona].filter((p) => p !== undefined && p !== '');
  return Boolean(want) && seen.length > 0 && seen.every((p) => p === want);
}

/** The runs a check's `persona` scope counts: "ferni" every call that is not positively a
 *  teammate call, "teammate" only those; no scope, every run. */
export function forPersona(check, runs, caps) {
  if (!check.persona) return runs;
  if (!['ferni', 'teammate'].includes(check.persona))
    throw new Error(`persona scope must be ferni or teammate, not ${check.persona}`);
  return runs.filter((r) => isTeammateCall(r, caps) === (check.persona === 'teammate'));
}

/** judgedAs: teammate-lane calls that are not positively that teammate (ran or were judged as
 *  someone else, or recorded no persona). They count in Ferni's gates instead; this shows them. */
export function judgedAsOther(runs, caps) {
  return {
    value: runs.length ? runs.filter((r) => !isTeammateCall(r, caps)).length : null,
    n: runs.length,
  };
}
