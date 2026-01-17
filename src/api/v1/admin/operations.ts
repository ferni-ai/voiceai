/**
 * Admin Operations API Routes (v1)
 *
 * Infrastructure monitoring data from GCP and direct health checks.
 * Provides unified ops view for the admin dashboard.
 *
 * Routes:
 * - GET  /api/v1/admin/operations/services  - Cloud Run service status
 * - GET  /api/v1/admin/operations/metrics   - GCP metrics (latency, errors)
 * - GET  /api/v1/admin/operations/budget    - Budget usage status
 * - GET  /api/v1/admin/operations           - All operations data
 *
 * @module AdminOperationsAPI
 */

import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../../../utils/safe-logger.js';
import { rateLimit, requireAuth } from '../../auth-middleware.js';
import { handleCorsPreflightIfNeeded, sendError, sendJSON } from '../../helpers.js';

const log = createLogger({ module: 'AdminOperationsAPI' });

// Safe async execFile (no shell injection risk)
const execFileAsync = promisify(execFile);

// GCP Configuration
const GCP_PROJECT = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';

// Base path for these routes
const BASE_PATH = '/api/v1/admin/operations';

// Service URLs (same as health-check.ts)
const SERVICES = [
  {
    id: 'voice-agent',
    name: 'Voice Agent',
    url: 'https://voiceai-agent-1031920444452.us-central1.run.app/health',
    critical: true,
  },
  {
    id: 'ui-server',
    name: 'UI Server',
    url: 'https://john-bogle-ui-1031920444452.us-central1.run.app/health',
    critical: true,
  },
  {
    id: 'app',
    name: 'App (Firebase)',
    url: 'https://app.ferni.ai',
    critical: true,
  },
  {
    id: 'landing',
    name: 'Landing Page',
    url: 'https://ferni.ai',
    critical: false,
  },
];

// Cache for expensive operations (5 minute TTL)
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache: {
  services?: CacheEntry<ServiceStatus[]>;
  metrics?: CacheEntry<OperationsMetrics>;
  budget?: CacheEntry<BudgetStatus>;
  billingAccount?: CacheEntry<string | null>;
} = {};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// TYPES
// ============================================================================

interface ServiceStatus {
  id: string;
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  statusCode?: number;
  responseTime: number;
  critical: boolean;
  lastChecked: string;
}

interface OperationsMetrics {
  latency: {
    voiceAgent: { p50: number; p95: number; p99: number };
    uiServer: { p50: number; p95: number; p99: number };
  };
  errorRate: {
    voiceAgent: number;
    uiServer: number;
  };
  requestCount: {
    voiceAgent: number;
    uiServer: number;
  };
  instances: {
    voiceAgent: number;
    uiServer: number;
  };
}

interface BudgetStatus {
  name: string;
  limit: number;
  spent: number;
  percentage: number;
  currency: string;
  period: string;
  alertThresholds: number[];
  /** Whether spend is estimated (true) or from actual billing data (false) */
  estimated: boolean;
  /** Data source: 'billing-api' | 'estimated' | 'fallback' */
  source: 'billing-api' | 'estimated' | 'fallback';
}

interface OperationsData {
  services: ServiceStatus[];
  metrics: OperationsMetrics;
  budget: BudgetStatus;
  links: {
    dashboard: string;
    uptime: string;
    alerts: string;
    logs: string;
    budget: string;
  };
  lastUpdated: string;
}

// ============================================================================
// ROUTE HANDLER
// ============================================================================

/**
 * Handle all operations admin routes
 * @returns true if the request was handled
 */
export async function handleAdminOperationsRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  _parsedUrl: URL
): Promise<boolean> {
  const method = req.method || 'GET';

  // Handle CORS preflight
  if (handleCorsPreflightIfNeeded(req, res)) {
    return true;
  }

  // Only handle /api/v1/admin/operations routes
  if (!pathname.startsWith(BASE_PATH)) {
    return false;
  }

  // Rate limiting (lower limit since these can be expensive)
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60000 })) {
    return true;
  }

  // All operations routes require auth (allow dev mode)
  const auth = requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  // Get the path after the base path
  const subPath = pathname.slice(BASE_PATH.length) || '/';

  try {
    // ========================================================================
    // ALL OPERATIONS DATA
    // ========================================================================
    if ((subPath === '/' || subPath === '') && method === 'GET') {
      const data = await getAllOperationsData();
      sendJSON(res, data);
      return true;
    }

    // ========================================================================
    // SERVICE STATUS
    // ========================================================================
    if (subPath === '/services' && method === 'GET') {
      const services = await checkAllServices();
      sendJSON(res, { services, lastChecked: new Date().toISOString() });
      return true;
    }

    // ========================================================================
    // METRICS
    // ========================================================================
    if (subPath === '/metrics' && method === 'GET') {
      const metrics = await getMetrics();
      sendJSON(res, metrics);
      return true;
    }

    // ========================================================================
    // BUDGET STATUS
    // ========================================================================
    if (subPath === '/budget' && method === 'GET') {
      const budget = await getBudgetStatus();
      sendJSON(res, budget);
      return true;
    }

    // Route not matched
    return false;
  } catch (error) {
    log.error({ error, pathname, method }, 'Admin operations API error');
    sendError(res, 'Internal server error');
    return true;
  }
}

