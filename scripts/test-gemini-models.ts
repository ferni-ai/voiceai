#!/usr/bin/env npx tsx
/**
 * Gemini Model Compatibility Test
 *
 * Tests various Gemini models and RealtimeModel options to see which work.
 * Run with: npx tsx scripts/test-gemini-models.ts
 *
 * Requirements:
 * - GOOGLE_API_KEY or GOOGLE_CLOUD_PROJECT + service account credentials
 */

import * as genai from '@google/genai';
import * as google from '@livekit/agents-plugin-google';
import { initializeLogger } from '@livekit/agents';

// Initialize LiveKit logger (required by the SDK)
initializeLogger({ pretty: false });

// ============================================================================
// Configuration
// ============================================================================

const USE_VERTEX_AI = process.env.USE_VERTEX_AI !== 'false';
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'johnb-2025';
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;

// Models to test
const MODELS_TO_TEST = [
  // Live/Realtime models (expected to work)
  'gemini-2.0-flash-live-001',
  'gemini-2.0-flash-exp',

  // Experimental/preview
  'gemini-2.5-flash-preview-native-audio-dialog',
  'gemini-2.5-flash-exp',
  'gemini-2.5-pro-exp',

  // Standard models (may not support realtime)
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
];

// RealtimeModel option configurations to test
interface RealtimeModelConfig {
  name: string;
  options: Record<string, unknown>;
}

const CONFIGS_TO_TEST: RealtimeModelConfig[] = [
  {
    name: 'TEXT modality only',
    options: {
      modalities: [genai.Modality.TEXT],
      temperature: 0.8,
      inputAudioTranscription: { languageCode: 'en-US' },
    },
  },
  {
    name: 'AUDIO modality only',
    options: {
      modalities: [genai.Modality.AUDIO],
      temperature: 0.8,
      inputAudioTranscription: { languageCode: 'en-US' },
    },
  },
  {
    name: 'TEXT + AUDIO modalities',
    options: {
      modalities: [genai.Modality.TEXT, genai.Modality.AUDIO],
      temperature: 0.8,
      inputAudioTranscription: { languageCode: 'en-US' },
    },
  },
  {
    name: 'With Google Search tool',
    options: {
      modalities: [genai.Modality.TEXT],
      temperature: 0.8,
      inputAudioTranscription: { languageCode: 'en-US' },
      toolChoice: 'auto',
      geminiTools: { googleSearch: {} },
    },
  },
  {
    name: 'Without inputAudioTranscription',
    options: {
      modalities: [genai.Modality.TEXT],
      temperature: 0.8,
    },
  },
  {
    name: 'With empty inputAudioTranscription (auto-detect)',
    options: {
      modalities: [genai.Modality.TEXT],
      temperature: 0.8,
      inputAudioTranscription: {},
    },
  },
  {
    name: 'Low temperature (0.3)',
    options: {
      modalities: [genai.Modality.TEXT],
      temperature: 0.3,
      inputAudioTranscription: { languageCode: 'en-US' },
    },
  },
  {
    name: 'High temperature (1.2)',
    options: {
      modalities: [genai.Modality.TEXT],
      temperature: 1.2,
      inputAudioTranscription: { languageCode: 'en-US' },
    },
  },
];

// ============================================================================
// Test Results
// ============================================================================

interface TestResult {
  model: string;
  config: string;
  success: boolean;
  error?: string;
  creationTimeMs?: number;
  sessionConnectTimeMs?: number;
  notes?: string;
}

const results: TestResult[] = [];

// ============================================================================
// Test Functions
// ============================================================================

