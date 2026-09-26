/**
 * Wall-clock budgets for performance assertions in the unit suite.
 *
 * The suite had 88 assertions of the form `expect(elapsed).toBeLessThan(N)`,
 * each with N calibrated on a developer Mac. They could never have been checked
 * on CI: ci.yml had no runners from 2026-07-19 until 2026-09-25. Once it did,
 * they began failing one at a time on GitHub-hosted runners — pitch detection at
 * 321ms vs a 200ms budget, pre-STT frames at 5.92ms vs 5ms — with the same test
 * passing on one run and failing on the next.
 *
 * A budget is a statement about the code AND the machine. On a shared runner the
 * machine half is noise. So the budget scales:
 *   - locally, PERF_BUDGET_SCALE defaults to 1: a real regression is caught at
 *     full precision on the machine the number was measured on;
 *   - on CI (process.env.CI set), it defaults to 4: enough headroom for a shared
 *     runner, still tight enough to catch a catastrophic regression such as a
 *     native path silently falling back to a JS one.
 * Set PERF_BUDGET_SCALE explicitly to override either default.
 *
 * Deliberately NOT a blanket timeout increase: locally this multiplies by 1, so
 * wrapping an assertion cannot change any result on a developer machine.
 */
const DEFAULT_CI_SCALE = 4;

function resolveScale(): number {
  const raw = process.env.PERF_BUDGET_SCALE;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return process.env.CI ? DEFAULT_CI_SCALE : 1;
}

export const PERF_BUDGET_SCALE = resolveScale();

/** Scale a wall-clock budget (ms) for the current environment. */
export function perfBudget(ms: number): number {
  return ms * PERF_BUDGET_SCALE;
}
