/**
 * The follow-up delivery job: texts a person the one follow-up that is due
 * for them now, through the guarded sender every member text takes.
 *
 * Each run asks who may have FOLLOW_THROUGH_TEXTS on, then per person:
 * reads their own flags first (nothing is read or written for anyone who
 * isn't opted in), then the topics they asked Ferni to forget: a due
 * follow-up about one is closed as forgotten and never texted, and when the
 * list can't be read nothing is sent to them this run (fail closed). Then it
 * expires their stale follow-ups and texts the oldest one
 * whose right moment is `text-now`. It claims the follow-up (saves it
 * surfaced, compare-and-set) before sending, so a call that raised it a
 * moment earlier wins and no text goes; if the sender holds the text, the
 * claim is put back so a later run can try again. One text per person per
 * run; one person's failure doesn't stop the rest. With `dryRun` nothing is
 * sent or saved.
 *
 * Off unless the UI server has FOLLOW_THROUGH_JOB=on.
 * Plan: docs/plans/2026-10-12-follow-through.md (PR 7).
 *
 * @module services/outreach/follow-up-texts
 */
import {
  apply,
  followUpTextOutcome,
  isCallerTimed,
  logPromiseJobRun,
  logPromiseOutcome,
  rightMoment,
  type FollowUp,
  type FollowUpEvent,
  type FollowUpStore,
  type PromiseJobCounts,
} from '../follow-through/index.js';
import { isForgotten } from '../../memory/recall/session-recall.js';
import { countReason, logJobRun } from '../../utils/job-run.js';
import { createLogger } from '../../utils/safe-logger.js';
import { isSavedQuietNow } from './quiet-hours.js';

const log = createLogger({ module: 'follow-up-texts' });

/** No second follow-up text to one person within this window, whatever it's about. */
export const FOLLOW_UP_GAP_MS = 20 * 60 * 60 * 1000;

export function followUpJobOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.FOLLOW_THROUGH_JOB === 'on';
}

/** The text, in their own words, the way a friend would put it. No em dashes or ellipses. */
export function followUpText(f: FollowUp): string {
  if (f.kind === 'commitment') return `It's Ferni. How did it go? You said: "${f.text}"`;
  return `It's Ferni. You asked me to remind you: ${f.text}`;
}

export interface FollowUpTextDeps {
  store: Pick<FollowUpStore, 'live' | 'save'>;
  /** People who may have FOLLOW_THROUGH_TEXTS on. resolveFlags still decides for each. */
  optedIn: () => Promise<string[]>;
  /** The person's cohort flags, from Firestore (never process env). */
  resolveFlags: (userId: string) => Promise<Record<string, string>>;
  /** The guarded sender (guarded-text.ts sendGuardedText). */
  sendText: (t: {
    userId: string;
    body: string;
    kind: 'follow-up';
    refId: string;
    minGapMs: number;
  }) => Promise<{ sent: boolean; reason?: string }>;
  /** Topics they asked Ferni to forget (forget.ts forgottenTopicsOrNull); null when unreadable. */
  forgotten: (userId: string) => Promise<string[] | null>;
}

export interface FollowUpTextReport {
  scanned: number;
  people: number;
  sent: number;
  /** Would have been sent, in a dry run. */
  wouldSend: number;
  /** The follow-up ids a dry run would have texted (hashed ids, never text or numbers). */
  wouldSendIds: string[];
  expired: number;
  notInCohort: number;
  held: Record<string, number>;
  lostSaves: number;
  /** Due follow-ups closed (or, in a dry run, that would be) because their topic was forgotten. */
  forgotten: number;
  /** People sent nothing because their forgotten topics couldn't be read. */
  forgottenUnreadable: number;
  /** People whose turn failed (a flag or store read threw); the run went on. */
  errors: number;
  /** Due follow-ups not texted this run, by their right moment ('next-call', 'wait'). */
  notTextNow: Record<string, number>;
}

/** The run in PROMISE_JOB_RUN terms: a skip the sender will retry is held, the rest failed. */
export function followUpJobCounts(r: FollowUpTextReport): PromiseJobCounts {
  const counts = { due: r.scanned, done: r.sent, failed: 0, held: 0, missed: r.expired };
  for (const [reason, n] of Object.entries(r.held)) {
    if (followUpTextOutcome(reason).outcome === 'held') counts.held += n;
    else counts.failed += n;
  }
  return counts;
}

async function record(
  store: FollowUpTextDeps['store'],
  f: FollowUp,
  event: FollowUpEvent,
  now: Date
): Promise<boolean> {
  const next = apply(f, event, now);
  if (!next.success) {
    log.warn({ followUpId: f.id, error: next.error }, 'Follow-up event refused');
    return false;
  }
  return store.save(next.data, f.updatedAt);
}

/**
 * Their follow-ups due at or before now, oldest first. A follow-up imported
 * from a reminder is left out: the reminder job (reminder-delivery-job.ts)
 * already texts it, once, with the same words, so texting it here sent it twice.
 */
async function dueFor(
  store: FollowUpTextDeps['store'],
  userId: string,
  now: Date
): Promise<FollowUp[]> {
  const at = now.toISOString();
  return (await store.live(userId))
    .filter((f) => f.dueAt !== null && f.dueAt <= at && f.source.store !== 'reminders')
    .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
}

