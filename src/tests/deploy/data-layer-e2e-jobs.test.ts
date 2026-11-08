/**
 * data-layer-e2e.yml runs two optional jobs (Entity Resolver Emulator, Data Layer
 * Unit Tests) on pull requests unless the repository variable OPTIONAL_CI is
 * 'off', and always on the nightly schedule. An unset repository variable reads as
 * '' on GitHub, so a repo that never set OPTIONAL_CI runs them. This pins both
 * directions of that condition against the workflow-jobs simulation, which must
 * read `vars.X` the way GitHub does (#3378's queue group failed when it could not).
 */
import { describe, expect, it } from 'vitest';
import { type Event, jobs, running } from './workflow-jobs.js';

const WORKFLOW = 'data-layer-e2e.yml';
const OPTIONAL = ['entity-resolver-emulator', 'unit-tests'];
const OPTIONAL_CI_OFF = { 'vars.OPTIONAL_CI': 'off' };

/** The optional jobs that run for the event. */
function optionalRunning(event: Event, outputs: Record<string, string> = {}): string[] {
  const ran = running(WORKFLOW, event, outputs);
  return OPTIONAL.filter((id) => ran.has(id));
}

describe('data-layer-e2e optional jobs and vars.OPTIONAL_CI', () => {
  it('reads both optional jobs, each gated on vars.OPTIONAL_CI (guards against reading the wrong file)', () => {
    const conds = jobs(WORKFLOW).filter((j) => OPTIONAL.includes(j.id));
    expect(conds.map((j) => j.id)).toEqual(OPTIONAL);
    for (const j of conds) expect(j.if).toContain("vars.OPTIONAL_CI != 'off'");
  });

  it('on a pull request with OPTIONAL_CI unset runs them (unset reads as empty)', () => {
    expect(optionalRunning('pull_request')).toEqual(OPTIONAL);
  });

  it("on a pull request with OPTIONAL_CI 'off' skips them (the override is live)", () => {
    expect(optionalRunning('pull_request', OPTIONAL_CI_OFF)).toEqual([]);
  });

  it("on the nightly schedule runs them even with OPTIONAL_CI 'off'", () => {
    expect(optionalRunning('schedule', OPTIONAL_CI_OFF)).toEqual(OPTIONAL);
  });
});
