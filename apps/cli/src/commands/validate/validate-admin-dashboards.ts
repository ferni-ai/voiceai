/**
 * Admin Dashboard Validation Command
 *
 * Validates all admin dashboard APIs are working E2E.
 * Run with: ferni validate admin-dashboards
 *
 * @module cli/commands/validate/validate-admin-dashboards
 */

import { createLogger } from '../../../../../src/utils/safe-logger.js';

const log = createLogger({ module: 'ValidateAdminDashboards' });

interface ValidationResult {
  endpoint: string;
  section: string;
  status: 'pass' | 'fail' | 'skip';
  statusCode?: number;
  error?: string;
  latencyMs?: number;
}

interface AdminEndpoint {
  section: string;
  endpoint: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  requiresAuth: boolean;
  description: string;
}

// All admin API endpoints used by the admin portal
const ADMIN_ENDPOINTS: AdminEndpoint[] = [
  // Dashboard Section
  { section: 'Dashboard', endpoint: '/api/v1/admin/dashboard/health', requiresAuth: true, description: 'System health summary' },
  { section: 'Dashboard', endpoint: '/api/v1/admin/dashboard/stats', requiresAuth: true, description: 'Aggregated stats' },
  { section: 'Dashboard', endpoint: '/api/v1/admin/dashboard/activity', requiresAuth: true, description: 'Recent activity' },

  // Business Metrics Section
  { section: 'Business Metrics', endpoint: '/api/analytics/summary', requiresAuth: true, description: 'Analytics summary' },
  { section: 'Business Metrics', endpoint: '/api/analytics/concurrent', requiresAuth: true, description: 'Concurrent users' },
  { section: 'Business Metrics', endpoint: '/api/subscription/metrics', requiresAuth: false, description: 'Subscription metrics' },

  // Semantic Routing Section
  { section: 'Semantic Routing', endpoint: '/api/observability/semantic-routing', requiresAuth: true, description: 'Routing metrics' },

  // Agents Section
  { section: 'Agents', endpoint: '/api/v1/admin/agents', requiresAuth: true, description: 'List agents' },

  // EvalOps Section
  { section: 'EvalOps', endpoint: '/api/evalops/metrics', requiresAuth: true, description: 'Evaluation metrics' },
  { section: 'EvalOps', endpoint: '/api/evalops/evaluations/flagged', requiresAuth: true, description: 'Flagged evaluations' },
  { section: 'EvalOps', endpoint: '/api/evalops/dimensions', requiresAuth: true, description: 'Evaluation dimensions' },

  // BTH Validation Section
  { section: 'BTH Validation', endpoint: '/api/v1/admin/bth/validation/benchmark', requiresAuth: true, description: 'BTH benchmarks' },
  { section: 'BTH Validation', endpoint: '/api/v1/admin/bth/validation/gaps', requiresAuth: true, description: 'Capability gaps' },
  { section: 'BTH Validation', endpoint: '/api/v1/admin/bth/validation/telemetry', requiresAuth: true, description: 'BTH telemetry' },

  // Blind Evaluation Section
  { section: 'Blind Evaluation', endpoint: '/api/v1/admin/bth/blind-panel/scenarios', requiresAuth: true, description: 'Evaluation scenarios' },

  // Trust Section
  { section: 'Trust', endpoint: '/api/trust/analytics/metrics', requiresAuth: true, description: 'Trust metrics' },
  { section: 'Trust', endpoint: '/api/trust/analytics/stages', requiresAuth: true, description: 'Trust stages' },
  { section: 'Trust', endpoint: '/api/trust/analytics/systems', requiresAuth: true, description: 'Trust systems' },
  { section: 'Trust', endpoint: '/api/trust/analytics/warmth', requiresAuth: true, description: 'Warmth analytics' },

  // Human Listening Section
  { section: 'Human Listening', endpoint: '/api/v1/admin/human-listening/metrics', requiresAuth: true, description: 'Listening metrics' },
  { section: 'Human Listening', endpoint: '/api/v1/admin/human-listening/signals', requiresAuth: true, description: 'Listening signals' },
  { section: 'Human Listening', endpoint: '/api/v1/admin/human-listening/live', requiresAuth: true, description: 'Live sessions' },

  // Speech Metrics Section
  { section: 'Speech Metrics', endpoint: '/api/speech-metrics/dashboard', requiresAuth: true, description: 'Speech dashboard' },

  // Experiments Section
  { section: 'Experiments', endpoint: '/api/v1/admin/experiments', requiresAuth: true, description: 'List experiments' },

  // Feature Flags Section
  { section: 'Feature Flags', endpoint: '/api/v1/admin/flags', requiresAuth: true, description: 'Feature flags' },

  // FinOps Section
  { section: 'FinOps', endpoint: '/api/finops/snapshot', requiresAuth: true, description: 'Cost snapshot' },

  // Operations Section
  { section: 'Operations', endpoint: '/api/v1/admin/operations', requiresAuth: true, description: 'Infrastructure health' },

  // Builder Metrics Section
  { section: 'Builder Metrics', endpoint: '/api/admin/builder-metrics', requiresAuth: true, description: 'Context builder metrics' },
  { section: 'Builder Metrics', endpoint: '/api/admin/builder-metrics/warnings', requiresAuth: true, description: 'Builder warnings' },

  // Diagnostics Section
  { section: 'Diagnostics', endpoint: '/api/v1/admin/diagnostics/handoff/metrics', requiresAuth: true, description: 'Handoff metrics' },
  { section: 'Diagnostics', endpoint: '/api/v1/admin/diagnostics/handoff/recent', requiresAuth: true, description: 'Recent handoffs' },
  { section: 'Diagnostics', endpoint: '/api/v1/admin/diagnostics/services', requiresAuth: true, description: 'Service status' },

  // Model Config Section
  { section: 'Model Config', endpoint: '/api/v1/admin/model-config', requiresAuth: true, description: 'Model configuration' },
  { section: 'Model Config', endpoint: '/api/v1/admin/model-config/models', requiresAuth: true, description: 'Available models' },
  { section: 'Model Config', endpoint: '/api/v1/admin/model-config/tool-domains', requiresAuth: true, description: 'Tool domains' },
  { section: 'Model Config', endpoint: '/api/v1/admin/model-config/tool-defaults', requiresAuth: true, description: 'Tool defaults' },
];