/** Claim, send, and put the claim back if the sender held the text. */
async function textOne(
  deps: FollowUpTextDeps,
  pick: FollowUp,
  now: Date,
  report: FollowUpTextReport
): Promise<void> {
  const claimed = apply(pick, { type: 'surface', via: 'text' }, now);
  if (!claimed.success) {
    log.warn({ followUpId: pick.id, error: claimed.error }, 'Follow-up event refused');
    return;
  }
  if (!(await deps.store.save(claimed.data, pick.updatedAt))) {
    report.lostSaves++; // a call raised it first: no text
    return;
  }
  // A send that throws may still have gone out, so its claim stays.
  const outcome = await deps.sendText({
    userId: pick.userId,
    body: followUpText(pick),
    kind: 'follow-up',
    refId: pick.id,
    minGapMs: FOLLOW_UP_GAP_MS,
  });
  const reason = outcome.sent ? 'sent' : (outcome.reason ?? 'unknown');
  logPromiseOutcome('follow-through-text', followUpTextOutcome(reason), { followUpId: pick.id });
  if (outcome.sent) {
    report.sent++;
    return;
  }
  report.held[reason] = (report.held[reason] ?? 0) + 1;
  if (!(await deps.store.save(pick, claimed.data.updatedAt))) report.lostSaves++;
}

/** Their forgotten topics, or null (logged with a fixed reason) when unreadable. */
async function forgottenOf(deps: FollowUpTextDeps, userId: string): Promise<string[] | null> {
  const topics = await deps.forgotten(userId).catch(() => null);
  if (!topics)
    log.warn({ reason: 'forgotten-unreadable' }, 'Follow-up texts: none for this person');
  return topics;
}

/** Close due follow-ups about a forgotten topic; the rest, still to consider. */
async function dropForgotten(
  deps: FollowUpTextDeps,
  due: FollowUp[],
  topics: string[],
  opts: { now: Date; dryRun: boolean },
  report: FollowUpTextReport
): Promise<FollowUp[]> {
  const keep: FollowUp[] = [];
  for (const f of due) {
    if (!isForgotten(f.text, topics)) {
      keep.push(f);
      continue;
    }
    const event: FollowUpEvent = { type: 'release', reason: 'forgotten' };
    if (opts.dryRun) report.forgotten++;
    else if (await record(deps.store, f, event, opts.now)) {
      report.forgotten++;
      logPromiseOutcome('follow-through-text', followUpTextOutcome('forgotten'), {
        followUpId: f.id,
      });
    } else report.lostSaves++;
  }
  return keep;
}

async function forPerson(
  deps: FollowUpTextDeps,
  userId: string,
  opts: { now: Date; dryRun: boolean },
  report: FollowUpTextReport
): Promise<boolean> {
  const flags = await deps.resolveFlags(userId);
  if (flags.FOLLOW_THROUGH_TEXTS !== 'on') {
    report.notInCohort++;
    return false;
  }
  const topics = await forgottenOf(deps, userId);
  if (!topics) {
    report.forgottenUnreadable++;
    return false;
  }
  const { now, dryRun } = opts;
  const allDue = await dueFor(deps.store, userId, now);
  report.scanned += allDue.length;
  const due = await dropForgotten(deps, allDue, topics, opts, report);
  const moments = due.map((f) => ({ f, moment: rightMoment(f, now) }));
  for (const { f } of moments.filter((m) => m.moment === 'expire')) {
    if (dryRun) report.expired++;
    else if (await record(deps.store, f, { type: 'expire' }, now)) {
      report.expired++;
      logPromiseOutcome('follow-through-text', followUpTextOutcome('expired'), {
        followUpId: f.id,
      });
    } else report.lostSaves++;
  }
  for (const { moment } of moments) {
    if (moment !== 'text-now' && moment !== 'expire') countReason(report.notTextNow, moment);
  }
  const pick = moments.find((m) => m.moment === 'text-now')?.f;
  if (!pick) return false;
  // One Ferni starts, inside the quiet hours they saved in the menu, waits for a later run.
  if (!isCallerTimed(pick) && (await isSavedQuietNow(userId, now))) {
    report.held['quiet-hours'] = (report.held['quiet-hours'] ?? 0) + 1;
    return true;
  }
  if (dryRun) {
    report.wouldSend++;
    report.wouldSendIds.push(pick.id);
    return true;
  }
  await textOne(deps, pick, now, report);
  return true;
}

export async function sendDueFollowUpTexts(
  deps: FollowUpTextDeps,
  opts: { dryRun?: boolean; now?: Date } = {}
): Promise<FollowUpTextReport> {
  const run = { now: opts.now ?? new Date(), dryRun: opts.dryRun === true };
  const people = [...new Set(await deps.optedIn())];
  const report: FollowUpTextReport = {
    scanned: 0,
    people: people.length,
    sent: 0,
    wouldSend: 0,
    wouldSendIds: [],
    expired: 0,
    notInCohort: 0,
    held: {},
    lostSaves: 0,
    forgotten: 0,
    forgottenUnreadable: 0,
    errors: 0,
    notTextNow: {},
  };
  /** People with a follow-up to text now, sent or held. */
  let eligible = 0;
  for (const userId of people) {
    try {
      if (await forPerson(deps, userId, run, report)) eligible++;
    } catch (error) {
      report.errors++;
      log.warn({ error: String(error) }, 'Follow-up texts: one person failed, run continues');
    }
  }
  log.info({ ...report, dryRun: run.dryRun }, 'Follow-up texts run');
  if (!run.dryRun) logPromiseJobRun('follow-through', followUpJobCounts(report));
  const skippedBy: Record<string, number> = { ...report.held, ...report.notTextNow };
  if (report.notInCohort) skippedBy['not-in-cohort'] = report.notInCohort;
  if (report.forgottenUnreadable) skippedBy['forgotten-unreadable'] = report.forgottenUnreadable;
  if (report.errors) skippedBy.error = report.errors;
  logJobRun(
    log,
    'FOLLOW_THROUGH',
    { considered: report.people, eligible, sent: report.sent, skippedBy },
    { dryRun: run.dryRun, due: report.scanned, expired: report.expired }
  );
  return report;
}