// ============================================================================
// DATA FETCHING
// ============================================================================

async function getAllOperationsData(): Promise<OperationsData> {
  const [services, metrics, budget] = await Promise.all([
    checkAllServices(),
    getMetrics(),
    getBudgetStatus(),
  ]);

  return {
    services,
    metrics,
    budget,
    links: {
      dashboard: 'https://console.cloud.google.com/monitoring/dashboards?project=johnb-2025',
      uptime: 'https://console.cloud.google.com/monitoring/uptime?project=johnb-2025',
      alerts: 'https://console.cloud.google.com/monitoring/alerting?project=johnb-2025',
      logs: 'https://console.cloud.google.com/run?project=johnb-2025',
      budget: 'https://console.cloud.google.com/billing/budgets?project=johnb-2025',
    },
    lastUpdated: new Date().toISOString(),
  };
}

async function checkAllServices(): Promise<ServiceStatus[]> {
  // Check cache first
  if (cache.services && Date.now() - cache.services.timestamp < CACHE_TTL) {
    return cache.services.data;
  }

  const results = await Promise.all(
    SERVICES.map(async (service) => {
      const start = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(service.url, {
          method: 'GET',
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const responseTime = Date.now() - start;

        return {
          id: service.id,
          name: service.name,
          status: response.ok ? 'healthy' : 'degraded',
          statusCode: response.status,
          responseTime,
          critical: service.critical,
          lastChecked: new Date().toISOString(),
        } as ServiceStatus;
      } catch (error) {
        return {
          id: service.id,
          name: service.name,
          status: 'down',
          responseTime: Date.now() - start,
          critical: service.critical,
          lastChecked: new Date().toISOString(),
        } as ServiceStatus;
      }
    })
  );

  // Update cache
  cache.services = { data: results, timestamp: Date.now() };

  return results;
}

async function getMetrics(): Promise<OperationsMetrics> {
  // Check cache first
  if (cache.metrics && Date.now() - cache.metrics.timestamp < CACHE_TTL) {
    return cache.metrics.data;
  }

  // For now, return estimates based on health check response times
  // In production, this would fetch from GCP Monitoring API
  const services = await checkAllServices();

  const voiceAgent = services.find((s) => s.id === 'voice-agent');
  const uiServer = services.find((s) => s.id === 'ui-server');

  const metrics: OperationsMetrics = {
    latency: {
      voiceAgent: {
        p50: voiceAgent?.responseTime || 0,
        p95: (voiceAgent?.responseTime || 0) * 1.5,
        p99: (voiceAgent?.responseTime || 0) * 2,
      },
      uiServer: {
        p50: uiServer?.responseTime || 0,
        p95: (uiServer?.responseTime || 0) * 1.5,
        p99: (uiServer?.responseTime || 0) * 2,
      },
    },
    errorRate: {
      voiceAgent: voiceAgent?.status === 'healthy' ? 0.01 : 0.1,
      uiServer: uiServer?.status === 'healthy' ? 0.005 : 0.1,
    },
    requestCount: {
      voiceAgent: 0, // Would come from GCP metrics
      uiServer: 0,
    },
    instances: {
      voiceAgent: 1, // Would come from Cloud Run API
      uiServer: 1,
    },
  };

  // Update cache
  cache.metrics = { data: metrics, timestamp: Date.now() };

  return metrics;
}

/**
 * Get billing account ID from GCP using gcloud CLI
 * Cached for 5 minutes since this rarely changes
 */
async function getBillingAccount(): Promise<string | null> {
  // Check cache
  if (cache.billingAccount && Date.now() - cache.billingAccount.timestamp < CACHE_TTL) {
    return cache.billingAccount.data;
  }

  try {
    // Use gcloud CLI to get billing account for the project (safe: no shell interpolation)
    const { stdout } = await execFileAsync('gcloud', [
      'billing',
      'projects',
      'describe',
      GCP_PROJECT,
      '--format=value(billingAccountName)',
    ]);

    // Extract billing account ID (format: billingAccounts/XXXXXX-XXXXXX-XXXXXX)
    const billingAccount = stdout.trim().replace('billingAccounts/', '');

    // Update cache
    cache.billingAccount = { data: billingAccount || null, timestamp: Date.now() };
    return billingAccount || null;
  } catch (error) {
    log.debug(
      { error: String(error) },
      'Could not get billing account (gcloud may not be available)'
    );
    cache.billingAccount = { data: null, timestamp: Date.now() };
    return null;
  }
}

/**
 * Estimate current month spend based on service usage
 * Uses pricing estimates similar to costs-ai.ts
 */
function estimateCurrentMonthSpend(): number {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const monthProgress = dayOfMonth / daysInMonth;

  // Base monthly estimates (conservative, based on typical Ferni usage)
  const monthlyEstimates = {
    // Cloud Run: ~$15-25/month for voice agent + UI server
    cloudRun: 20,
    // Firestore: ~$5-10/month for reads/writes/storage
    firestore: 7,
    // External APIs (Gemini, Cartesia, LiveKit): ~$10-20/month
    externalApis: 15,
    // Storage, networking, misc: ~$3-5/month
    misc: 4,
  };

  const totalMonthly = Object.values(monthlyEstimates).reduce((a, b) => a + b, 0);

  // Pro-rate based on current day of month
  return Math.round(totalMonthly * monthProgress * 100) / 100;
}

/**
 * Try to get budget info from GCP Billing Budget API
 */
async function queryGCPBudget(billingAccount: string): Promise<{
  name: string;
  limit: number;
  thresholds: number[];
} | null> {
  try {
    // Query budgets using gcloud CLI (safe: args passed as array)
    const { stdout } = await execFileAsync('gcloud', [
      'billing',
      'budgets',
      'list',
      `--billing-account=${billingAccount}`,
      '--format=json',
    ]);

    const budgets = JSON.parse(stdout);
    if (!budgets || budgets.length === 0) {
      return null;
    }

    // Find the first budget matching our project or main monthly budget
    const budget =
      budgets.find(
        (b: { displayName?: string; budgetFilter?: { projects?: string[] } }) =>
          b.displayName?.toLowerCase().includes('ferni') ||
          b.displayName?.toLowerCase().includes('monthly') ||
          b.budgetFilter?.projects?.some((p: string) => p.includes(GCP_PROJECT))
      ) || budgets[0];

    // Extract budget amount
    const budgetAmount = budget.amount?.specifiedAmount?.units
      ? parseFloat(budget.amount.specifiedAmount.units)
      : budget.amount?.lastPeriodAmount
        ? 0 // Last period amount - unknown exact limit
        : 50; // Default fallback

    // Extract threshold rules
    const thresholds = (budget.thresholdRules || [])
      .map((rule: { thresholdPercent?: number }) => (rule.thresholdPercent || 0) * 100)
      .sort((a: number, b: number) => a - b);

    return {
      name: budget.displayName || 'GCP Budget',
      limit: budgetAmount,
      thresholds: thresholds.length > 0 ? thresholds : [50, 80, 100],
    };
  } catch (error) {
    log.debug({ error: String(error) }, 'Could not query GCP budgets');
    return null;
  }
}

/**
 * Get budget status with actual GCP data when available
 * Falls back to estimates if gcloud CLI isn't available
 */
async function getBudgetStatus(): Promise<BudgetStatus> {
  // Check cache first
  if (cache.budget && Date.now() - cache.budget.timestamp < CACHE_TTL) {
    return cache.budget.data;
  }

  // Default budget configuration
  const defaultBudget = {
    name: 'Ferni Monthly Budget',
    limit: 50,
    alertThresholds: [50, 80, 100],
  };

  // Try to get billing account
  const billingAccount = await getBillingAccount();

  let budgetInfo = defaultBudget;
  let source: 'billing-api' | 'estimated' | 'fallback' = 'fallback';

  if (billingAccount) {
    // Try to get actual budget from GCP
    const gcpBudget = await queryGCPBudget(billingAccount);
    if (gcpBudget) {
      budgetInfo = {
        name: gcpBudget.name,
        limit: gcpBudget.limit || defaultBudget.limit,
        alertThresholds: gcpBudget.thresholds,
      };
      source = 'billing-api';
    } else {
      source = 'estimated';
    }
  }

  // Estimate current spend (real-time billing data requires BigQuery export)
  const spent = estimateCurrentMonthSpend();
  const percentage = budgetInfo.limit > 0 ? Math.round((spent / budgetInfo.limit) * 100) : 0;

  const result: BudgetStatus = {
    name: budgetInfo.name,
    limit: budgetInfo.limit,
    spent,
    percentage,
    currency: 'USD',
    period: 'monthly',
    alertThresholds: budgetInfo.alertThresholds,
    estimated: true, // Spend is always estimated without BigQuery export
    source,
  };

  // Update cache
  cache.budget = { data: result, timestamp: Date.now() };

  log.debug(
    { source, spent, limit: budgetInfo.limit, hasBillingAccount: !!billingAccount },
    'Budget status retrieved'
  );

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { handleAdminOperationsRoutes };
