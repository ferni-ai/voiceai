/**
 * When each experiment flag must be decided, and where that decision is tracked.
 *
 * On 2026-10-23 the manifest held 294 experiments with no date or issue: flags
 * never died (code-health ddd.md §0.7, G6). An experiment's spec may now carry
 * `expires` (YYYY-MM-DD), `issue` and `context`; experiments listed before that
 * get their expiry from flag-lifecycle-backfill.generated.ts. The manifest test
 * (__tests__/flag-lifecycle.test.ts) fails when an experiment is past its expiry,
 * has none, or still says issue 'TBD' after ISSUE_TBD_UNTIL.
 *
 * At expiry: delete the flag, make it permanent (kind kill-switch or config), or
 * move the date with a reason in `context`.
 *
 * @module config/flag-lifecycle
 */
import { FLAG_EXPIRY_BACKFILL } from './flag-lifecycle-backfill.generated.js';
import type { FlagSpec } from './flag-spec.js';

/** A tracking issue not filed yet. Allowed until ISSUE_TBD_UNTIL; who files them is the lead's call. */
export const ISSUE_TBD = 'TBD';
export const ISSUE_TBD_UNTIL = '2026-12-01';
/** pnpm flags:new gives a new experiment this long. */
export const DEFAULT_EXPERIMENT_DAYS = 90;

export interface FlagLifecycle {
  expires?: string;
  issue?: string;
  context?: string;
  /** 'spec' when the flag's own entry says it, 'backfill' when it comes from the 2026-10-23 backfill. */
  source: 'spec' | 'backfill' | 'none';
}

export function flagLifecycle(name: string, spec: FlagSpec): FlagLifecycle {
  if (spec.expires)
    return { expires: spec.expires, issue: spec.issue, context: spec.context, source: 'spec' };
  const back = FLAG_EXPIRY_BACKFILL[name];
  if (back)
    return {
      expires: back.expires,
      issue: spec.issue ?? ISSUE_TBD,
      context: spec.context,
      source: 'backfill',
    };
  return { issue: spec.issue, context: spec.context, source: 'none' };
}

/** YYYY-MM-DD for a Date, in UTC. */
export const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

/** What is wrong with an experiment's lifecycle on `today` (YYYY-MM-DD); empty when fine. */
export function lifecycleProblems(name: string, spec: FlagSpec, today: string): string[] {
  if (spec.kind !== 'experiment') return [];
  const life = flagLifecycle(name, spec);
  const out: string[] = [];
  if (!life.expires)
    out.push(
      `${name}: experiment with no expires (add expires: 'YYYY-MM-DD', issue and context to its spec)`
    );
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(life.expires) || Number.isNaN(Date.parse(life.expires)))
    out.push(`${name}: expires '${life.expires}' is not YYYY-MM-DD`);
  else if (life.expires <= today)
    out.push(
      `${name}: expired ${life.expires}. Delete it, make it permanent (kind kill-switch/config), or move the date with a reason in context`
    );
  if (!life.issue)
    out.push(
      `${name}: experiment with no issue (an issue number/URL, or '${ISSUE_TBD}' until ${ISSUE_TBD_UNTIL})`
    );
  else if (life.issue === ISSUE_TBD && today >= ISSUE_TBD_UNTIL)
    out.push(
      `${name}: issue is still '${ISSUE_TBD}' after ${ISSUE_TBD_UNTIL}; file one and put its number here`
    );
  return out;
}