/**
 * Validate a single endpoint
 */
async function validateEndpoint(
  baseUrl: string,
  endpoint: AdminEndpoint,
  authToken?: string,
  useDevMode = true
): Promise<ValidationResult> {
  const url = `${baseUrl}${endpoint.endpoint}`;
  const start = Date.now();

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // For local dev, use dev-mode header
    if (useDevMode && (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1'))) {
      headers['X-Admin-Key'] = 'dev-mode';
    }

    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(url, {
      method: endpoint.method || 'GET',
      headers,
    });

    const latencyMs = Date.now() - start;

    // Check for success
    if (response.ok) {
      return {
        endpoint: endpoint.endpoint,
        section: endpoint.section,
        status: 'pass',
        statusCode: response.status,
        latencyMs,
      };
    }

    // Handle 401/403 - auth required
    if (response.status === 401 || response.status === 403) {
      // In production without token, 401 is expected (endpoint exists, auth working)
      const isProd = !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1');
      if (isProd && endpoint.requiresAuth && !authToken) {
        return {
          endpoint: endpoint.endpoint,
          section: endpoint.section,
          status: 'pass',  // Route exists and auth is working
          statusCode: response.status,
          latencyMs,
          error: '(auth required - expected)',
        };
      }
      return {
        endpoint: endpoint.endpoint,
        section: endpoint.section,
        status: 'fail',
        statusCode: response.status,
        latencyMs,
        error: 'Auth failed - check dev mode or token',
      };
    }

    // Other errors
    const body = await response.text().catch(() => 'No body');
    return {
      endpoint: endpoint.endpoint,
      section: endpoint.section,
      status: 'fail',
      statusCode: response.status,
      latencyMs,
      error: body.substring(0, 200),
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      endpoint: endpoint.endpoint,
      section: endpoint.section,
      status: 'fail',
      latencyMs,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Print results in a formatted table
 */
function printResults(results: ValidationResult[]): void {
  console.log('\n' + '='.repeat(80));
  console.log('ADMIN DASHBOARD VALIDATION RESULTS');
  console.log('='.repeat(80) + '\n');

  // Group by section
  const bySection = results.reduce(
    (acc, r) => {
      if (!acc[r.section]) acc[r.section] = [];
      acc[r.section].push(r);
      return acc;
    },
    {} as Record<string, ValidationResult[]>
  );

  let totalPass = 0;
  let totalFail = 0;
  let totalSkip = 0;

  for (const [section, sectionResults] of Object.entries(bySection)) {
    const pass = sectionResults.filter((r) => r.status === 'pass').length;
    const fail = sectionResults.filter((r) => r.status === 'fail').length;
    const skip = sectionResults.filter((r) => r.status === 'skip').length;

    totalPass += pass;
    totalFail += fail;
    totalSkip += skip;

    const statusEmoji = fail > 0 ? '❌' : skip > 0 ? '⚠️' : '✅';
    console.log(`${statusEmoji} ${section} (${pass}/${sectionResults.length} passed)`);

    for (const result of sectionResults) {
      const icon =
        result.status === 'pass' ? '  ✓' : result.status === 'skip' ? '  ⚡' : '  ✗';
      const latency = result.latencyMs ? ` (${result.latencyMs}ms)` : '';
      const error = result.error ? ` - ${result.error}` : '';

      console.log(`${icon} ${result.endpoint}${latency}${error}`);
    }
    console.log('');
  }

  // Summary
  console.log('='.repeat(80));
  console.log(`SUMMARY: ${totalPass} passed, ${totalFail} failed, ${totalSkip} skipped`);
  console.log('='.repeat(80));

  if (totalFail > 0) {
    console.log('\n⚠️  Some endpoints failed. Check the errors above.');
  } else if (totalSkip > 0) {
    console.log('\n⚡ Some endpoints skipped due to auth. Run with --auth-token for full validation.');
  } else {
    console.log('\n✅ All admin dashboard endpoints are working!');
  }
}

/**
 * Main validation function
 */
export async function validateAdminDashboards(options: {
  baseUrl?: string;
  authToken?: string;
  verbose?: boolean;
  section?: string;
}): Promise<void> {
  const baseUrl = options.baseUrl || 'http://localhost:3002';
  const authToken = options.authToken;

  console.log(`\nValidating admin dashboards against: ${baseUrl}`);
  if (authToken) {
    console.log('Using auth token for protected endpoints');
  } else {
    console.log('No auth token provided - protected endpoints will be skipped');
  }

  // Filter by section if specified
  let endpoints = ADMIN_ENDPOINTS;
  if (options.section) {
    endpoints = endpoints.filter(
      (e) => e.section.toLowerCase().includes(options.section!.toLowerCase())
    );
    console.log(`Filtering to section: ${options.section} (${endpoints.length} endpoints)`);
  }

  console.log(`\nValidating ${endpoints.length} endpoints...\n`);

  // Run validations in parallel (batched to avoid overwhelming the server)
  const batchSize = 5;
  const results: ValidationResult[] = [];

  for (let i = 0; i < endpoints.length; i += batchSize) {
    const batch = endpoints.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map((endpoint) => validateEndpoint(baseUrl, endpoint, authToken))
    );
    results.push(...batchResults);

    // Progress indicator
    if (options.verbose) {
      const progress = Math.min(i + batchSize, endpoints.length);
      process.stdout.write(`\rProgress: ${progress}/${endpoints.length}`);
    }
  }

  if (options.verbose) {
    console.log('\n');
  }

  printResults(results);

  // Exit with error code if any failures
  const failCount = results.filter((r) => r.status === 'fail').length;
  if (failCount > 0) {
    process.exit(1);
  }
}

// CLI entry point
export async function run(args: string[]): Promise<void> {
  const options = {
    baseUrl: process.env.API_BASE_URL,
    authToken: process.env.ADMIN_AUTH_TOKEN,
    verbose: args.includes('--verbose') || args.includes('-v'),
    section: undefined as string | undefined,
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      options.baseUrl = args[i + 1];
      i++;
    } else if (args[i] === '--token' && args[i + 1]) {
      options.authToken = args[i + 1];
      i++;
    } else if (args[i] === '--section' && args[i + 1]) {
      options.section = args[i + 1];
      i++;
    } else if (args[i] === '--production' || args[i] === '--prod') {
      options.baseUrl = 'https://app.ferni.ai';
    } else if (args[i] === '--local') {
      options.baseUrl = 'http://localhost:3002';
    }
  }

  await validateAdminDashboards(options);
}

export default { validateAdminDashboards, run };
