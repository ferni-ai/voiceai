/**
 * FinOps API Routes
 *
 * API endpoints for the FinOps dashboard.
 * Provides cost snapshots, thresholds, and configuration.
 *
 * @module api/finops-routes
 */

import type { IncomingMessage, ServerResponse } from 'http';
import { z } from 'zod';
import { createLogger } from '../utils/safe-logger.js';
import { finops } from '../services/observability/finops.js';

// ============================================================================
// VALIDATION SCHEMAS (Zod)
// ============================================================================

const RevenueSchema = z.object({
  mrr: z.number().nonnegative({ message: 'MRR must be non-negative' }),
});

const CashSchema = z.object({
  amount: z.number().nonnegative({ message: 'Amount must be non-negative' }),
});

const LtvCacConfigSchema = z.object({
  cac: z.number().optional(),
  lifetimeMonths: z.number().optional(),
  churnRate: z.number().optional(),
});

const log = createLogger({ module: 'FinOpsRoutes' });

// ============================================================================
// HELPERS
// ============================================================================

function isAdmin(req: IncomingMessage, query: URLSearchParams): boolean {
  const adminKey = req.headers['x-admin-key'] || query.get('admin_key');
  const devMode = process.env.NODE_ENV === 'development' || adminKey === 'dev-mode';
  return devMode || adminKey === process.env.ADMIN_KEY;
}

