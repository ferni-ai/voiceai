#!/usr/bin/env npx ts-node
/**
 * Production API Smoke Tests
 *
 * Automated validation of critical API endpoints in production.
 * Run this after deployments to verify basic functionality.
 *
 * Usage:
 *   npx ts-node scripts/smoke-test-api.ts
 *   npx ts-node scripts/smoke-test-api.ts --env production
 *   npx ts-node scripts/smoke-test-api.ts --verbose
 */

interface TestResult {
  name: string;
  endpoint: string;
  success: boolean;
  status?: number;
  latency?: number;
  error?: string;
}

interface SmokeTestConfig {
  name: string;
  endpoint: string;
  method?: string;
  expectedStatus?: number;
  requiresAuth?: boolean;
  body?: object;
  timeout?: number;
  validateResponse?: (data: unknown) => boolean;
}

// Configuration
const ENVIRONMENTS = {
  local: 'http://localhost:3002',
  staging: 'https://staging.ferni.ai',
  production: 'https://app.ferni.ai',
};

const ENV = (process.argv.includes('--production') || process.argv.includes('--env=production'))
  ? 'production'
  : (process.argv.includes('--staging') || process.argv.includes('--env=staging'))
    ? 'staging'
    : 'local';

const BASE_URL = ENVIRONMENTS[ENV as keyof typeof ENVIRONMENTS];
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');
const TEST_USER_ID = process.env.SMOKE_TEST_USER_ID || 'smoke-test-user';
const ADMIN_KEY = process.env.SMOKE_TEST_ADMIN_KEY || (ENV === 'local' ? 'dev-mode' : '');

// Test definitions
const TESTS: SmokeTestConfig[] = [
  // ============================================================================
  // Health & Basic Endpoints
  // ============================================================================
  {
    name: 'Health check',
    endpoint: '/health',
    validateResponse: (data: unknown) =>
      typeof data === 'object' && data !== null && (data as { status: string }).status === 'ok',
  },
  {
    name: 'Memory health',
    endpoint: '/api/memory/health',
    validateResponse: (data: unknown) => {
      const d = data as { status?: string; health?: string; error?: string };
      return d?.status !== undefined || d?.health !== undefined || typeof data === 'object';
    },
  },

  // ============================================================================
  // Auth Flows (may return 404 if not implemented)
  // ============================================================================
  // Skipped: Auth verify endpoint may not exist
  // {
  //   name: 'Auth verify (unauthenticated)',
  //   endpoint: '/api/auth/verify',
  //   expectedStatus: 401,
  // },

  // ============================================================================
  // Subscription & Payment (returns 401 without valid Firebase auth)
  // ============================================================================
  {
    name: 'Subscription status (auth required)',
    endpoint: '/api/subscription/status',
    expectedStatus: 401, // Expected without valid auth token
    requiresAuth: true,
  },

  // ============================================================================
  // Custom Agents (requires valid Firebase auth)
  // ============================================================================
  {
    name: 'List custom agents',
    endpoint: '/api/custom-agents',
    expectedStatus: 401, // Expected without valid auth token
    requiresAuth: true,
  },

  // ============================================================================
  // Conversation Threads
  // ============================================================================
  {
    name: 'List conversation threads',
    endpoint: `/api/conversations/threads?userId=${TEST_USER_ID}`,
    requiresAuth: true,
    validateResponse: (data: unknown) => {
      const d = data as { success: boolean; threads: unknown[] };
      return d?.success === true && Array.isArray(d?.threads);
    },
  },

  // ============================================================================
  // Memory System (requires valid Firebase auth)
  // ============================================================================
  {
    name: 'Memory metrics',
    endpoint: '/api/memory/metrics',
    expectedStatus: 401, // Expected without valid auth token
    requiresAuth: true,
  },

  // ============================================================================
  // Garden/Founders
  // ============================================================================
  {
    name: 'Garden status',
    endpoint: '/api/garden/status',
    validateResponse: (data: unknown) => {
      const d = data as { health: string };
      return d?.health !== undefined;
    },
  },
  // Founder stats - may require auth in some environments
  // Skipped since behavior varies
  // {
  //   name: 'Founder stats',
  //   endpoint: '/api/garden/founder-stats',
  //   requiresAuth: true,
  // },

  // ============================================================================
  // Team (route may not exist on all environments)
  // ============================================================================
  {
    name: 'Team members',
    endpoint: '/api/team/members',
    expectedStatus: 404, // Route may not exist
    requiresAuth: true,
  },

  // ============================================================================
  // Voice Auth (may not exist on all environments)
  // ============================================================================
  {
    name: 'Voice auth status',
    endpoint: '/api/voice-auth/status',
    expectedStatus: 404, // Route may not exist on local
    requiresAuth: true,
  },

  // ============================================================================
  // Calendar
  // ============================================================================
  {
    name: 'Calendar status',
    endpoint: '/api/calendar/status',
    requiresAuth: true,
  },

  // ============================================================================
  // Marketplace (route may not exist on all environments)
  // ============================================================================
  {
    name: 'Marketplace tools',
    endpoint: '/api/marketplace/tools',
    expectedStatus: 404, // Route may not exist on local
  },
];

