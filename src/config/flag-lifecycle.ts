/**
 * When each experiment flag must be decided, and where that decision is tracked.
 *
 * On 2026-10-23 the manifest held 294 experiments with no date or issue: flags never died
 * (code-health ddd.md §0.7, G6). An experiment's spec may now carry `expires` (YYYY-MM-DD),
 * `issue` and `context`; experiments listed before that get their expiry from
 * flag-lifecycle-backfill.ts.
 *
 * Warn first. An expired experiment, a 'TBD' issue from ISSUE_TBD_WARN_FROM, or a missing
 * expiry past MISSING_EXPIRES_GRACE is a warning: an annotation on CI runs and a nightly
 * issue per owner (scripts/flags/expiry.ts), never a failure on main or in the merge queue.
 * Hard failures are only for what a PR does, checked against its merge base:
 * - a NEW experiment needs its own valid `expires`, in the future and at most MAX_EXPIRY_DAYS
 *   out, and a real issue ('#123' or an issue URL) from day one (specProblems);
 * - an EXISTING experiment whose spec it edits needs the same `expires`; its issue may stay
 *   'TBD' until ISSUE_TBD_UNTIL;
 * - from the grace date, a flag whose registry entry it touches must already have an expiry
 *   (touchedProblems);
 * - from ISSUE_TBD_UNTIL, an existing experiment it edits or touches needs a real issue: its
 *   own, or the open nightly 'Flag expiry: <owner>' issue for its owner, which counts for every
 *   flag that owner still has on 'TBD', so nobody has to hand-edit 350 specs. From that date an
 *   issue number counts only if it is an OPEN issue in this repo (issueCounts): not a made-up
 *   '#999999', and not a PR's number, since a PR closes when it merges;
 * - the backfill may only shrink or move dates earlier (scripts/flags/expiry.ts).
 * A unit test also fails while the backfill names a flag that is no longer an experiment.
 *
 * At expiry: delete the flag, make it permanent (kind kill-switch or config), or move the
 * date with a reason in `context`.
 *
 * @module config/flag-lifecycle
 */
import { FLAG_EXPIRY_BACKFILL } from './flag-lifecycle-backfill.js';

/** A tracking issue not filed yet. Only existing experiments may carry it (pnpm flags:new refuses it). */
export const ISSUE_TBD = 'TBD';
/** From this date 'TBD' is a warning (annotation + the owner's nightly issue). */
export const ISSUE_TBD_WARN_FROM = '2026-12-01';
/**
 * From this date a PR that edits or touches an experiment still on 'TBD' fails, unless its
 * owner's nightly issue is open. Six weeks after the warnings start, so the nightly issues
 * exist first and there is no day-one wall of failing PRs (Seth, 2026-10-26).
 */
export const ISSUE_TBD_UNTIL = '2027-01-15';
/** An existing experiment with no expiry anywhere is warned about from this date. */
export const MISSING_EXPIRES_GRACE = '2026-12-01';
/** The furthest a new or edited expires may be: a flag gets reviewed at least twice a year. */
export const MAX_EXPIRY_DAYS = 180;
/** pnpm flags:new gives a new experiment this long. */
export const DEFAULT_EXPERIMENT_DAYS = 90;

/**
 * A real tracking issue: '#123' or a GitHub issue URL. Mirrored as REAL_ISSUE in
 * scripts/flags/new-flag.ts (a test keeps them equal).
 */
