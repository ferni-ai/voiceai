/**
 * The follow-up delivery job: texts a person the one follow-up that is due
 * for them now, through the guarded sender every member text takes.
 *
 * Each run reads the follow-ups due across everyone, then per person:
 * expires the stale ones, and if their own FOLLOW_THROUGH_TEXTS cohort flag
 * is on, texts the oldest one whose right moment is `text-now` and marks it
 * surfaced. One text per person per run; a lost save (a call surfaced it
 * first) is reported, not retried. With `dryRun` nothing is sent or saved.
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

/** Follow-ups read per run, oldest due first. */
export const DUE_SCAN_LIMIT = 200;
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
  store: Pick<FollowUpStore, 'due' | 'save'>;
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
}

export interface FollowUpTextReport {
  scanned: number;
  people: number;
  sent: number;
  /** Would have been sent, in a dry run. */
  wouldSend: number;
  expired: number;
  notInCohort: number;
  held: Record<string, number>;
  lostSaves: number;
}

/** Oldest-due first, grouped by person, keeping that order within each. */
function byPerson(due: readonly FollowUp[]): Map<string, FollowUp[]> {
  const people = new Map<string, FollowUp[]>();
  for (const f of [...due].sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''))) {
    people.set(f.userId, [...(people.get(f.userId) ?? []), f]);
  }
  return people;
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

export async function sendDueFollowUpTexts(
  deps: FollowUpTextDeps,
  opts: { dryRun?: boolean; now?: Date } = {}
): Promise<FollowUpTextReport> {
  const now = opts.now ?? new Date();
  const dryRun = opts.dryRun === true;
  const due = await deps.store.due(now, DUE_SCAN_LIMIT);
  const people = byPerson(due);
  const report: FollowUpTextReport = {
    scanned: due.length,
    people: people.size,
    sent: 0,
    wouldSend: 0,
    expired: 0,
    notInCohort: 0,
    held: {},
    lostSaves: 0,
  };

  for (const [userId, theirs] of people) {
    const moments = theirs.map((f) => ({ f, moment: rightMoment(f, now) }));
    for (const { f } of moments.filter((m) => m.moment === 'expire')) {
      if (dryRun || (await record(deps.store, f, { type: 'expire' }, now))) report.expired++;
      else report.lostSaves++;
    }
    const pick = moments.find((m) => m.moment === 'text-now')?.f;
    if (!pick) continue;
    const flags = await deps.resolveFlags(userId);
    if (flags.FOLLOW_THROUGH_TEXTS !== 'on') {
      report.notInCohort++;
      continue;
    }
    if (dryRun) {
      report.wouldSend++;
      continue;
    }
    const outcome = await deps.sendText({
      userId,
      body: followUpText(pick),
      kind: 'follow-up',
      refId: pick.id,
      minGapMs: FOLLOW_UP_GAP_MS,
    });
    if (!outcome.sent) {
      const reason = outcome.reason ?? 'unknown';
      report.held[reason] = (report.held[reason] ?? 0) + 1;
      continue;
    }
    report.sent++;
    if (!(await record(deps.store, pick, { type: 'surface', via: 'text' }, now))) {
      report.lostSaves++;
    }
  }
  log.info({ ...report, dryRun }, 'Follow-up texts run');
  return report;
}
