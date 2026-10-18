/**
 * The follow-up delivery job: texts a person the one follow-up that is due
 * for them now, through the guarded sender every member text takes.
 *
 * Each run asks who may have FOLLOW_THROUGH_TEXTS on, then per person:
 * reads their own flags first (nothing is read or written for anyone who
 * isn't opted in), expires their stale follow-ups, and texts the oldest one
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
  rightMoment,
  type FollowUp,
  type FollowUpEvent,
  type FollowUpStore,
} from '../follow-through/index.js';
import { createLogger } from '../../utils/safe-logger.js';

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
  /** Their own quiet-hours check (messagingPrefs), read when their MESSAGING_PREFS is on. */
  quietFor?: (userId: string) => Promise<(at: Date, zone: string) => boolean>;
  /** The guarded sender (guarded-text.ts sendGuardedText). */
  sendText: (t: {
    userId: string;
    body: string;
    kind: 'follow-up';
    refId: string;
    minGapMs: number;
  }) => Promise<{ sent: boolean; reason?: string }>;
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
  /** People whose turn failed (a flag or store read threw); the run went on. */
  errors: number;
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

/** Their follow-ups due at or before now, oldest first. */
async function dueFor(
  store: FollowUpTextDeps['store'],
  userId: string,
  now: Date
): Promise<FollowUp[]> {
  const at = now.toISOString();
  return (await store.live(userId))
    .filter((f) => f.dueAt !== null && f.dueAt <= at)
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
  if (outcome.sent) {
    report.sent++;
    return;
  }
  const reason = outcome.reason ?? 'unknown';
  report.held[reason] = (report.held[reason] ?? 0) + 1;
  if (!(await deps.store.save(pick, claimed.data.updatedAt))) report.lostSaves++;
}

async function forPerson(
  deps: FollowUpTextDeps,
  userId: string,
  opts: { now: Date; dryRun: boolean },
  report: FollowUpTextReport
): Promise<void> {
  const flags = await deps.resolveFlags(userId);
  if (flags.FOLLOW_THROUGH_TEXTS !== 'on') {
    report.notInCohort++;
    return;
  }
  const { now, dryRun } = opts;
  const due = await dueFor(deps.store, userId, now);
  report.scanned += due.length;
  const on = flags.MESSAGING_PREFS === 'on' && deps.quietFor;
  const quiet = on ? await deps.quietFor?.(userId) : undefined;
  const moments = due.map((f) => ({ f, moment: rightMoment(f, now, quiet) }));
  for (const { f } of moments.filter((m) => m.moment === 'expire')) {
    if (dryRun || (await record(deps.store, f, { type: 'expire' }, now))) report.expired++;
    else report.lostSaves++;
  }
  const pick = moments.find((m) => m.moment === 'text-now')?.f;
  if (!pick) return;
  if (dryRun) {
    report.wouldSend++;
    report.wouldSendIds.push(pick.id);
    return;
  }
  await textOne(deps, pick, now, report);
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
    errors: 0,
  };
  for (const userId of people) {
    try {
      await forPerson(deps, userId, run, report);
    } catch (error) {
      report.errors++;
      log.warn({ error: String(error) }, 'Follow-up texts: one person failed, run continues');
    }
  }
  log.info({ ...report, dryRun: run.dryRun }, 'Follow-up texts run');
  return report;
}
