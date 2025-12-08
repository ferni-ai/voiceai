#!/usr/bin/env npx ts-node --esm
/**
 * Voice Authentication API Test Script
 *
 * Tests the voice enrollment, verification, and identification endpoints.
 *
 * Usage:
 *   npx ts-node --esm scripts/test-voice-auth-api.ts [baseUrl]
 *
 * Default: http://localhost:3003
 */

const BASE_URL = process.argv[2] || 'http://localhost:3003';
const TEST_USER_ID = 'test-user-' + Date.now();

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

/**
 * Generate synthetic audio samples (random noise for testing).
 */
function generateTestAudio(durationMs: number = 2000, seed: number = 0): number[] {
  const sampleRate = 16000;
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples: number[] = [];

  // Simple deterministic random generator
  let s = seed || Date.now();
  const random = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  for (let i = 0; i < numSamples; i++) {
    // Generate pseudo-random audio with some structure
    const t = i / sampleRate;
    const frequency = 200 + (seed % 100); // Vary frequency by seed
    const noise = (random() - 0.5) * 0.3;
    const tone = Math.sin(2 * Math.PI * frequency * t) * 0.5;
    samples.push(tone + noise);
  }

  return samples;
}

/**
 * Make API request with error handling.
 */
async function apiRequest(
  endpoint: string,
  method: string = 'GET',
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<{ status: number; data: unknown }> {
  const url = `${BASE_URL}${endpoint}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': TEST_USER_ID,
      ...headers,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));

  return { status: response.status, data };
}

/**
 * Run a test and record the result.
 */
async function runTest(
  name: string,
  testFn: () => Promise<{ passed: boolean; details?: Record<string, unknown> }>
): Promise<void> {
  const start = Date.now();
  try {
    const { passed, details } = await testFn();
    results.push({
      name,
      passed,
      duration: Date.now() - start,
      details,
    });
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// ============================================================================
// Tests
// ============================================================================

async function testSystemStatus(): Promise<{ passed: boolean; details?: Record<string, unknown> }> {
  const { status, data } = await apiRequest('/api/voice/status');

  const response = data as Record<string, unknown>;
  const passed = status === 200 && response.status === 'ok';

  return {
    passed,
    details: {
      status,
      neuralEmbedding: response.neuralEmbedding,
      method: response.method,
      features: response.features,
    },
  };
}

async function testStartEnrollment(): Promise<{
  passed: boolean;
  details?: Record<string, unknown>;
}> {
  const { status, data } = await apiRequest('/api/voice/enroll/start', 'POST', {
    requiredSamples: 3,
  });

  const response = data as Record<string, unknown>;
  const passed = status === 200 && response.success === true;

  return {
    passed,
    details: {
      status,
      sessionId: response.sessionId,
      requiredSamples: response.requiredSamples,
    },
  };
}

async function testAddEnrollmentSample(
  sampleNumber: number
): Promise<{ passed: boolean; details?: Record<string, unknown> }> {
  const audio = generateTestAudio(2000, sampleNumber);

  const { status, data } = await apiRequest('/api/voice/enroll/sample', 'POST', {
    samples: audio,
    deviceType: 'test-script',
    environment: 'development',
  });

  const response = data as Record<string, unknown>;
  const progress = response.progress as Record<string, unknown> | undefined;
  const passed = status === 200 && response.success === true;

  return {
    passed,
    details: {
      status,
      collected: progress?.collected,
      required: progress?.required,
      quality: progress?.quality,
      message: response.message,
    },
  };
}

async function testCompleteEnrollment(): Promise<{
  passed: boolean;
  details?: Record<string, unknown>;
}> {
  const { status, data } = await apiRequest('/api/voice/enroll/complete', 'POST', {
    displayName: 'Test User',
  });

  const response = data as Record<string, unknown>;
  const profile = response.profile as Record<string, unknown> | undefined;
  const passed = status === 200 && response.success === true;

  return {
    passed,
    details: {
      status,
      qualityScore: profile?.qualityScore,
      threshold: profile?.threshold,
      sampleCount: profile?.sampleCount,
    },
  };
}

async function testVerifySpeaker(): Promise<{ passed: boolean; details?: Record<string, unknown> }> {
  // Use same audio pattern as enrollment for higher similarity
  const audio = generateTestAudio(2000, 1);

  const { status, data } = await apiRequest('/api/voice/verify', 'POST', {
    samples: audio,
  });

  const response = data as Record<string, unknown>;
  const passed = status === 200 && typeof response.confidence === 'number';

  return {
    passed,
    details: {
      status,
      verified: response.verified,
      confidence: response.confidence,
      processingTimeMs: response.processingTimeMs,
    },
  };
}

async function testGetProfile(): Promise<{ passed: boolean; details?: Record<string, unknown> }> {
  const { status, data } = await apiRequest('/api/voice/profile');

  const response = data as Record<string, unknown>;
  const passed = status === 200 && response.enrolled === true;

  return {
    passed,
    details: {
      status,
      enrolled: response.enrolled,
      qualityScore: response.qualityScore,
      sampleCount: response.sampleCount,
    },
  };
}

async function testIdentifySpeaker(): Promise<{
  passed: boolean;
  details?: Record<string, unknown>;
}> {
  const audio = generateTestAudio(2000, 1);

  const { status, data } = await apiRequest('/api/voice/identify', 'POST', {
    samples: audio,
    minThreshold: 0.3, // Lower threshold for test
  });

  const response = data as Record<string, unknown>;
  const passed = status === 200;

  return {
    passed,
    details: {
      status,
      identified: response.identified,
      userId: response.userId,
      confidence: response.confidence,
      candidateCount: (response.candidates as unknown[])?.length,
    },
  };
}

async function testContinuousAuthStart(): Promise<{
  passed: boolean;
  details?: Record<string, unknown>;
}> {
  const { status, data } = await apiRequest('/api/voice/auth/start', 'POST', {
    sessionId: 'test-session',
  });

  const response = data as Record<string, unknown>;
  const passed = status === 200 && response.success === true;

  return {
    passed,
    details: {
      status,
      sessionId: response.sessionId,
    },
  };
}

async function testContinuousAuthCheck(): Promise<{
  passed: boolean;
  details?: Record<string, unknown>;
}> {
  const audio = generateTestAudio(1000, 1);

  const { status, data } = await apiRequest('/api/voice/auth/check', 'POST', {
    sessionId: 'test-session',
    samples: audio,
  });

  const response = data as Record<string, unknown>;
  const passed = status === 200 && typeof response.status === 'string';

  return {
    passed,
    details: {
      status,
      authStatus: response.status,
      confidence: response.confidence,
      anomalyCount: response.anomalyCount,
    },
  };
}

async function testContinuousAuthStop(): Promise<{
  passed: boolean;
  details?: Record<string, unknown>;
}> {
  const { status, data } = await apiRequest('/api/voice/auth/stop', 'POST', {
    sessionId: 'test-session',
  });

  const response = data as Record<string, unknown>;
  const passed = status === 200 && response.success === true;

  return {
    passed,
    details: { status },
  };
}

async function testDeleteProfile(): Promise<{ passed: boolean; details?: Record<string, unknown> }> {
  const { status, data } = await apiRequest('/api/voice/profile', 'DELETE');

  const response = data as Record<string, unknown>;
  const passed = status === 200 && response.success === true;

  return {
    passed,
    details: { status },
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log('🎤 Voice Authentication API Test Suite');
  console.log('━'.repeat(60));
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Test User: ${TEST_USER_ID}`);
  console.log('━'.repeat(60));
  console.log('');

  // System status
  console.log('📊 Testing System Status...');
  await runTest('GET /api/voice/status', testSystemStatus);

  // Enrollment flow
  console.log('📝 Testing Enrollment Flow...');
  await runTest('POST /api/voice/enroll/start', testStartEnrollment);
  await runTest('POST /api/voice/enroll/sample (1)', () => testAddEnrollmentSample(1));
  await runTest('POST /api/voice/enroll/sample (2)', () => testAddEnrollmentSample(2));
  await runTest('POST /api/voice/enroll/sample (3)', () => testAddEnrollmentSample(3));
  await runTest('POST /api/voice/enroll/complete', testCompleteEnrollment);

  // Verification
  console.log('🔐 Testing Verification...');
  await runTest('POST /api/voice/verify', testVerifySpeaker);
  await runTest('GET /api/voice/profile', testGetProfile);

  // Identification
  console.log('🔍 Testing Identification...');
  await runTest('POST /api/voice/identify', testIdentifySpeaker);

  // Continuous authentication
  console.log('🔄 Testing Continuous Auth...');
  await runTest('POST /api/voice/auth/start', testContinuousAuthStart);
  await runTest('POST /api/voice/auth/check', testContinuousAuthCheck);
  await runTest('POST /api/voice/auth/stop', testContinuousAuthStop);

  // Cleanup
  console.log('🧹 Cleanup...');
  await runTest('DELETE /api/voice/profile', testDeleteProfile);

  // Results
  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 TEST RESULTS');
  console.log('━'.repeat(60));

  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const status = result.passed ? 'PASS' : 'FAIL';
    console.log(`${icon} ${status} ${result.name} (${result.duration}ms)`);

    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.details) {
      const detailsStr = Object.entries(result.details)
        .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
        .join(', ');
      console.log(`   ${detailsStr}`);
    }

    if (result.passed) passed++;
    else failed++;
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('━'.repeat(60));

  // Exit code based on results
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
});

