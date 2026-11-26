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

import { execFile } from 'child_process';
import type { IncomingMessage, ServerResponse } from 'http';
import type { URL } from 'url';
import { promisify } from 'util';
import {
  APP_URL,
  LANDING_URL,
  UI_SERVER_HEALTH_URL,
  VOICE_AGENT_HEALTH_URL,
} from '../../../config/api-urls.js';
import {
  readCloudRunMetrics,
  unmeasuredService,
  type ServiceMetrics,
} from '../../../services/observability/index.js';
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

/** The UI server's Cloud Run service, whose request metrics Cloud Monitoring holds */
const UI_SERVICE = 'john-bogle-ui';
const VOICE_AGENT_UNMEASURED = 'not measured: the voice agent runs on LiveKit Cloud';

const SERVICES = [
  // No health URL unless one is set: the old Cloud Run default answers 404 (LiveKit Cloud now)
  { id: 'voice-agent', name: 'Voice Agent', url: VOICE_AGENT_HEALTH_URL, critical: true },
  { id: 'ui-server', name: 'UI Server', url: UI_SERVER_HEALTH_URL, critical: true },
  { id: 'app', name: 'App (Firebase)', url: APP_URL, critical: true },
  { id: 'landing', name: 'Landing Page', url: LANDING_URL, critical: false },
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
  /** not-measured: no health URL is set for it (`reason` says why) */
  status: 'healthy' | 'degraded' | 'down' | 'not-measured';
  statusCode?: number;
  /** The health check's own round trip, in ms; null when not checked */
  responseTime: number | null;
  reason?: string;
  critical: boolean;
  lastChecked: string;
}

interface OperationsMetrics {
  windowMinutes: number;
  uiServer: ServiceMetrics;
  voiceAgent: ServiceMetrics;
}

interface BudgetStatus {
  /** null when no GCP budget was found: never a made-up budget (#4069) */
  name: string | null;
  limit: number | null;
  /** null: real spend needs the BigQuery billing export, which isn't read yet (#4069) */
  spent: number | null;
  percentage: number | null;
  currency: string;
  period: string;
  alertThresholds: number[];
  /** Where the budget came from: the billing API, a billing account with no budget, or nothing */
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
  parsedUrl: URL
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
  if (rateLimit(req, res, { maxRequests: 30, windowMs: 60000, keyPrefix: 'admin-operations' })) {
    return true;
  }

  // All operations routes require auth (allow dev mode)
  const auth = await requireAuth(req, res, { allowDevMode: true });
  if (!auth) return true;

  // Get the path after the base path; ?fresh=1 (the section's Refresh) skips the 5-minute cache
  const subPath = pathname.slice(BASE_PATH.length) || '/';
  const fresh = parsedUrl.searchParams.get('fresh') === '1';

  try {
    // ========================================================================
    // ALL OPERATIONS DATA
    // ========================================================================
    if ((subPath === '/' || subPath === '') && method === 'GET') {
      const data = await getAllOperationsData(fresh);
      sendJSON(res, data);
      return true;
    }

    // ========================================================================
    // SERVICE STATUS
    // ========================================================================
    if (subPath === '/services' && method === 'GET') {
      const services = await checkAllServices(fresh);
      sendJSON(res, { services, lastChecked: new Date().toISOString() });
      return true;
    }

    // ========================================================================
    // METRICS
    // ========================================================================
    if (subPath === '/metrics' && method === 'GET') {
      const metrics = await getMetrics(fresh);
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

async function getAllOperationsData(fresh: boolean): Promise<OperationsData> {
  const [services, metrics, budget] = await Promise.all([
    checkAllServices(fresh),
    getMetrics(fresh),
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
    // When these numbers were read, which can be up to the cache's age ago
    lastUpdated: new Date(cache.metrics?.timestamp ?? Date.now()).toISOString(),
  };
}

async function checkAllServices(fresh = false): Promise<ServiceStatus[]> {
  // Check cache first
  if (!fresh && cache.services && Date.now() - cache.services.timestamp < CACHE_TTL) {
    return cache.services.data;
  }

  const results = await Promise.all(
    SERVICES.map(async (service) => {
      if (!service.url) {
        const reason = `${VOICE_AGENT_UNMEASURED}; set VOICE_AGENT_HEALTH_URL to check it`;
        const { id, name, critical } = service;
        const lastChecked = new Date().toISOString();
        return {
          id,
          name,
          status: 'not-measured',
          responseTime: null,
          reason,
          critical,
          lastChecked,
        } as ServiceStatus;
      }
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

/** UI server request metrics from Cloud Monitoring; the voice agent's are not measured here. */
async function getMetrics(fresh = false): Promise<OperationsMetrics> {
  if (!fresh && cache.metrics && Date.now() - cache.metrics.timestamp < CACHE_TTL) {
    return cache.metrics.data;
  }
  const windowMinutes = 60;
  const metrics: OperationsMetrics = {
    windowMinutes,
    uiServer: await readCloudRunMetrics({
      projectId: GCP_PROJECT,
      service: UI_SERVICE,
      windowMinutes,
    }),
    voiceAgent: unmeasuredService(VOICE_AGENT_UNMEASURED),
  };
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
 * Try to get budget info from GCP Billing Budget API
 */
async function queryGCPBudget(billingAccount: string): Promise<{
  name: string;
  limit: number | null;
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

    // Extract budget amount (a last-period budget has no fixed limit to show)
    const budgetAmount = budget.amount?.specifiedAmount?.units
      ? parseFloat(budget.amount.specifiedAmount.units)
      : null;

    // Extract threshold rules
    const thresholds = (budget.thresholdRules || [])
      .map((rule: { thresholdPercent?: number }) => (rule.thresholdPercent || 0) * 100)
      .sort((a: number, b: number) => a - b);

    return {
      name: budget.displayName || 'GCP Budget',
      limit: budgetAmount,
      thresholds,
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

  // Try to get billing account, then its budget. No budget found means no limit to show.
  const billingAccount = await getBillingAccount();
  const gcpBudget = billingAccount ? await queryGCPBudget(billingAccount) : null;
  const source: BudgetStatus['source'] = gcpBudget
    ? 'billing-api'
    : billingAccount
      ? 'estimated'
      : 'fallback';
  const limit = gcpBudget?.limit ?? null;

  // Spend is not measured: real-time billing data needs the BigQuery export. It used to be
  // a fixed $46 a month scaled by the date, shown as if it were the bill.
  const spent = null;
  const percentage = null;

  const result: BudgetStatus = {
    name: gcpBudget?.name ?? null,
    limit,
    spent,
    percentage,
    currency: 'USD',
    period: 'monthly',
    alertThresholds: gcpBudget?.thresholds ?? [],
    source,
  };

  // Update cache
  cache.budget = { data: result, timestamp: Date.now() };

  log.debug(
    { source, spent, limit, hasBillingAccount: !!billingAccount },
    'Budget status retrieved'
  );

  return result;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default { handleAdminOperationsRoutes };