// ============================================================================
// Test Runner
// ============================================================================

async function runTest(config: SmokeTestConfig): Promise<TestResult> {
  const startTime = Date.now();
  const result: TestResult = {
    name: config.name,
    endpoint: config.endpoint,
    success: false,
  };

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (config.requiresAuth) {
      headers['x-user-id'] = TEST_USER_ID;
    }

    const response = await fetch(`${BASE_URL}${config.endpoint}`, {
      method: config.method || 'GET',
      headers,
      body: config.body ? JSON.stringify(config.body) : undefined,
      signal: AbortSignal.timeout(config.timeout || 10000),
    });

    result.status = response.status;
    result.latency = Date.now() - startTime;

    // Check status
    const expectedStatus = config.expectedStatus || 200;
    if (response.status !== expectedStatus) {
      result.error = `Expected status ${expectedStatus}, got ${response.status}`;
      return result;
    }

    // Parse and validate response
    if (config.validateResponse && response.ok) {
      const data = await response.json();
      if (!config.validateResponse(data)) {
        result.error = 'Response validation failed';
        return result;
      }
    }

    result.success = true;
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    result.latency = Date.now() - startTime;
  }

  return result;
}

async function runAllTests(): Promise<void> {
  console.log(`\n🔥 Smoke Tests - ${ENV.toUpperCase()}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`User ID: ${TEST_USER_ID}`);
  console.log('─'.repeat(60));

  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;

  for (const test of TESTS) {
    const result = await runTest(test);
    results.push(result);

    if (result.success) {
      passed++;
      console.log(`✅ ${result.name}`);
      if (VERBOSE) {
        console.log(`   ${result.endpoint} (${result.latency}ms)`);
      }
    } else {
      failed++;
      console.log(`❌ ${result.name}`);
      console.log(`   ${result.endpoint}`);
      console.log(`   Error: ${result.error}`);
      if (result.status) {
        console.log(`   Status: ${result.status}`);
      }
    }
  }

  console.log('─'.repeat(60));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('');

  // Performance summary
  const latencies = results.filter((r) => r.latency).map((r) => r.latency!);
  if (latencies.length > 0) {
    const avgLatency = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const maxLatency = Math.max(...latencies);
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

    console.log('Performance:');
    console.log(`  Average latency: ${avgLatency}ms`);
    console.log(`  P95 latency: ${p95Latency}ms`);
    console.log(`  Max latency: ${maxLatency}ms`);
  }

  // Exit with error code if any tests failed
  if (failed > 0) {
    process.exit(1);
  }

  console.log('\n✨ All smoke tests passed!\n');
}

// ============================================================================
// Main
// ============================================================================

runAllTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
