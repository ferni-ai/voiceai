/**
 * E2E Tests for Trust Systems API
 *
 * Tests the trust journey and export endpoints:
 * - GET /api/trust-journey - Full trust journey data
 * - GET /api/trust-journey/summary - Journey summary
 * - GET /api/trust-journey/metrics - Journey metrics
 * - GET /api/trust-export - Export trust data
 * - GET /api/trust-export/csv - Export as CSV
 */

import { expect, test } from '@playwright/test';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3002';
const TEST_USER_ID = 'e2e-trust-test-user';
const TEST_HEADERS = {
  'X-User-ID': TEST_USER_ID,
  'Content-Type': 'application/json',
};

// ============================================================================
// TRUST JOURNEY API TESTS
// ============================================================================

test.describe('Trust Journey API', () => {
  test('GET /api/trust-journey - returns journey data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    // Verify required fields exist
    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('timeline');
    expect(data).toHaveProperty('generatedAt');
  });

  test('GET /api/trust-journey/summary - returns summary only', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey/summary?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('summary');
    expect(data).toHaveProperty('generatedAt');
  });

  test('GET /api/trust-journey/timeline - returns timeline only', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey/timeline?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('timeline');
    expect(Array.isArray(data.timeline)).toBe(true);
  });

  test('GET /api/trust-journey/metrics - returns metrics', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey/metrics?userId=${TEST_USER_ID}&days=30`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('period');
    expect(data).toHaveProperty('metrics');
  });

  test('trust journey requires authentication', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey?userId=${TEST_USER_ID}`
      // No auth headers
    );

    expect(response.status()).toBe(401);
  });

  test('cannot access another user data without admin', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-journey?userId=different-user`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(403);
  });
});

// ============================================================================
// TRUST EXPORT API TESTS
// ============================================================================

test.describe('Trust Export API', () => {
  test('GET /api/trust-export - returns export data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('generatedAt');
    expect(data).toHaveProperty('boundaries');
    expect(data).toHaveProperty('growthPatterns');
    expect(data).toHaveProperty('sharedMoments');
    expect(data).toHaveProperty('wins');
  });

  test('GET /api/trust-export/csv - returns CSV file', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export/csv?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/csv');

    const disposition = response.headers()['content-disposition'];
    expect(disposition).toContain('attachment');
    expect(disposition).toContain('.csv');
  });

  test('GET /api/trust-export/summary - returns text summary', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export/summary?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');
  });

  test('trust export requires authentication', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-export?userId=${TEST_USER_ID}`
      // No auth headers
    );

    expect(response.status()).toBe(401);
  });
});

// ============================================================================
// TRUST SYSTEMS ROUTES API TESTS
// ============================================================================

test.describe('Trust Systems Routes API', () => {
  test('GET /api/trust-systems/summary - returns summary', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-systems/summary?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('systems');
    expect(typeof data.systems).toBe('object');
  });

  test('GET /api/trust-systems/boundaries - returns boundary data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-systems/boundaries?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('boundaries');
    expect(Array.isArray(data.boundaries)).toBe(true);
  });

  test('GET /api/trust-systems/growth - returns growth patterns', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-systems/growth?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('patterns');
  });

  test('GET /api/trust-systems/wins - returns wins data', async ({ request }) => {
    const response = await request.get(
      `${BASE_URL}/api/trust-systems/wins?userId=${TEST_USER_ID}`,
      { headers: TEST_HEADERS }
    );

    expect(response.status()).toBe(200);

    const data = await response.json();

    expect(data).toHaveProperty('userId');
    expect(data).toHaveProperty('wins');
  });
});

