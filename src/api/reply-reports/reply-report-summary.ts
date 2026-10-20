/**
 * Daily count of reported replies, sent to the operator.
 *
 * Runs from Cloud Scheduler (POST /api/jobs/reply-reports-summary). Counts
 * the last 24 hours of `reply_reports` by reason and, when there is at least
 * one, raises an ops alert (services/platform/ops-alert.ts), which the "Ferni
 * ops alert" Cloud Monitoring policy emails to the operator. Counts only: the
 * query selects the reason and match flag, so no report text is ever read here.
 *
 * @module api/reply-reports/reply-report-summary
 */
import type { ServerResponse } from 'http';
import type { Firestore } from '@google-cloud/firestore';
import { opsAlert } from '../../services/platform/ops-alert.js';
import { getFirestoreDb } from '../../utils/firestore-utils.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from '../scheduled-jobs/helpers.js';
import { REPLY_REPORT_REASONS, type ReplyReportReason } from './reply-report-input.js';

const log = createLogger({ module: 'ReplyReportSummary' });

export const SUMMARY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const REPLY_REPORTS_ALERT_KEY = 'reply-reports:daily';

export interface ReplyReportSummary {
  since: string;
  total: number;
  unmatched: number;
  byReason: Record<ReplyReportReason, number>;
}

export async function summarizeReplyReports(
  db: Firestore,
  now: number = Date.now()
): Promise<ReplyReportSummary> {
  const since = new Date(now - SUMMARY_WINDOW_MS);
  const snap = await db
    .collection('reply_reports')
    .where('createdAt', '>=', since)
    .select('reason', 'matched')
    .get();
  const byReason = Object.fromEntries(REPLY_REPORT_REASONS.map((r) => [r, 0])) as Record<
    ReplyReportReason,
    number
  >;
  let unmatched = 0;
  for (const doc of snap.docs) {
    const { reason, matched } = doc.data();
    if (typeof reason === 'string' && reason in byReason) byReason[reason as ReplyReportReason]++;
    if (matched !== true) unmatched++;
  }
  return { since: since.toISOString(), total: snap.size, unmatched, byReason };
}

/** Summarize, log, and alert the operator when anything was reported. */
export async function runReplyReportSummary(
  db: Firestore,
  now: number = Date.now()
): Promise<ReplyReportSummary> {
  const summary = await summarizeReplyReports(db, now);
  if (summary.total > 0) {
    opsAlert(
      REPLY_REPORTS_ALERT_KEY,
      `${summary.total} Ferni ${summary.total === 1 ? 'reply was' : 'replies were'} reported in the last 24 hours`,
      { ...summary }
    );
  } else {
    log.info({ ...summary }, 'No replies reported in the last 24 hours');
  }
  return summary;
}

/** POST /api/jobs/reply-reports-summary (scheduler auth is checked by the jobs router). */
export async function handleReplyReportSummaryJob(
  res: ServerResponse,
  getDb: () => Firestore | null = getFirestoreDb
): Promise<void> {
  const db = getDb();
  if (!db) {
    sendJson(res, 503, {
      success: false,
      job: 'reply-reports-summary',
      error: 'Firestore unavailable',
    });
    return;
  }
  try {
    const summary = await runReplyReportSummary(db);
    sendJson(res, 200, { success: true, job: 'reply-reports-summary', summary });
  } catch (error) {
    log.error({ error: String(error) }, 'Reply report summary failed');
    sendJson(res, 500, { success: false, job: 'reply-reports-summary' });
  }
}