function sendJSON(res: ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

async function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle FinOps API routes.
 * Returns true if route was handled.
 */
export async function handleFinOpsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  parsedUrl: URL
): Promise<boolean> {
  // Only handle /api/finops/* routes
  if (!pathname.startsWith('/api/finops')) {
    return false;
  }

  const query = parsedUrl.searchParams;

  // Auth check
  if (!isAdmin(req, query)) {
    sendJSON(res, { error: 'Unauthorized' }, 401);
    return true;
  }

  try {
    // GET /api/finops/snapshot
    if (pathname === '/api/finops/snapshot' && req.method === 'GET') {
      const snapshot = finops.getSnapshot();
      sendJSON(res, snapshot);
      return true;
    }

    // GET /api/finops/thresholds
    if (pathname === '/api/finops/thresholds' && req.method === 'GET') {
      const thresholds = finops.getThresholds();
      sendJSON(res, thresholds);
      return true;
    }

    // PUT /api/finops/thresholds
    if (pathname === '/api/finops/thresholds' && req.method === 'PUT') {
      const body = await parseBody(req);
      finops.setThresholds(body);
      sendJSON(res, { success: true, thresholds: finops.getThresholds() });
      return true;
    }

    // PUT /api/finops/revenue
    if (pathname === '/api/finops/revenue' && req.method === 'PUT') {
      const body = await parseBody(req);
      const result = RevenueSchema.safeParse(body);
      if (!result.success) {
        sendJSON(res, { error: result.error.issues[0]?.message || 'Invalid MRR value' }, 400);
        return true;
      }
      finops.setMonthlyRevenue(result.data.mrr);
      sendJSON(res, { success: true, mrr: result.data.mrr });
      return true;
    }

    // PUT /api/finops/cash
    if (pathname === '/api/finops/cash' && req.method === 'PUT') {
      const body = await parseBody(req);
      const result = CashSchema.safeParse(body);
      if (!result.success) {
        sendJSON(res, { error: result.error.issues[0]?.message || 'Invalid cash amount' }, 400);
        return true;
      }
      finops.setCashReserve(result.data.amount);
      sendJSON(res, { success: true, amount: result.data.amount });
      return true;
    }

    // GET /api/finops/pricing
    if (pathname === '/api/finops/pricing' && req.method === 'GET') {
      sendJSON(res, finops.PRICING);
      return true;
    }

    // GET /api/finops/unit-economics
    if (pathname === '/api/finops/unit-economics' && req.method === 'GET') {
      const snapshot = finops.getSnapshot();

      const unitEconomics = {
        costPerConversation: snapshot.avgCostPerConversation,
        freeTier: {
          avgCostPerUser: snapshot.avgCostPerFreeUser,
          totalCost: snapshot.costByTier.free.cost,
          sessions: snapshot.costByTier.free.sessions,
          users: snapshot.costByTier.free.users,
          sessionsBeforeBreakeven: null as number | null,
        },
        paidTier: {
          avgCostPerUser: snapshot.avgCostPerPaidUser,
          avgRevenuePerUser: snapshot.avgRevenuePerPaidUser,
          totalCost: snapshot.costByTier.friend.cost + snapshot.costByTier.partner.cost,
          sessions: snapshot.costByTier.friend.sessions + snapshot.costByTier.partner.sessions,
          users: snapshot.costByTier.friend.users + snapshot.costByTier.partner.users,
          marginPerUser: snapshot.avgRevenuePerPaidUser - snapshot.avgCostPerPaidUser,
        },
        grossMargin: snapshot.grossMargin,
        contributionMargin: snapshot.contributionMargin,
        mrr: snapshot.monthlyRecurringRevenue,
        projectedMonthCost: snapshot.projectedMonthCost,
        runwayMonths: snapshot.runwayMonths,
        // New fields from enhanced FinOps
        ltvCac: snapshot.ltvCac,
        detailedUnitEconomics: snapshot.unitEconomics,
        freeTierCostPercent: snapshot.freeTierCostPercent,
        isHealthy:
          snapshot.grossMargin > 0.2 &&
          snapshot.alerts.filter((a) => a.severity === 'critical').length === 0,
        alertCount: snapshot.alerts.length,
        criticalAlerts: snapshot.alerts.filter((a) => a.severity === 'critical').length,
      };

      if (snapshot.avgCostPerConversation > 0 && snapshot.avgRevenuePerPaidUser > 0) {
        unitEconomics.freeTier.sessionsBeforeBreakeven = Math.floor(
          snapshot.avgRevenuePerPaidUser / snapshot.avgCostPerConversation
        );
      }

      sendJSON(res, unitEconomics);
      return true;
    }

    // ============== NEW LTV:CAC ENDPOINTS ==============

    // GET /api/finops/ltv-cac
    if (pathname === '/api/finops/ltv-cac' && req.method === 'GET') {
      const snapshot = finops.getSnapshot();
      sendJSON(res, {
        metrics: snapshot.ltvCac,
        inputs: finops.getLTVCACInputs(),
      });
      return true;
    }

    // PUT /api/finops/ltv-cac
    if (pathname === '/api/finops/ltv-cac' && req.method === 'PUT') {
      const body = await parseBody(req);
      const result = LtvCacConfigSchema.safeParse(body);
      if (!result.success) {
        sendJSON(res, { error: result.error.errors[0]?.message || 'Invalid LTV/CAC config' }, 400);
        return true;
      }
      const { cac, lifetimeMonths, churnRate } = result.data;

      if (cac !== undefined) finops.setCAC(cac);
      if (lifetimeMonths !== undefined) finops.setCustomerLifetime(lifetimeMonths);
      if (churnRate !== undefined) finops.setChurnRate(churnRate);

      sendJSON(res, {
        success: true,
        inputs: finops.getLTVCACInputs(),
      });
      return true;
    }

    // GET /api/finops/power-users
    if (pathname === '/api/finops/power-users' && req.method === 'GET') {
      const snapshot = finops.getSnapshot();

      // Categorize power users
      const whales = snapshot.powerUsers.filter(
        (u) => u.tier === 'free' && u.costEquivalentTier === 'whale'
      );
      const conversionTargets = snapshot.powerUsers.filter(
        (u) => u.tier === 'free' && u.costEquivalentTier !== 'whale'
      );
      const unprofitablePaid = snapshot.powerUsers.filter((u) => u.isUnprofitable);

      sendJSON(res, {
        total: snapshot.powerUsers.length,
        summary: {
          whales: whales.length,
          conversionTargets: conversionTargets.length,
          unprofitablePaid: unprofitablePaid.length,
        },
        categories: {
          // Free users costing > $40/mo (2x Partner tier)
          whales: whales.map((u) => ({
            userId: u.userId,
            sessions: u.monthSessions,
            cost: u.monthCost.toFixed(2),
            avgCostPerSession: u.avgCostPerSession.toFixed(4),
          })),
          // Free users worth converting (high engagement, manageable cost)
          conversionTargets: conversionTargets.map((u) => ({
            userId: u.userId,
            sessions: u.monthSessions,
            cost: u.monthCost.toFixed(2),
            costEquivalent: u.costEquivalentTier,
          })),
          // Paid users who cost more than they pay
          unprofitablePaid: unprofitablePaid.map((u) => ({
            userId: u.userId,
            tier: u.tier,
            sessions: u.monthSessions,
            cost: u.monthCost.toFixed(2),
            deficit: (u.monthCost - (u.tier === 'friend' ? 10 : 20)).toFixed(2),
          })),
        },
        // Top 10 by cost (for quick view)
        topByCost: snapshot.powerUsers.slice(0, 10).map((u) => ({
          userId: u.userId,
          tier: u.tier,
          sessions: u.monthSessions,
          cost: u.monthCost.toFixed(2),
        })),
      });
      return true;
    }

    // GET /api/finops/health
    if (pathname === '/api/finops/health' && req.method === 'GET') {
      const snapshot = finops.getSnapshot();

      // Determine overall health
      const criticalAlerts = snapshot.alerts.filter((a) => a.severity === 'critical');
      const warningAlerts = snapshot.alerts.filter((a) => a.severity === 'warning');

      let status: 'healthy' | 'warning' | 'critical' = 'healthy';
      if (criticalAlerts.length > 0) status = 'critical';
      else if (warningAlerts.length > 0) status = 'warning';

      sendJSON(res, {
        status,
        metrics: {
          grossMargin: `${(snapshot.grossMargin * 100).toFixed(1)}%`,
          ltvCacRatio: snapshot.ltvCac.ltvCACRatio.toFixed(2),
          runwayMonths: snapshot.runwayMonths?.toFixed(1) || 'N/A',
          freeTierCostPercent: `${(snapshot.freeTierCostPercent * 100).toFixed(0)}%`,
          burnRatePerHour: `$${snapshot.currentBurnRatePerHour.toFixed(2)}`,
          projectedMonthCost: `$${snapshot.projectedMonthCost.toFixed(0)}`,
        },
        alerts: {
          critical: criticalAlerts.length,
          warning: warningAlerts.length,
          info: snapshot.alerts.filter((a) => a.severity === 'info').length,
        },
        details: snapshot.alerts,
        recommendations: generateRecommendations(snapshot),
      });
      return true;
    }

    // POST /api/finops/sync-mrr - Trigger MRR sync from Stripe
    if (pathname === '/api/finops/sync-mrr' && req.method === 'POST') {
      try {
        const { syncMRRToFinOps } = await import('../services/stripe-subscription.js');
        const result = await syncMRRToFinOps();
        sendJSON(res, {
          success: true,
          ...result,
          message: `Synced MRR from ${result.subscriptionCount} subscriptions`,
        });
      } catch (err) {
        sendJSON(
          res,
          {
            success: false,
            error: String(err),
            message: 'Failed to sync MRR - check Stripe configuration',
          },
          500
        );
      }
      return true;
    }

    // Not found
    return false;
  } catch (error) {
    log.error({ error, pathname }, 'FinOps route error');
    sendJSON(res, { error: 'Internal server error' }, 500);
    return true;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

interface FinOpsSnapshotLike {
  grossMargin: number;
  freeTierCostPercent: number;
  ltvCac: { ltvCACRatio: number; paybackMonths: number };
  powerUsers: Array<{ tier: string; costEquivalentTier: string; isUnprofitable: boolean }>;
  runwayMonths: number | null;
}

/**
 * Generate actionable recommendations based on FinOps data.
 */
function generateRecommendations(snapshot: FinOpsSnapshotLike): string[] {
  const recommendations: string[] = [];

  // Margin-based recommendations
  if (snapshot.grossMargin < 0) {
    recommendations.push(
      '[CRITICAL] Negative margin. Consider reducing free tier benefits or increasing prices.'
    );
  } else if (snapshot.grossMargin < 0.2) {
    recommendations.push(
      '[WARNING] Low margin (<20%). Focus on conversion or reduce per-session costs.'
    );
  } else if (snapshot.grossMargin > 0.6) {
    recommendations.push(
      '[HEALTHY] Strong margin (>60%). Consider investing in growth or improving free tier.'
    );
  }

  // LTV:CAC recommendations
  if (snapshot.ltvCac.ltvCACRatio > 0 && snapshot.ltvCac.ltvCACRatio < 1.5) {
    recommendations.push(
      '[WARNING] LTV:CAC < 1.5. Consider reducing acquisition spend or improving retention.'
    );
  } else if (snapshot.ltvCac.ltvCACRatio > 5) {
    recommendations.push(
      '[OPPORTUNITY] High LTV:CAC (>5). Room to increase acquisition spend for faster growth.'
    );
  }

  // Payback period
  if (snapshot.ltvCac.paybackMonths > 12) {
    recommendations.push(
      '[ATTENTION] Long payback period (>12mo). Improve early retention or increase initial engagement.'
    );
  }

  // Free tier cost
  if (snapshot.freeTierCostPercent > 0.7) {
    recommendations.push(
      '[COST ALERT] Free tier consuming >70% of costs. Activate soft caps or target high-value users for conversion.'
    );
  }

  // Power user insights
  const whales = snapshot.powerUsers.filter(
    (u) => u.tier === 'free' && u.costEquivalentTier === 'whale'
  );
  if (whales.length > 0) {
    recommendations.push(
      `[HIGH VALUE] ${whales.length} high-cost free user(s) detected (cost > $40/mo). Prioritize for conversion outreach.`
    );
  }

  const unprofitablePaid = snapshot.powerUsers.filter((u) => u.isUnprofitable);
  if (unprofitablePaid.length > 5) {
    recommendations.push(
      `[MARGIN] ${unprofitablePaid.length} paid users are unprofitable. Consider usage-based pricing for heavy users.`
    );
  }

  // Runway
  if (snapshot.runwayMonths !== null && snapshot.runwayMonths < 6) {
    recommendations.push(
      `[RUNWAY] Less than 6 months remaining. Prioritize revenue growth or cost reduction.`
    );
  }

  // Default if healthy
  if (recommendations.length === 0) {
    recommendations.push('[HEALTHY] FinOps metrics look healthy. Continue monitoring.');
  }

  return recommendations;
}

export default handleFinOpsRoutes;
