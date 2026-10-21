/**
 * Some web-server switches go to one person through their cohort, never to
 * everyone. With COHORT_FLAGS=on (#1696) the scheduled jobs read a person's
 * cohort flags from Firestore, per user and read-only (usersWithFlag,
 * flagForUser, resolveCallerFlags), so these must stay out of the deploy's
 * env: set there, the server's value turns the switch on for every proactive
 * user, and a person's own 'off' can't undo it (ponderedNotesOn,
 * pondered-triggers.ts).
 */
import { describe, expect, it } from 'vitest';
import { uiServerEnv as workflowEnv } from './ui-deploy-env.js';

/** Grounded check-ins from the nightly pondering pass (Seth's `seth` cohort, 2026-10-18). */
const COHORT_ONLY_FLAGS = ['OUTREACH_PONDERED_NOTES'];

describe('cohort-only web-server flags', () => {
  it('the web server reads cohort flags', () => {
    expect(workflowEnv()).toContain('COHORT_FLAGS=on');
  });

  it.each(COHORT_ONLY_FLAGS)('the production workflow leaves %s to cohorts', (flag) => {
    expect(workflowEnv().filter((v) => v.startsWith(`${flag}=`))).toEqual([]);
  });
});
