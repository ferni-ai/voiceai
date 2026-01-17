#!/usr/bin/env npx tsx
/**
 * Native Module Runtime Validation
 *
 * This script validates that all Rust native modules load correctly
 * and perform as expected. Run this before deploying to ensure
 * native acceleration is working.
 *
 * Usage: npx tsx scripts/validate-native-modules.ts
 */

import { performance } from 'perf_hooks';
import { createRequire } from 'module';

// Create require function for loading native modules in ESM context
const require = createRequire(import.meta.url);

// ============================================================================
// TEST UTILITIES
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  message: string;
  nativeAvailable?: boolean;
}

const results: TestResult[] = [];

async function test(
  name: string,
  fn: () => Promise<{ passed: boolean; message: string; nativeAvailable?: boolean }> | { passed: boolean; message: string; nativeAvailable?: boolean }
): Promise<void> {
  const start = performance.now();
  try {
    const result = await fn();
    results.push({
      name,
      passed: result.passed,
      duration: performance.now() - start,
      message: result.message,
      nativeAvailable: result.nativeAvailable,
    });
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: performance.now() - start,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
      nativeAvailable: false,
    });
  }
}

// ============================================================================
// MAIN TEST RUNNER
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log('\n🦀 Native Module Runtime Validation\n');
  console.log('='.repeat(60));

  // Test 1: @ferni/perf module loading
  await test('@ferni/perf module loads', () => {
    try {
      const perf = require('@ferni/perf');
      const info = perf.getLibraryInfo?.();
      return {
        passed: true,
        message: `Loaded v${info?.version || 'unknown'}, SIMD: ${info?.simdAvailable}, Threads: ${info?.parallelThreads}`,
        nativeAvailable: true,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to load: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 2: @ferni/audio module loading
  await test('@ferni/audio module loads', () => {
    try {
      const audio = require('@ferni/audio');
      const exports = Object.keys(audio);
      const hasFft = exports.some(k => k.toLowerCase().includes('fft'));
      return {
        passed: true,
        message: `Loaded with exports: ${exports.slice(0, 5).join(', ')}${exports.length > 5 ? '...' : ''}`,
        nativeAvailable: hasFft,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Failed to load: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 3: JSON Parser wrapper
  await test('Native JSON parser wrapper', async () => {
    try {
      const { isNativeJsonParserAvailable, parseJsonFast, logJsonParserStatus } = await import('../src/agents/shared/native-json-parser.js');
      const available = isNativeJsonParserAvailable();

      if (available) {
        // Test parsing a tool call
        const result = parseJsonFast('{"fn":"play_music","args":{"query":"jazz"}}');
        const valid = result?.fn === 'play_music' && result?.args?.query === 'jazz';
        logJsonParserStatus();
        return {
          passed: valid,
          message: valid ? 'Parsed tool call correctly' : 'Parse result mismatch',
          nativeAvailable: true,
        };
      }

      return {
        passed: true, // Fallback is OK
        message: 'Native not available, using JS fallback',
        nativeAvailable: false,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 4: SSML Processor wrapper
  await test('Native SSML processor wrapper', async () => {
    try {
      const { isNativeSsmlAvailable, containsSsmlNative, stripSsmlNative, logSsmlStatus } = await import('../src/ssml/native-ssml-processor.js');
      const available = isNativeSsmlAvailable();

      if (available) {
        const testText = '<speed rate="slow">Hello</speed> world';
        const hasSsml = containsSsmlNative(testText);
        const stripped = stripSsmlNative(testText);
        const valid = hasSsml === true && stripped.includes('Hello') && !stripped.includes('<speed');
        logSsmlStatus();
        return {
          passed: valid,
          message: valid ? `SSML detection and stripping works: "${stripped}"` : 'SSML processing mismatch',
          nativeAvailable: true,
        };
      }

      return {
        passed: true,
        message: 'Native not available, using JS fallback',
        nativeAvailable: false,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 5: FFT wrapper
  await test('Native FFT wrapper', async () => {
    try {
      const { isNativeFftAvailable, fftNative, applyHanningWindowNative } = await import('../src/speech/fft-analyzer/native-fft.js');
      const available = isNativeFftAvailable();

      if (available) {
        // Create a simple test signal
        const testSignal = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
          testSignal[i] = Math.sin(2 * Math.PI * i / 32); // Simple sine wave
        }

        const windowed = applyHanningWindowNative(testSignal);
        const fftResult = fftNative(windowed);
        const valid = fftResult && fftResult.length > 0;

        return {
          passed: valid,
          message: valid ? `FFT output size: ${fftResult.length}` : 'FFT returned empty result',
          nativeAvailable: true,
        };
      }

      return {
        passed: true,
        message: 'Native not available, using JS fallback',
        nativeAvailable: false,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 6: Rust Accelerator (LSH, similarity)
  await test('Rust Accelerator (LSH/similarity)', async () => {
    try {
      const { isRustAvailable, getRustInfo, textSimilarity, findDuplicatesLsh } = await import('../src/memory/rust-accelerator.js');
      const available = isRustAvailable();

      if (available) {
        const info = getRustInfo();

        // Test text similarity
        const similarity = textSimilarity('hello world', 'hello there world');
        const similarityValid = typeof similarity === 'number' && similarity > 0 && similarity <= 1;

        // Test LSH deduplication
        const texts = ['hello world', 'hello there world', 'goodbye moon'];
        const duplicates = findDuplicatesLsh(texts, 0.5);
        const lshValid = Array.isArray(duplicates);

        return {
          passed: similarityValid && lshValid,
          message: `v${info.version}, Threads: ${info.threads}, Similarity: ${similarity.toFixed(3)}, LSH pairs: ${duplicates.length}`,
          nativeAvailable: true,
        };
      }

      return {
        passed: true,
        message: 'Native not available, using JS fallback',
        nativeAvailable: false,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 7: Tool Call Sanitizer Integration
  await test('Tool-call-sanitizer native registration', async () => {
    try {
      // Import the sanitizer module - this should trigger native registration
      const sanitizer = await import('../src/agents/shared/tool-call-sanitizer.js');
      const { isNativeJsonParserAvailable, getToolCount } = await import('../src/agents/shared/native-json-parser.js');

      const nativeActive = isNativeJsonParserAvailable();
      const toolCount = getToolCount();

      // Check if core sanitizer functions exist
      const hasSanitize = typeof sanitizer.sanitizeToolCallLeakage === 'function';
      const hasDetect = typeof sanitizer.containsToolCallLeakage === 'function';

      return {
        passed: hasSanitize && hasDetect,
        message: nativeActive
          ? `Native JSON parser active, ${toolCount} tools registered`
          : 'Using JS fallback for tool call extraction',
        nativeAvailable: nativeActive,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // Test 8: Performance comparison (JSON parsing)
  await test('Performance: Native vs JS JSON parsing', async () => {
    try {
      const { isNativeJsonParserAvailable, parseJsonFast } = await import('../src/agents/shared/native-json-parser.js');
      const nativeAvailable = isNativeJsonParserAvailable();

      const testJson = '{"fn":"search_web","args":{"query":"weather in san francisco","limit":5}}';
      const iterations = 1000;

      // Native/Fast parsing
      const fastStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        parseJsonFast(testJson);
      }
      const fastTime = performance.now() - fastStart;

      // Standard JSON.parse
      const jsStart = performance.now();
      for (let i = 0; i < iterations; i++) {
        JSON.parse(testJson);
      }
      const jsTime = performance.now() - jsStart;

      const speedup = jsTime / fastTime;

      return {
        passed: true,
        message: `${iterations} iterations - Native: ${fastTime.toFixed(2)}ms, JS: ${jsTime.toFixed(2)}ms, Speedup: ${speedup.toFixed(2)}x`,
        nativeAvailable,
      };
    } catch (error) {
      return {
        passed: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        nativeAvailable: false,
      };
    }
  });

  // ============================================================================
  // REPORT RESULTS
  // ============================================================================

  console.log('\n📊 Results:\n');

  let passed = 0;
  let failed = 0;
  let nativeCount = 0;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const nativeIcon = result.nativeAvailable ? '🦀' : '📦';
    console.log(`${icon} ${nativeIcon} ${result.name}`);
    console.log(`   ${result.message}`);
    console.log(`   Duration: ${result.duration.toFixed(2)}ms\n`);

    if (result.passed) passed++;
    else failed++;
    if (result.nativeAvailable) nativeCount++;
  }

  console.log('='.repeat(60));
  console.log(`\n📈 Summary:`);
  console.log(`   Tests: ${passed}/${results.length} passed`);
  console.log(`   Native modules active: ${nativeCount}/${results.length}`);
  console.log(`   Status: ${failed === 0 ? '✅ All tests passed!' : `❌ ${failed} test(s) failed`}\n`);

  if (nativeCount === 0) {
    console.log('⚠️  Warning: No native modules are active!');
    console.log('   All operations will use JavaScript fallbacks.');
    console.log('   Run `cargo build --release` in apps/rust-perf and apps/rust-audio to enable native acceleration.\n');
  } else if (nativeCount < results.length) {
    console.log(`ℹ️  Info: ${nativeCount} of ${results.length} tests using native acceleration.`);
    console.log('   Some fallbacks are in use - this is normal if not all native features are implemented.\n');
  } else {
    console.log('🚀 All tests using native Rust acceleration!\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
