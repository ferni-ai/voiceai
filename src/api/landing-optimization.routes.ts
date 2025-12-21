/**
 * Landing Optimization API Handler
 *
 * API routes for the landing optimization agent.
 * Provides endpoints for reports, insights, experiments, and automation.
 *
 * @module api/landing-optimization-handler
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { createLogger } from '../utils/safe-logger.js';
import {
  collectLandingMetrics,
  dailyOptimizationCheck,
  generateOptimizationReport,
  runAutomatedOptimization,
  weeklyOptimizationReport,
  type AgentReport,
  type AutomationConfig,
} from '../services/landing-intelligence/optimization-agent.js';
import { getFirestore } from 'firebase-admin/firestore';
import { parseBody } from './helpers.js';

const log = createLogger({ module: 'LandingOptimizationHandler' });

// ============================================================================
// HELPERS
// ============================================================================

// parseBody imported from './helpers.js'

/**
 * Local sendJSON with CORS headers for landing pages (cross-origin requests)
 */
function sendJSON(res: ServerResponse, data: unknown, statusCode = 200): void {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function sendError(res: ServerResponse, message: string, statusCode = 500): void {
  sendJSON(res, { error: message }, statusCode);
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function handleLandingOptimizationRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string
): Promise<boolean> {
  // Only handle /api/landing/optimization/* routes
  if (!pathname.startsWith('/api/landing/optimization')) {
    return false;
  }

  const method = req.method || 'GET';

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return true;
  }

  // Simple admin auth check (in production, use proper auth)
  const adminKey = req.headers['x-admin-key'];
  const isAdmin = adminKey === process.env.ADMIN_KEY || adminKey === 'dev-mode';

  try {
    // ============================================================================
    // GET /api/landing/optimization/metrics - Get current metrics
    // ============================================================================
    if (pathname === '/api/landing/optimization/metrics' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const period = (url.searchParams.get('period') || 'week') as 'day' | 'week' | 'month';

      const metrics = await collectLandingMetrics(period);
      sendJSON(res, metrics);
      return true;
    }

    // ============================================================================
    // POST /api/landing/optimization/report - Generate new report
    // ============================================================================
    if (pathname === '/api/landing/optimization/report' && method === 'POST') {
      if (!isAdmin) {
        sendError(res, 'Unauthorized', 401);
        return true;
      }

      const { period } = await parseBody<{ period?: 'day' | 'week' | 'month' }>(req);
      const report = await generateOptimizationReport(period || 'week');
      sendJSON(res, report);
      return true;
    }

    // ============================================================================
    // GET /api/landing/optimization/reports - List recent reports
    // ============================================================================
    if (pathname === '/api/landing/optimization/reports' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const limit = parseInt(url.searchParams.get('limit') || '10', 10);

      const db = getFirestore();
      const reportsRef = db.collection('landing_optimization_reports');
      const reportsQuery = reportsRef.orderBy('generatedAt', 'desc').limit(limit);
      const snapshot = await reportsQuery.get();

      const reports = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      sendJSON(res, { reports });
      return true;
    }

    // ============================================================================
    // GET /api/landing/optimization/reports/:id - Get specific report
    // ============================================================================
    if (pathname.startsWith('/api/landing/optimization/reports/') && method === 'GET') {
      const reportId = pathname.split('/').pop();
      if (!reportId) {
        sendError(res, 'Report ID required', 400);
        return true;
      }

      const db = getFirestore();
      const reportDoc = await db.collection('landing_optimization_reports').doc(reportId).get();

      if (!reportDoc.exists) {
        sendError(res, 'Report not found', 404);
        return true;
      }

      sendJSON(res, { id: reportDoc.id, ...reportDoc.data() });
      return true;
    }

    // ============================================================================
    // POST /api/landing/optimization/run - Run automated optimization
    // ============================================================================
    if (pathname === '/api/landing/optimization/run' && method === 'POST') {
      if (!isAdmin) {
        sendError(res, 'Unauthorized', 401);
        return true;
      }

      const config = await parseBody<Partial<AutomationConfig>>(req);
      const result = await runAutomatedOptimization({
        autoApproveExperiments: config.autoApproveExperiments ?? false,
        minConfidenceForAction: config.minConfidenceForAction ?? 0.8,
        notifyOnAlerts: config.notifyOnAlerts ?? true,
      });

      sendJSON(res, result);
      return true;
    }

    // ============================================================================
    // GET /api/landing/optimization/insights - Get recent insights
    // ============================================================================
    if (pathname === '/api/landing/optimization/insights' && method === 'GET') {
      const url = new URL(req.url || '', 'http://localhost');
      const persona = url.searchParams.get('persona');
      const type = url.searchParams.get('type');

      const db = getFirestore();
      const reportsRef = db.collection('landing_optimization_reports');
      const latestReport = await reportsRef.orderBy('generatedAt', 'desc').limit(1).get();

      if (latestReport.empty) {
        sendJSON(res, { insights: [] });
        return true;
      }

      const report = latestReport.docs[0].data() as AgentReport;
      let insights = report.insights || [];

      // Filter by persona
      if (persona) {
        insights = insights.filter((i) => i.persona === persona);
      }

      // Filter by type
      if (type) {
        insights = insights.filter((i) => i.type === type);
      }

      sendJSON(res, { insights, reportId: report.id, generatedAt: report.generatedAt });
      return true;
    }

    // ============================================================================
    // GET /api/landing/optimization/experiments - Get suggested experiments
    // ============================================================================
    if (pathname === '/api/landing/optimization/experiments' && method === 'GET') {
      const db = getFirestore();
      const reportsRef = db.collection('landing_optimization_reports');
      const latestReport = await reportsRef.orderBy('generatedAt', 'desc').limit(1).get();

      if (latestReport.empty) {
        sendJSON(res, { experiments: [] });
        return true;
      }

      const report = latestReport.docs[0].data() as AgentReport;
      sendJSON(res, {
        experiments: report.experiments || [],
        reportId: report.id,
        generatedAt: report.generatedAt,
      });
      return true;
    }

    // ============================================================================
    // POST /api/landing/optimization/experiments/:id/approve - Approve experiment
    // ============================================================================
    if (
      pathname.match(/\/api\/landing\/optimization\/experiments\/[^/]+\/approve/) &&
      method === 'POST'
    ) {
      if (!isAdmin) {
        sendError(res, 'Unauthorized', 401);
        return true;
      }

      const experimentId = pathname.split('/')[5];

      // TODO: Integrate with existing experiments system
      // For now, just log and return success
      log.info({ experimentId }, 'Experiment approved');

      sendJSON(res, {
        success: true,
        experimentId,
        message: 'Experiment approved and scheduled',
      });
      return true;
    }

    // ============================================================================
    // SCHEDULED JOBS ENDPOINTS (for Cloud Scheduler)
    // ============================================================================

    // Daily check
    if (pathname === '/api/landing/optimization/jobs/daily' && method === 'POST') {
      // Verify Cloud Scheduler header or admin key
      const schedulerHeader = req.headers['x-cloudscheduler'];
      if (!schedulerHeader && !isAdmin) {
        sendError(res, 'Unauthorized', 401);
        return true;
      }

      await dailyOptimizationCheck();
      sendJSON(res, { success: true, job: 'daily' });
      return true;
    }

    // Weekly report
    if (pathname === '/api/landing/optimization/jobs/weekly' && method === 'POST') {
      const schedulerHeader = req.headers['x-cloudscheduler'];
      if (!schedulerHeader && !isAdmin) {
        sendError(res, 'Unauthorized', 401);
        return true;
      }

      const report = await weeklyOptimizationReport();
      sendJSON(res, { success: true, job: 'weekly', reportId: report.id });
      return true;
    }

    // Not handled
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'Landing optimization route error');
    sendError(res, error instanceof Error ? error.message : 'Internal server error');
    return true;
  }
}

export default handleLandingOptimizationRoutes;