export const REAL_ISSUE = /^(?:#\d+|https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/issues\/\d+)$/;
export const isRealIssue = (issue: string | undefined): boolean =>
  !!issue && REAL_ISSUE.test(issue);

/** What the Flag expiry check asks GitHub (scripts/flags/expiry.ts), and only past ISSUE_TBD_UNTIL. */
export interface IssueLookup {
  /** The open nightly 'Flag expiry: <owner>' issue ('#123'), or undefined. */
  ownerIssue(owner: string): string | undefined;
  /** True only for an OPEN issue (not a pull request) in this repo. */
  isOpenIssue(ref: string): boolean;
}

/**
 * Whether `issue` counts as a real tracking issue on `today`. Before ISSUE_TBD_UNTIL the shape is
 * enough ('#123' or an issue URL). From then it must also be an open issue in this repo, so a
 * made-up '#999999' or a merged PR's number stops counting; with no lookup, nothing counts.
 */
export function issueCounts(
  issue: string | undefined,
  today: string,
  issues: IssueLookup | undefined
): boolean {
  if (!isRealIssue(issue)) return false;
  if (today < ISSUE_TBD_UNTIL) return true;
  return issues?.isOpenIssue(issue!) ?? false;
}

const notCountedWhy = (issue: string | undefined): string =>
  isRealIssue(issue) ? `'${issue}' is not an open issue in this repo` : `its issue is '${issue ?? ISSUE_TBD}'`;

/** The fields this module reads: a FlagSpec, or a spec parsed from a registry file's text. */
interface LifecycleFields {
  kind: string;
  owner?: string;
  expires?: string;
  issue?: string;
  context?: string;
}

interface FlagLifecycle {
  expires?: string;
  issue?: string;
  context?: string;
  /** 'spec' when the flag's own entry says it, 'backfill' when it comes from the 2026-10-23 backfill. */
  source: 'spec' | 'backfill' | 'none';
}

export function flagLifecycle(name: string, spec: LifecycleFields): FlagLifecycle {
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
export function lifecycleWarnings(name: string, spec: LifecycleFields, today: string): string[] {
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
  if (life.issue === ISSUE_TBD && today >= ISSUE_TBD_WARN_FROM)
    out.push(
      `${name}: issue is still '${ISSUE_TBD}' after ${ISSUE_TBD_WARN_FROM}; file one and put its number here (a PR touching it fails from ${ISSUE_TBD_UNTIL} unless this owner issue is open)`
    );
  return out;
}

/**
 * Past ISSUE_TBD_UNTIL, an existing experiment without a real issue of its own: empty when its
 * owner's nightly issue is open (that issue tracks it), else the problem.
 */
function tbdProblem(
  name: string,
  spec: LifecycleFields,
  today: string,
  issues: IssueLookup | undefined,
  what: string
): string[] {
  if (today < ISSUE_TBD_UNTIL || issueCounts(spec.issue, today, issues)) return [];
  if (spec.owner && issues?.ownerIssue(spec.owner)) return [];
  return [
    `${name}: ${what} after ${ISSUE_TBD_UNTIL} and ${notCountedWhy(spec.issue)}; put an open issue ('#123') in its spec, or wait for the nightly 'Flag expiry: ${spec.owner ?? '<owner>'}' issue to open`,
  ];
}

/**
 * The hard rule, for a spec a PR adds or edits: an experiment must carry its own valid
 * `expires` after `today`, and an issue. A new experiment (not one at the merge base) needs a
 * real issue from day one; an existing one may keep 'TBD' until ISSUE_TBD_UNTIL, or past it
 * while its owner's nightly issue is open. Empty when the spec may land.
 */
export function specProblems(
  name: string,
  spec: Partial<LifecycleFields>,
  today: string,
  opts: { isNew: boolean; issues?: IssueLookup } = { isNew: true }
): string[] {
  if (spec.kind !== 'experiment') return [];
  const out: string[] = [];
  if (!spec.expires)
    out.push(
      `${name}: a new or edited experiment needs expires: 'YYYY-MM-DD' in its spec (pnpm flags:new writes it)`
    );
  else if (!isDay(spec.expires))
    out.push(`${name}: expires '${spec.expires}' is not a YYYY-MM-DD date`);
  else if (spec.expires <= today) out.push(`${name}: expires ${spec.expires} is not in the future`);
  else if (spec.expires > isoDay(new Date(Date.parse(today) + MAX_EXPIRY_DAYS * 86_400_000))) {
    out.push(
      `${name}: expires ${spec.expires} is more than ${MAX_EXPIRY_DAYS} days out; pick a nearer review date`
    );
  }
  if (opts.isNew) {
    if (!isRealIssue(spec.issue))
      out.push(
        `${name}: a new experiment needs a real issue ('#123' or an issue URL) from day one, not '${spec.issue ?? ''}'; file it, then pnpm flags:new … --issue '#123'`
      );
    else if (!issueCounts(spec.issue, today, opts.issues))
      out.push(`${name}: a new experiment's issue ${notCountedWhy(spec.issue)}`);
  } else if (!spec.issue)
    out.push(`${name}: an edited experiment needs issue ('#123', an issue URL, or '${ISSUE_TBD}')`);
  else if (spec.issue !== ISSUE_TBD && !isRealIssue(spec.issue))
    out.push(`${name}: issue '${spec.issue}' is not '#123', an issue URL, or '${ISSUE_TBD}'`);
  else out.push(...tbdProblem(name, spec as LifecycleFields, today, opts.issues, 'edited'));
  return out;
}

/**
 * From the grace dates, a PR that touches an experiment's registry entry (spec or comments) has
 * to bring it up to date: an expiry somewhere (its spec or the backfill) from
 * MISSING_EXPIRES_GRACE, and from ISSUE_TBD_UNTIL a real issue or its owner's open nightly issue.
 */
export function touchedProblems(
  name: string,
  spec: LifecycleFields,
  today: string,
  issues?: IssueLookup
): string[] {
  if (spec.kind !== 'experiment') return [];
  const life = flagLifecycle(name, spec);
  const out: string[] = [];
  if (!life.expires && today >= MISSING_EXPIRES_GRACE) {
    out.push(
      `${name}: touched after ${MISSING_EXPIRES_GRACE} and still has no expires; add expires, issue and context to its spec`
    );
  }
  out.push(...tbdProblem(name, { ...spec, issue: life.issue }, today, issues, 'touched'));
  return out;
}
