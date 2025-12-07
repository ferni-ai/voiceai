#!/usr/bin/env npx tsx
/**
 * Post-Deploy Smoke Tests
 * 
 * Quick health checks to verify deployment is working correctly.
 * Run after each deployment to validate critical functionality.
 * 
 * Usage:
 *   npx tsx scripts/smoke-test.ts --url https://api.ferni.ai
 *   npx tsx scripts/smoke-test.ts --url http://localhost:3001
 */

const BASE_URL = process.argv.find(arg => arg.startsWith('--url='))?.split('=')[1] 
  || process.env.SMOKE_TEST_URL 
  || 'http://localhost:3001';

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

/**
 * Run a single test with timing
 */
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name} (${Date.now() - start}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, duration, error: errorMsg });
    console.log(`❌ ${name} (${duration}ms): ${errorMsg}`);
  }
}

/**
 * Make HTTP request with timeout
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs = 10000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// SMOKE TESTS
// ============================================================================

async function testHealthEndpoint(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/health`);
  if (!response.ok) throw new Error(`Health check failed: ${response.status}`);
  const data = await response.json();
  if (data.status !== 'ok' && data.status !== 'healthy') {
    throw new Error(`Unexpected health status: ${data.status}`);
  }
}

async function testAgentsEndpoint(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/agents`);
  if (!response.ok) throw new Error(`Agents endpoint failed: ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('No agents returned');
  }
  // Verify required agent exists
  const ferni = data.find((a: { id: string }) => a.id === 'ferni');
  if (!ferni) throw new Error('Ferni agent not found');
}

async function testSubscriptionStatusEndpoint(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/subscription/status?userId=smoke-test-user`);
  // 200 or 401 are acceptable (401 means auth is working)
  if (response.status !== 200 && response.status !== 401) {
    throw new Error(`Subscription status failed: ${response.status}`);
  }
}

async function testStaticAssets(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/`);
  if (!response.ok) throw new Error(`Static assets failed: ${response.status}`);
  const html = await response.text();
  if (!html.includes('<html')) {
    throw new Error('Invalid HTML response');
  }
}

async function testDesignSystem(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/design-system/tokens.css`);
  if (!response.ok) throw new Error(`Design system CSS failed: ${response.status}`);
  const css = await response.text();
  if (!css.includes('--color-')) {
    throw new Error('Invalid CSS tokens');
  }
}

async function testResponseTime(): Promise<void> {
  const start = Date.now();
  await fetchWithTimeout(`${BASE_URL}/health`);
  const duration = Date.now() - start;
  if (duration > 2000) {
    throw new Error(`Response time too slow: ${duration}ms (max 2000ms)`);
  }
}

async function testCORS(): Promise<void> {
  const response = await fetchWithTimeout(`${BASE_URL}/api/agents`, {
    headers: { 'Origin': 'https://ferni.ai' },
  });
  const corsHeader = response.headers.get('access-control-allow-origin');
  // Should have CORS headers (either * or specific origin)
  if (!corsHeader) {
    console.log('⚠️  Warning: No CORS header (may be intentional)');
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n🔍 Running smoke tests against: ${BASE_URL}\n`);
  console.log('─'.repeat(50));
  
  // Critical tests (must pass)
  await runTest('Health endpoint', testHealthEndpoint);
  await runTest('Agents endpoint', testAgentsEndpoint);
  await runTest('Static assets', testStaticAssets);
  await runTest('Response time < 2s', testResponseTime);
  
  // Secondary tests (should pass)
  await runTest('Subscription status', testSubscriptionStatusEndpoint);
  await runTest('Design system CSS', testDesignSystem);
  await runTest('CORS headers', testCORS);
  
  console.log('─'.repeat(50));
  
  // Summary
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  
  console.log(`\n📊 Results: ${passed}/${results.length} passed (${totalDuration}ms total)\n`);
  
  if (failed > 0) {
    console.log('❌ SMOKE TEST FAILED\n');
    console.log('Failed tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
    process.exit(1);
  }
  
  console.log('✅ ALL SMOKE TESTS PASSED\n');
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