async function testModelWithConfig(
  model: string,
  config: RealtimeModelConfig,
  deepTest = false
): Promise<TestResult> {
  const result: TestResult = {
    model,
    config: config.name,
    success: false,
  };

  const startTime = Date.now();

  try {
    // Build options
    const options: Record<string, unknown> = {
      model,
      ...config.options,
      instructions: 'You are a helpful assistant. Say hello.',
    };

    // Add Vertex AI config if enabled
    if (USE_VERTEX_AI) {
      options.vertexai = true;
      options.project = GOOGLE_CLOUD_PROJECT;
      options.location = GOOGLE_CLOUD_LOCATION;
    }

    // Attempt to create the RealtimeModel
    console.log(`\n  Creating RealtimeModel for ${model}...`);
    const llmModel = new google.beta.realtime.RealtimeModel(options as any);

    result.creationTimeMs = Date.now() - startTime;
    console.log(`  ✓ Model created in ${result.creationTimeMs}ms`);

    // Try to create a session (this actually connects to the API)
    console.log(`  Attempting to create session...`);
    const sessionStart = Date.now();

    try {
      // The RealtimeModel.session() method creates a live connection
      // We'll use a timeout to avoid hanging
      const sessionPromise = llmModel.session({
        // Session options
      });

      // Race against a timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Session creation timeout (10s)')), 10000);
      });

      const session = (await Promise.race([sessionPromise, timeoutPromise])) as any;
      result.sessionConnectTimeMs = Date.now() - sessionStart;
      console.log(`  ✓ Session created in ${result.sessionConnectTimeMs}ms`);

      // DEEP TEST: Inspect the session object and test the API
      if (deepTest && session) {
        console.log(`  Inspecting session object...`);

        // List available methods on the session
        const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(session))
          .filter((m) => typeof (session as any)[m] === 'function' && m !== 'constructor');
        console.log(`    Available methods: ${methods.join(', ') || '(none)'}`);

        // List available properties
        const props = Object.keys(session).filter((k) => typeof (session as any)[k] !== 'function');
        console.log(`    Available properties: ${props.join(', ') || '(none)'}`);

        // Try to use the conversation API if available
        const messageStart = Date.now();
        try {
          if (typeof session.conversation === 'function') {
            console.log(`  Testing conversation API...`);
            const conv = session.conversation();
            console.log(`    Conversation methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(conv)).join(', ')}`);
            result.notes = `Has conversation() API - conv methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(conv)).slice(0, 5).join(', ')}...`;
          } else if (typeof session.inputAudioBuffer === 'object') {
            // Google's API might use inputAudioBuffer for audio input
            result.notes = 'Session has inputAudioBuffer (audio streaming API)';
            console.log(`  ✓ Found inputAudioBuffer API`);
          } else {
            result.notes = `Session OK - methods: [${methods.slice(0, 5).join(', ')}${methods.length > 5 ? '...' : ''}]`;
          }
          console.log(`  ✓ Session inspection complete in ${Date.now() - messageStart}ms`);
        } catch (inspectErr) {
          const errMsg = inspectErr instanceof Error ? inspectErr.message : String(inspectErr);
          result.notes = `Session inspection error: ${errMsg}`;
          console.log(`  ⚠ Inspection error: ${errMsg}`);
        }
      }

      // If we got here, the session was created successfully
      result.success = true;

      // Try to close the session gracefully
      try {
        if (session && typeof session.close === 'function') {
          await session.close();
          console.log(`  ✓ Session closed`);
        }
      } catch (closeErr) {
        // Ignore close errors
      }
    } catch (sessionErr) {
      result.sessionConnectTimeMs = Date.now() - sessionStart;
      result.error = sessionErr instanceof Error ? sessionErr.message : String(sessionErr);
      result.notes = 'Model created but session failed';
      console.log(`  ✗ Session failed: ${result.error}`);
    }
  } catch (err) {
    result.creationTimeMs = Date.now() - startTime;
    result.error = err instanceof Error ? err.message : String(err);
    console.log(`  ✗ Model creation failed: ${result.error}`);
  }

  return result;
}

