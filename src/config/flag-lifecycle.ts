/**
 * When each experiment flag must be decided, and where that decision is tracked.
 *
 * On 2026-10-23 the manifest held 294 experiments with no date or issue: flags never died
 * (code-health ddd.md §0.7, G6). An experiment's spec may now carry `expires` (YYYY-MM-DD),
 * `issue` and `context`; experiments listed before that get their expiry from
 * flag-lifecycle-backfill.generated.ts.
 *
 * Warn first. An expired experiment, a 'TBD' issue past ISSUE_TBD_UNTIL, or a missing
 * expiry past MISSING_EXPIRES_GRACE is a warning: an annotation on CI runs and a nightly
 * issue per owner (scripts/flags/expiry.ts), never a failure on main or in the merge queue.
 * The one hard rule is for the PR that adds or edits an experiment's spec: it must carry a
 * valid `expires` in the future (specProblems, checked against the merge base).
 *
 * At expiry: delete the flag, make it permanent (kind kill-switch or config), or move the
 * date with a reason in `context`.
 *
 * @module config/flag-lifecycle
 */
import { FLAG_EXPIRY_BACKFILL } from './flag-lifecycle-backfill.generated.js';
import type { FlagSpec } from './flag-spec.js';

/** A tracking issue not filed yet. Warned about from ISSUE_TBD_UNTIL; who files them is the lead's call. */
export const ISSUE_TBD = 'TBD';
export const ISSUE_TBD_UNTIL = '2026-12-01';
/** An existing experiment with no expiry anywhere is warned about from this date. */
export const MISSING_EXPIRES_GRACE = '2026-12-01';
/** pnpm flags:new gives a new experiment this long. */
export const DEFAULT_EXPERIMENT_DAYS = 90;

interface FlagLifecycle {
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

const isDay = (s: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && isoDay(new Date(s)) === s;

/** Warnings for an experiment on `today` (YYYY-MM-DD): annotations and nightly issues, never a failure. */
export function lifecycleWarnings(name: string, spec: FlagSpec, today: string): string[] {
  if (spec.kind !== 'experiment') return [];
  const life = flagLifecycle(name, spec);
  const out: string[] = [];
  if (!life.expires) {
    if (today >= MISSING_EXPIRES_GRACE)
      out.push(
        `${name}: experiment with no expires (add expires: 'YYYY-MM-DD', issue and context to its spec)`
      );
  } else if (!isDay(life.expires))
    out.push(`${name}: expires '${life.expires}' is not a YYYY-MM-DD date`);
  else if (life.expires <= today) {
    out.push(
      `${name}: expired ${life.expires}. Delete it, make it permanent (kind kill-switch/config), or move the date with a reason in context`
    );
  }
  if (life.issue === ISSUE_TBD && today >= ISSUE_TBD_UNTIL)
    out.push(
      `${name}: issue is still '${ISSUE_TBD}' after ${ISSUE_TBD_UNTIL}; file one and put its number here`
    );
  return out;
}

/**
 * The hard rule, for a spec a PR adds or edits: an experiment must carry its own valid
 * `expires` after `today`, and an issue. Empty when the spec may land.
 */
export function specProblems(name: string, spec: Partial<FlagSpec>, today: string): string[] {
  if (spec.kind !== 'experiment') return [];
  const out: string[] = [];
  if (!spec.expires)
    out.push(
      `${name}: a new or edited experiment needs expires: 'YYYY-MM-DD' in its spec (pnpm flags:new writes it)`
    );
  else if (!isDay(spec.expires))
    out.push(`${name}: expires '${spec.expires}' is not a YYYY-MM-DD date`);
  else if (spec.expires <= today) out.push(`${name}: expires ${spec.expires} is not in the future`);
  if (!spec.issue)
    out.push(`${name}: a new or edited experiment needs issue ('#123', a URL, or '${ISSUE_TBD}')`);
  return out;
}
