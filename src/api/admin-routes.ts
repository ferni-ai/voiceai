/**
 * Admin API Routes
 *
 * Protected endpoints for admin dashboards and reporting.
 * These provide access to analytics and system statistics.
 *
 * @module api/admin-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { parse as parseUrl } from 'url';
import { createLogger } from '../utils/safe-logger.js';

const log = createLogger({ module: 'AdminAPI' });

// Simple admin API key check (should use proper auth in production)
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || 'ferni-admin-2026';

// ============================================================================
// ROUTE HANDLER
// ============================================================================

export async function handleAdminRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  path: string
): Promise<boolean> {
  // Check for admin API key
  const apiKey =
    req.headers['x-admin-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (apiKey !== ADMIN_API_KEY) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  const method = req.method || 'GET';
  const parsedUrl = parseUrl(req.url || '', true);
  const { query } = parsedUrl;

  switch (true) {
    case path === '/api/admin/daily-stats' && method === 'GET':
      await handleGetDailyStats(res, query);
      return true;

    case path === '/api/admin/callers' && method === 'GET':
      await handleGetCallers(res, query);
      return true;

    case path === '/api/admin/visitors' && method === 'GET':
      await handleGetVisitors(res, query);
      return true;

    case path === '/api/admin/trigger-report' && method === 'POST':
      await handleTriggerReport(res);
      return true;

    default:
      return false;
  }
}

// ============================================================================
// HANDLERS
// ============================================================================

async function handleGetDailyStats(
  res: ServerResponse,
  query: Record<string, string | string[] | undefined>
): Promise<void> {
  try {
    const { generateDailyReport } = await import('../services/admin/daily-report.js');

    // Parse date from query string (default: yesterday)
    const dateStr = query.date as string | undefined;
    let targetDate: Date | undefined;
    if (dateStr) {
      targetDate = new Date(dateStr);
      if (isNaN(targetDate.getTime())) {
        sendJson(res, 400, { error: 'Invalid date format. Use YYYY-MM-DD.' });
        return;
      }
    }

    const report = await generateDailyReport(targetDate);

    sendJson(res, 200, {
      success: true,
      data: report,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get daily stats');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleGetCallers(
  res: ServerResponse,
  query: Record<string, string | string[] | undefined>
): Promise<void> {
  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const daysBack = parseInt(query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    const snapshot = await db
      .collection('call_records')
      .where('timestamp', '>=', startDate)
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    const calls = snapshot.docs.map((doc: FirebaseFirestore.QueryDocumentSnapshot) => {
      const data = doc.data();
      return {
        id: doc.id,
        phoneNumber: maskPhoneNumber(data.phoneNumber || ''),
        direction: data.direction || 'unknown',
        duration: data.duration || 0,
        outcome: data.outcome || 'unknown',
        timestamp: data.timestamp?.toDate?.()?.toISOString() || null,
        userId: data.userId,
      };
    });

    sendJson(res, 200, {
      success: true,
      count: calls.length,
      daysBack,
      data: calls,
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get callers');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleGetVisitors(
  res: ServerResponse,
  query: Record<string, string | string[] | undefined>
): Promise<void> {
  try {
    const admin = await import('firebase-admin');
    const db = admin.firestore();

    const daysBack = parseInt(query.days as string) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    // Try analytics_sessions first
    const snapshot = await db
      .collection('analytics_sessions')
      .where('startedAt', '>=', startDate)
      .orderBy('startedAt', 'desc')
      .limit(200)
      .get();

    // Aggregate by user
    const userMap = new Map<
      string,
      { sessions: number; totalMinutes: number; lastSeen: Date; personas: Set<string> }
    >();

    for (const doc of snapshot.docs) {
      const data = doc.data();
      const userId = data.userId || 'anonymous';
      const existing = userMap.get(userId) || {
        sessions: 0,
        totalMinutes: 0,
        lastSeen: new Date(0),
        personas: new Set<string>(),
      };

      existing.sessions++;
      existing.totalMinutes += data.durationMinutes || 0;
      if (data.personaId) existing.personas.add(data.personaId);

      const sessionDate = data.startedAt?.toDate?.() || new Date();
      if (sessionDate > existing.lastSeen) {
        existing.lastSeen = sessionDate;
      }

      userMap.set(userId, existing);
    }

    const visitors = Array.from(userMap.entries())
      .map(([userId, stats]) => ({
        userId: userId.length > 20 ? `${userId.slice(0, 8)}...` : userId,
        sessions: stats.sessions,
        totalMinutes: Math.round(stats.totalMinutes * 10) / 10,
        lastSeen: stats.lastSeen.toISOString(),
        personas: Array.from(stats.personas),
      }))
      .sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());

    sendJson(res, 200, {
      success: true,
      uniqueVisitors: visitors.length,
      totalSessions: snapshot.docs.length,
      daysBack,
      data: visitors.slice(0, 50), // Limit to 50 for response size
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to get visitors');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function handleTriggerReport(res: ServerResponse): Promise<void> {
  try {
    const { generateDailyReport } = await import('../services/admin/daily-report.js');
    const { generateDailyReportHTML, generateDailyReportPlainText } =
      await import('../services/admin/daily-report-template.js');
    const { sendEmail, isEmailDeliveryAvailable, initializeEmailDelivery } =
      await import('../services/outreach/delivery/email-delivery.js');

    // Initialize email if not already done
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
      to: 'seth.ford@gmail.com',
      toName: 'Seth Ford',
      subject: `Ferni Daily Report - ${reportData.date} (Manual Trigger)`,
      body: plainText,
      html,
      personaId: 'ferni',
      userId: 'admin-manual',
      outreachId: `daily-report-manual-${Date.now()}`,
      preheader: `${reportData.visitors.unique} visitors, ${reportData.callers.total} calls`,
    });

    if (!emailResult.success) {
      throw new Error(emailResult.error || 'Failed to send email');
    }

    log.info({ date: reportData.date }, 'Manual daily report triggered and sent');

    sendJson(res, 200, {
      success: true,
      message: 'Report sent successfully',
      date: reportData.date,
      stats: {
        uniqueVisitors: reportData.visitors.unique,
        totalSessions: reportData.visitors.totalSessions,
        phoneCalls: reportData.callers.total,
      },
    });
  } catch (error) {
    log.error({ error: String(error) }, 'Failed to trigger report');
    sendJson(res, 500, {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function sendJson(res: ServerResponse, statusCode: number, data: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 4) return '***';
  const cleaned = phone.replace(/\D/g, '');
  const last4 = cleaned.slice(-4);
  return `+1 (***) ***-${last4}`;
}