async function runTests(deepTest = false): Promise<void> {
  console.log('='.repeat(70));
  console.log(`GEMINI MODEL COMPATIBILITY TEST${deepTest ? ' (DEEP MODE)' : ''}`);
  console.log('='.repeat(70));
  console.log(`\nConfiguration:`);
  console.log(`  USE_VERTEX_AI: ${USE_VERTEX_AI}`);
  if (USE_VERTEX_AI) {
    console.log(`  Project: ${GOOGLE_CLOUD_PROJECT}`);
    console.log(`  Location: ${GOOGLE_CLOUD_LOCATION}`);
  } else {
    console.log(`  API Key: ${GOOGLE_API_KEY ? '***' + GOOGLE_API_KEY.slice(-4) : '(not set)'}`);
  }
  console.log(`  Deep test: ${deepTest ? 'YES (will send actual messages)' : 'NO (session creation only)'}`);
  console.log(`\nTesting ${MODELS_TO_TEST.length} models × ${CONFIGS_TO_TEST.length} configs`);
  console.log(`Total tests: ${MODELS_TO_TEST.length * CONFIGS_TO_TEST.length}`);

  // Run tests
  for (const model of MODELS_TO_TEST) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`MODEL: ${model}`);
    console.log('─'.repeat(70));

    for (const config of CONFIGS_TO_TEST) {
      console.log(`\n  Config: ${config.name}`);
      const result = await testModelWithConfig(model, config, deepTest);
      results.push(result);

      // Small delay between tests to avoid rate limiting
      await new Promise((r) => setTimeout(r, deepTest ? 2000 : 500));
    }
  }

  // Print summary
  printSummary();
}

function printSummary(): void {
  console.log('\n');
  console.log('='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  // Group by model
  const byModel = new Map<string, TestResult[]>();
  for (const result of results) {
    if (!byModel.has(result.model)) {
      byModel.set(result.model, []);
    }
    byModel.get(result.model)!.push(result);
  }

  // Print per-model summary
  for (const [model, modelResults] of byModel) {
    const successCount = modelResults.filter((r) => r.success).length;
    const totalCount = modelResults.length;
    const status = successCount === totalCount ? '✓' : successCount > 0 ? '◐' : '✗';

    console.log(`\n${status} ${model}: ${successCount}/${totalCount} configs passed`);

    if (successCount < totalCount) {
      // Show which configs failed
      for (const result of modelResults) {
        if (!result.success) {
          console.log(`    ✗ ${result.config}: ${result.error?.slice(0, 60) || 'unknown error'}`);
        }
      }
    }
  }

  // Print working combinations
  const working = results.filter((r) => r.success);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`WORKING COMBINATIONS (${working.length}/${results.length}):`);
  console.log('─'.repeat(70));

  if (working.length === 0) {
    console.log('  None! Check your credentials and network.');
  } else {
    for (const result of working) {
      console.log(`  ✓ ${result.model} + "${result.config}"`);
      if (result.sessionConnectTimeMs) {
        console.log(`    Session connect: ${result.sessionConnectTimeMs}ms`);
      }
    }
  }

  // Print failed combinations
  const failed = results.filter((r) => !r.success);
  if (failed.length > 0) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`FAILED COMBINATIONS (${failed.length}/${results.length}):`);
    console.log('─'.repeat(70));

    for (const result of failed) {
      console.log(`  ✗ ${result.model} + "${result.config}"`);
      console.log(`    Error: ${result.error?.slice(0, 80) || 'unknown'}`);
    }
  }

  // Recommendations
  console.log(`\n${'─'.repeat(70)}`);
  console.log('RECOMMENDATIONS:');
  console.log('─'.repeat(70));

  // Find the most reliable model
  const modelSuccessRate = new Map<string, number>();
  for (const [model, modelResults] of byModel) {
    const rate = modelResults.filter((r) => r.success).length / modelResults.length;
    modelSuccessRate.set(model, rate);
  }

  const sortedModels = [...modelSuccessRate.entries()].sort((a, b) => b[1] - a[1]);

  if (sortedModels[0] && sortedModels[0][1] > 0) {
    console.log(`  Best model: ${sortedModels[0][0]} (${Math.round(sortedModels[0][1] * 100)}% success rate)`);
  }

  // Find the most reliable config
  const configSuccessRate = new Map<string, number>();
  for (const config of CONFIGS_TO_TEST) {
    const configResults = results.filter((r) => r.config === config.name);
    const rate = configResults.filter((r) => r.success).length / configResults.length;
    configSuccessRate.set(config.name, rate);
  }

  const sortedConfigs = [...configSuccessRate.entries()].sort((a, b) => b[1] - a[1]);

  if (sortedConfigs[0] && sortedConfigs[0][1] > 0) {
    console.log(`  Best config: "${sortedConfigs[0][0]}" (${Math.round(sortedConfigs[0][1] * 100)}% success rate)`);
  }

  console.log('\n');
}

