/**
 * Data Hygiene & Admin Maintenance Job Handlers
 *
 * Handles: ttl-cleanup, ttl-backfill, daily-admin-report
 *
 * @module api/scheduled-jobs/maintenance-jobs
 */

import type { ServerResponse } from 'http';
import { flagOn } from '../../config/env-flag.js';
import { createLogger } from '../../utils/safe-logger.js';
import { sendJson } from './helpers.js';
import { ownerEmail } from '../../config/owner-email.js';

const log = createLogger({ module: 'MaintenanceJobs' });

export async function handleTTLCleanup(res: ServerResponse): Promise<void> {
  try {
    log.info('Running TTL cleanup job (Cloud Scheduler)');

    const { runTTLCleanup } = await import('../../services/data-hygiene/ttl-cleanup.js');
    const result = await runTTLCleanup();

    log.info(
      {
        totalDeleted: result.totalDeleted,
        totalErrors: result.totalErrors,
        collectionsProcessed: result.stats.length,
      },
      'TTL cleanup completed'
    );

    sendJson(res, 200, {
      success: result.success,
      job: 'ttl-cleanup',
      stats: {
        totalDeleted: result.totalDeleted,
        totalErrors: result.totalErrors,
        collectionsProcessed: result.stats.length,
        durationMs: result.durationMs,
        details: result.stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'TTL cleanup job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/** Deletes erased accounts' BigQuery analytics rows (services/analytics/bq-erasure.ts). */
export async function handleBqErasure(res: ServerResponse): Promise<void> {
  if (!flagOn('BQ_ERASURE')) {
    log.info('BigQuery erasure skipped: BQ_ERASURE is off');
    sendJson(res, 200, { success: true, job: 'bq-erasure', skipped: 'BQ_ERASURE off' });
    return;
  }
  try {
    const { getFirestoreDb } = await import('../../services/superhuman/firestore-utils.js');
    const { runBqErasure } = await import('../../services/analytics/bq-erasure.js');
    const db = getFirestoreDb();
    if (!db) throw new Error('Firestore not available');
    const result = await runBqErasure(db);
    log.info(result, 'BigQuery erasure run');
    sendJson(res, result.retrying || result.overdue ? 500 : 200, {
      success: !result.retrying && !result.overdue,
      job: 'bq-erasure',
      ...result,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'BigQuery erasure job failed');
    sendJson(res, 500, { success: false, error: 'bq-erasure failed' });
  }
}

export async function handleTTLBackfill(res: ServerResponse): Promise<void> {
  try {
    log.info('Running TTL backfill migration (Cloud Scheduler)');

    const { runTTLBackfill } = await import('../../services/data-hygiene/ttl-backfill.js');
    const result = await runTTLBackfill({ dryRun: false });

    log.info(
      {
        totalUpdated: result.totalUpdated,
        totalSkipped: result.totalSkipped,
        totalErrors: result.totalErrors,
        collectionsProcessed: result.stats.length,
      },
      'TTL backfill completed'
    );

    sendJson(res, 200, {
      success: result.success,
      job: 'ttl-backfill',
      stats: {
        totalUpdated: result.totalUpdated,
        totalSkipped: result.totalSkipped,
        totalErrors: result.totalErrors,
        durationMs: result.durationMs,
        details: result.stats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'TTL backfill job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function handleDailyAdminReport(res: ServerResponse): Promise<void> {
  const owner = ownerEmail();
  if (!owner) {
    log.warn('OWNER_EMAIL is not set; daily admin report skipped');
    sendJson(res, 200, { success: true, job: 'daily-admin-report', skipped: 'OWNER_EMAIL unset' });
    return;
  }
  try {
    log.info('Running daily admin report job (Cloud Scheduler)');

    const { generateDailyReport } = await import('../../services/admin/daily-report.js');
    const { generateDailyReportHTML, generateDailyReportPlainText } =
      await import('../../services/admin/daily-report-template.js');
    const { sendEmail, isEmailDeliveryAvailable, initializeEmailDelivery } =
      await import('../../services/outreach/delivery/email-delivery.js');

    if (!isEmailDeliveryAvailable()) {
      const apiKey = process.env.SENDGRID_API_KEY;
      if (!apiKey) {
        throw new Error('SENDGRID_API_KEY not configured');
      }
      initializeEmailDelivery({
        provider: 'sendgrid',
        apiKey,
        fromEmail: process.env.SENDGRID_FROM_EMAIL || 'hello@ferni.ai',
        fromName: process.env.SENDGRID_FROM_NAME || 'Ferni',
        trackOpens: true,
        trackClicks: true,
      });
    }

    const reportData = await generateDailyReport();
    const html = generateDailyReportHTML(reportData);
    const plainText = generateDailyReportPlainText(reportData);

    const emailResult = await sendEmail({
      to: owner,
      subject: `Ferni Daily Report - ${reportData.date}`,
      body: plainText,
      html,
      personaId: 'ferni',
      userId: 'admin-reports',
      outreachId: `daily-report-${reportData.date}`,
      preheader: `${reportData.visitors.unique} visitors, ${reportData.callers.total} calls`,
    });

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send email');
    }

    log.info(
      {
        date: reportData.date,
        visitors: reportData.visitors.unique,
        sessions: reportData.visitors.totalSessions,
        calls: reportData.callers.total,
        messageId: emailResult.messageId,
      },
      'Daily admin report sent successfully'
    );

    sendJson(res, 200, {
      success: true,
      job: 'daily-admin-report',
      stats: {
        date: reportData.date,
        uniqueVisitors: reportData.visitors.unique,
        totalSessions: reportData.visitors.totalSessions,
        phoneCalls: reportData.callers.total,
        emailSent: true,
        messageId: emailResult.messageId,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Daily admin report job failed');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
