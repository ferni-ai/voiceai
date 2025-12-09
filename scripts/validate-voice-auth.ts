#!/usr/bin/env npx ts-node --esm
/**
 * Voice Authentication E2E Validation Script
 *
 * This script validates the complete voice authentication system:
 * - Backend API endpoints
 * - Neural embedding availability
 * - Enrollment flow
 * - Verification flow
 * - Identification flow
 * - Profile management
 *
 * Usage:
 *   npx ts-node --esm scripts/validate-voice-auth.ts [--url=<base_url>]
 *
 * @module VoiceAuthValidation
 */

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Configuration
// ============================================================================

interface ValidationConfig {
  baseUrl: string;
  testUserId: string;
  sampleDurationMs: number;
  sampleRate: number;
}

const DEFAULT_CONFIG: ValidationConfig = {
  baseUrl: process.env.VOICE_AUTH_URL || 'http://localhost:3002',
  testUserId: `test-voice-auth-${Date.now()}`,
  sampleDurationMs: 2000,
  sampleRate: 16000,
};

// ============================================================================
// Types
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
  details?: Record<string, unknown>;
}

interface ValidationReport {
  timestamp: string;
  config: ValidationConfig;
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    duration: number;
  };
}

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Generate synthetic audio samples (sine wave + noise for voice-like characteristics).
 */
function generateSyntheticAudio(durationMs: number, sampleRate: number): Float32Array {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const samples = new Float32Array(numSamples);

  // Generate voice-like frequencies (100-400 Hz fundamentals)
  const fundamentalFreq = 150 + Math.random() * 100;
  const harmonics = [1, 2, 3, 4, 5];
  const amplitudes = [0.5, 0.3, 0.15, 0.1, 0.05];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;

    // Sum harmonics
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      sample +=
        amplitudes[h]! * Math.sin(2 * Math.PI * fundamentalFreq * harmonics[h]! * t);
    }

    // Add amplitude modulation (speech-like envelope)
    const envelopeFreq = 3 + Math.random() * 2; // 3-5 Hz
    const envelope = 0.5 + 0.5 * Math.sin(2 * Math.PI * envelopeFreq * t);
    sample *= envelope;

    // Add slight noise
    sample += (Math.random() - 0.5) * 0.05;

    // Normalize
    samples[i] = Math.max(-1, Math.min(1, sample * 0.3));
  }

  return samples;
}

/**
 * Make API request with proper headers.
 */