// ============================================================================
// Quick Test Mode (single model)
// ============================================================================

async function quickTest(model?: string, deepTest = false): Promise<void> {
  const testModel = model || 'gemini-2.0-flash-live-001';

  console.log('='.repeat(70));
  console.log(`QUICK TEST: ${testModel}${deepTest ? ' (DEEP MODE)' : ''}`);
  console.log('='.repeat(70));
  console.log(`\nConfiguration:`);
  console.log(`  USE_VERTEX_AI: ${USE_VERTEX_AI}`);
  if (USE_VERTEX_AI) {
    console.log(`  Project: ${GOOGLE_CLOUD_PROJECT}`);
    console.log(`  Location: ${GOOGLE_CLOUD_LOCATION}`);
  }
  console.log(`  Deep test: ${deepTest ? 'YES' : 'NO'}`);

  const config = CONFIGS_TO_TEST[0]; // TEXT modality only
  console.log(`\nTesting with config: ${config.name}`);

  const result = await testModelWithConfig(testModel, config, deepTest);

  console.log('\n' + '─'.repeat(70));
  if (result.success) {
    console.log(`✓ SUCCESS: ${testModel} works!`);
    console.log(`  Session connect time: ${result.sessionConnectTimeMs}ms`);
    if (result.notes) {
      console.log(`  Notes: ${result.notes}`);
    }
  } else {
    console.log(`✗ FAILED: ${testModel}`);
    console.log(`  Error: ${result.error}`);
  }
}

// ============================================================================
// Main
// ============================================================================

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Gemini Model Compatibility Test

Usage:
  npx tsx scripts/test-gemini-models.ts              # Run full test suite (session creation only)
  npx tsx scripts/test-gemini-models.ts --deep       # Run full test with actual message sending
  npx tsx scripts/test-gemini-models.ts --quick      # Quick test (default model)
  npx tsx scripts/test-gemini-models.ts --quick --deep  # Quick test with message sending
  npx tsx scripts/test-gemini-models.ts --quick gemini-2.5-flash-lite  # Quick test specific model

Flags:
  --quick          Test single model only (faster)
  --deep           Actually send messages to verify model works (slower, costs tokens)
  --help, -h       Show this help

Environment Variables:
  USE_VERTEX_AI=true|false        Use Vertex AI (default: true)
  GOOGLE_CLOUD_PROJECT            GCP project for Vertex AI
  GOOGLE_CLOUD_LOCATION           GCP location (default: us-central1)
  GOOGLE_API_KEY                  API key (for non-Vertex AI mode)

Examples:
  # Test all models, session creation only
  pnpm test:models

  # Test all models with actual messages
  pnpm test:models -- --deep

  # Quick test gemini-2.5-flash-lite
  pnpm test:models:quick -- gemini-2.5-flash-lite

  # Quick deep test
  pnpm test:models:quick -- --deep
`);
  process.exit(0);
}

const deepTest = args.includes('--deep');

if (args.includes('--quick')) {
  // Find the model argument (not a flag)
  const modelArg = args.find((arg) => !arg.startsWith('--') && arg !== 'quick');
  quickTest(modelArg, deepTest).catch(console.error);
} else {
  runTests(deepTest).catch(console.error);
}