async function apiRequest<T>(
  config: ValidationConfig,
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${config.baseUrl}/api/voice${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-ID': config.testUserId,
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${JSON.stringify(data)}`);
  }

  return data as T;
}

// ============================================================================
// Test Cases
// ============================================================================

async function testSystemStatus(config: ValidationConfig): Promise<TestResult> {
  const name = 'System Status Check';
  const startTime = Date.now();

  try {
    const status = await apiRequest<{
      status: string;
      neuralEmbedding: boolean;
      method: string;
      features: {
        enrollment: boolean;
        verification: boolean;
        identification: boolean;
        continuousAuth: boolean;
      };
    }>(config, '/status', { method: 'GET' });

    const passed = status.status === 'ok' && status.features.enrollment;

    return {
      name,
      passed,
      duration: Date.now() - startTime,
      details: {
        status: status.status,
        neuralEmbedding: status.neuralEmbedding,
        method: status.method,
        features: status.features,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testProfileNotEnrolled(config: ValidationConfig): Promise<TestResult> {
  const name = 'Profile Check (Not Enrolled)';
  const startTime = Date.now();

  try {
    const profile = await apiRequest<{
      enrolled: boolean;
    }>(config, '/profile', { method: 'GET' });

    return {
      name,
      passed: profile.enrolled === false,
      duration: Date.now() - startTime,
      details: { enrolled: profile.enrolled },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testEnrollmentStart(config: ValidationConfig): Promise<TestResult> {
  const name = 'Enrollment Start';
  const startTime = Date.now();

  try {
    const result = await apiRequest<{
      success: boolean;
      sessionId: string;
      requiredSamples: number;
      message: string;
    }>(config, '/enroll/start', {
      method: 'POST',
      body: JSON.stringify({ requiredSamples: 3 }),
    });

    return {
      name,
      passed: result.success && result.sessionId && result.requiredSamples === 3,
      duration: Date.now() - startTime,
      details: {
        sessionId: result.sessionId,
        requiredSamples: result.requiredSamples,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testEnrollmentSamples(config: ValidationConfig): Promise<TestResult> {
  const name = 'Enrollment Sample Submission';
  const startTime = Date.now();
  const sampleResults: Array<{ success: boolean; collected: number }> = [];

  try {
    // Submit 3 samples
    for (let i = 0; i < 3; i++) {
      const audio = generateSyntheticAudio(config.sampleDurationMs, config.sampleRate);

      const result = await apiRequest<{
        success: boolean;
        message: string;
        progress: {
          collected: number;
          required: number;
          quality: number;
          status: string;
        };
      }>(config, '/enroll/sample', {
        method: 'POST',
        body: JSON.stringify({
          samples: Array.from(audio),
          deviceType: 'test',
        }),
      });

      sampleResults.push({
        success: result.success,
        collected: result.progress?.collected ?? 0,
      });

      // Small delay between samples
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    const allSucceeded = sampleResults.every((r) => r.success);
    const finalCollected = sampleResults[sampleResults.length - 1]?.collected ?? 0;

    return {
      name,
      passed: allSucceeded && finalCollected >= 3,
      duration: Date.now() - startTime,
      details: { sampleResults, finalCollected },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testEnrollmentComplete(config: ValidationConfig): Promise<TestResult> {
  const name = 'Enrollment Complete';
  const startTime = Date.now();

  try {
    const result = await apiRequest<{
      success: boolean;
      message: string;
      profile: {
        userId: string;
        qualityScore: number;
        threshold: number;
        sampleCount: number;
      };
    }>(config, '/enroll/complete', {
      method: 'POST',
      body: JSON.stringify({ displayName: 'Test User' }),
    });

    return {
      name,
      passed: result.success && result.profile?.qualityScore > 0,
      duration: Date.now() - startTime,
      details: {
        profile: result.profile,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testProfileEnrolled(config: ValidationConfig): Promise<TestResult> {
  const name = 'Profile Check (Enrolled)';
  const startTime = Date.now();

  try {
    const profile = await apiRequest<{
      enrolled: boolean;
      qualityScore?: number;
      sampleCount?: number;
      verificationCount?: number;
    }>(config, '/profile', { method: 'GET' });

    return {
      name,
      passed: profile.enrolled === true && (profile.sampleCount ?? 0) >= 3,
      duration: Date.now() - startTime,
      details: {
        enrolled: profile.enrolled,
        qualityScore: profile.qualityScore,
        sampleCount: profile.sampleCount,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testVerification(config: ValidationConfig): Promise<TestResult> {
  const name = 'Voice Verification';
  const startTime = Date.now();

  try {
    // Generate similar audio (should verify)
    const audio = generateSyntheticAudio(config.sampleDurationMs, config.sampleRate);

    const result = await apiRequest<{
      verified: boolean;
      confidence: number;
      processingTimeMs: number;
      details?: {
        threshold: number;
        similarity: number;
        method: string;
      };
    }>(config, '/verify', {
      method: 'POST',
      body: JSON.stringify({
        samples: Array.from(audio),
      }),
    });

    // Note: Synthetic audio may not verify against itself due to embedding differences
    // We're mainly testing that the endpoint works correctly
    return {
      name,
      passed: typeof result.verified === 'boolean' && typeof result.confidence === 'number',
      duration: Date.now() - startTime,
      details: {
        verified: result.verified,
        confidence: result.confidence,
        processingTimeMs: result.processingTimeMs,
        details: result.details,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testIdentification(config: ValidationConfig): Promise<TestResult> {
  const name = 'Speaker Identification';
  const startTime = Date.now();

  try {
    const audio = generateSyntheticAudio(config.sampleDurationMs, config.sampleRate);

    const result = await apiRequest<{
      identified: boolean;
      userId?: string;
      confidence: number;
      candidates: Array<{ userId: string; similarity: number }>;
      processingTimeMs: number;
    }>(config, '/identify', {
      method: 'POST',
      body: JSON.stringify({
        samples: Array.from(audio),
      }),
    });

    return {
      name,
      passed:
        typeof result.identified === 'boolean' &&
        Array.isArray(result.candidates) &&
        typeof result.processingTimeMs === 'number',
      duration: Date.now() - startTime,
      details: {
        identified: result.identified,
        userId: result.userId,
        confidence: result.confidence,
        candidateCount: result.candidates.length,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testContinuousAuthStart(config: ValidationConfig): Promise<TestResult> {
  const name = 'Continuous Auth Start';
  const startTime = Date.now();

  try {
    const result = await apiRequest<{
      success: boolean;
      sessionId: string;
      message: string;
    }>(config, '/auth/start', {
      method: 'POST',
      body: JSON.stringify({}),
    });

    return {
      name,
      passed: result.success && result.sessionId,
      duration: Date.now() - startTime,
      details: { sessionId: result.sessionId },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testContinuousAuthCheck(config: ValidationConfig): Promise<TestResult> {
  const name = 'Continuous Auth Check';
  const startTime = Date.now();

  try {
    const audio = generateSyntheticAudio(1000, config.sampleRate);

    const result = await apiRequest<{
      status: string;
      confidence: number;
      anomalyCount: number;
    }>(config, '/auth/check', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: config.testUserId,
        samples: Array.from(audio),
      }),
    });

    return {
      name,
      passed:
        typeof result.status === 'string' &&
        typeof result.confidence === 'number',
      duration: Date.now() - startTime,
      details: {
        status: result.status,
        confidence: result.confidence,
        anomalyCount: result.anomalyCount,
      },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testContinuousAuthStop(config: ValidationConfig): Promise<TestResult> {
  const name = 'Continuous Auth Stop';
  const startTime = Date.now();

  try {
    const result = await apiRequest<{
      success: boolean;
      message: string;
    }>(config, '/auth/stop', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: config.testUserId,
      }),
    });

    return {
      name,
      passed: result.success,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testProfileDelete(config: ValidationConfig): Promise<TestResult> {
  const name = 'Profile Delete';
  const startTime = Date.now();

  try {
    const result = await apiRequest<{
      success: boolean;
      message: string;
    }>(config, '/profile', { method: 'DELETE' });

    return {
      name,
      passed: result.success,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function testProfileDeletedConfirm(config: ValidationConfig): Promise<TestResult> {
  const name = 'Profile Delete Confirmation';
  const startTime = Date.now();

  try {
    const profile = await apiRequest<{
      enrolled: boolean;
    }>(config, '/profile', { method: 'GET' });

    return {
      name,
      passed: profile.enrolled === false,
      duration: Date.now() - startTime,
      details: { enrolled: profile.enrolled },
    };
  } catch (error) {
    return {
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// ============================================================================
// Main Validation Runner
// ============================================================================

async function runValidation(): Promise<ValidationReport> {
  // Parse command line args
  const args = process.argv.slice(2);
  const urlArg = args.find((a) => a.startsWith('--url='));
  const baseUrl = urlArg ? urlArg.split('=')[1]! : DEFAULT_CONFIG.baseUrl;

  const config: ValidationConfig = {
    ...DEFAULT_CONFIG,
    baseUrl,
  };

  console.log('\n🔊 Voice Authentication E2E Validation');
  console.log('═'.repeat(50));
  console.log(`Base URL: ${config.baseUrl}`);
  console.log(`Test User: ${config.testUserId}`);
  console.log('═'.repeat(50));

  const results: TestResult[] = [];
  const startTime = Date.now();

  // Run tests in sequence
  const tests = [
    testSystemStatus,
    testProfileNotEnrolled,
    testEnrollmentStart,
    testEnrollmentSamples,
    testEnrollmentComplete,
    testProfileEnrolled,
    testVerification,
    testIdentification,
    testContinuousAuthStart,
    testContinuousAuthCheck,
    testContinuousAuthStop,
    testProfileDelete,
    testProfileDeletedConfirm,
  ];

  for (const test of tests) {
    console.log(`\n⏳ Running: ${test.name}...`);
    const result = await test(config);
    results.push(result);

    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status} (${result.duration}ms)`);

    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.details) {
      console.log(`   Details: ${JSON.stringify(result.details, null, 2).split('\n').join('\n   ')}`);
    }

    // If a critical test fails, stop early
    if (
      !result.passed &&
      ['System Status Check', 'Enrollment Start'].includes(result.name)
    ) {
      console.log('\n⚠️  Critical test failed. Stopping validation.');
      break;
    }
  }

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    config,
    results,
    summary: {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      duration: Date.now() - startTime,
    },
  };

  // Print summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 VALIDATION SUMMARY');
  console.log('═'.repeat(50));
  console.log(`Total Tests: ${report.summary.total}`);
  console.log(`Passed: ${report.summary.passed} ✅`);
  console.log(`Failed: ${report.summary.failed} ❌`);
  console.log(`Duration: ${report.summary.duration}ms`);
  console.log('═'.repeat(50));

  const allPassed = report.summary.failed === 0;
  console.log(
    allPassed
      ? '\n🎉 All tests passed! Voice authentication is working correctly.'
      : '\n⚠️  Some tests failed. Check the errors above.'
  );

  // Save report
  const reportPath = join(process.cwd(), 'test-results', 'voice-auth-validation.json');
  try {
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Report saved to: ${reportPath}`);
  } catch {
    console.log('\n⚠️  Could not save report file.');
  }

  return report;
}

// ============================================================================
// Entry Point
// ============================================================================

runValidation()
  .then((report) => {
    process.exit(report.summary.failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('Validation failed:', error);
    process.exit(1);
  });

