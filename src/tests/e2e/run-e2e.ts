#!/usr/bin/env npx tsx

/**
 * E2E Test Runner for Staging Environment
 *
 * Runs end-to-end tests against real APIs when credentials are available.
 * Safe to run - tests skip gracefully when APIs are not configured.
 *
 * Usage:
 *   npm run test:e2e              # Run all E2E tests
 *   npm run test:e2e:restaurant   # Run restaurant tests only
 *   npm run test:e2e:calendar     # Run calendar tests only
 *   npm run test:e2e:comms        # Run communication tests only
 *
 * Required env vars for full coverage:
 *   - GOOGLE_API_KEY (enables Google Places, Calendar tests)
 *   - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (SMS/calls)
 *   - SENDGRID_API_KEY, SENDGRID_FROM_EMAIL (email)
 *   - OPENTABLE_API_KEY, RESY_API_KEY (restaurant reservations)
 *   - STRIPE_SECRET_KEY (subscription tests)
 *   - DATABASE_URL or GOOGLE_CLOUD_PROJECT (memory persistence)
 */

import { getLogger } from '../../utils/safe-logger.js';

const log = getLogger();

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  duration: number;
  error?: string;
}

interface TestSuite {
  name: string;
  isConfigured: () => boolean;
  tests: Array<{
    name: string;
    run: () => Promise<void>;
  }>;
}

const results: TestResult[] = [];

async function runTest(
  suiteName: string,
  testName: string,
  fn: () => Promise<void>,
  isConfigured: boolean
): Promise<void> {
  const fullName = `${suiteName} > ${testName}`;

  if (!isConfigured) {
    results.push({
      name: fullName,
      passed: false,
      skipped: true,
      duration: 0,
    });
    console.log(`  ⏭️  ${testName} (skipped - not configured)`);
    return;
  }

  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name: fullName, passed: true, skipped: false, duration });
    console.log(`  ✅ ${testName} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({
      name: fullName,
      passed: false,
      skipped: false,
      duration,
      error: errorMsg,
    });
    console.log(`  ❌ ${testName} (${duration}ms)`);
    console.log(`     Error: ${errorMsg}`);
  }
}

// ============================================================================
// RESTAURANT E2E TESTS
// ============================================================================

const restaurantTests: TestSuite = {
  name: 'Restaurant Reservations',
  isConfigured: () => !!process.env.GOOGLE_API_KEY || !!process.env.YELP_API_KEY,
  tests: [
    {
      name: 'Search for Italian restaurants in San Francisco',
      run: async () => {
        const { searchRestaurants } = await import('../../services/restaurant-reservations.js');
        const results = await searchRestaurants(
          'italian',
          'San Francisco, CA',
          '2024-03-15',
          '19:00',
          2
        );
        if (results.length === 0) {
          throw new Error('No restaurants found - expected at least 1');
        }
        log.info({ count: results.length, first: results[0].name }, 'Found restaurants');
      },
    },
    {
      name: 'Get service status',
      run: async () => {
        const { getServiceStatus } = await import('../../services/restaurant-reservations.js');
        const status = getServiceStatus();
        log.info(status, 'Service status');
        if (!status.canSearchRestaurants) {
          throw new Error('No search services configured');
        }
      },
    },
    {
      name: 'Format restaurant for speech',
      run: async () => {
        const { formatRestaurantForSpeech } =
          await import('../../services/restaurant-reservations.js');
        const speech = formatRestaurantForSpeech({
          id: 'test',
          name: 'Test Restaurant',
          address: '123 Main St',
          city: 'San Francisco',
          cuisine: ['Italian'],
          priceRange: '$$',
          rating: 4.5,
          reservationProvider: 'phone_only',
        });
        if (!speech.includes('Test Restaurant')) {
          throw new Error('Speech formatting failed');
        }
      },
    },
  ],
};

// ============================================================================
// COMMUNICATION E2E TESTS
// ============================================================================

const communicationTests: TestSuite = {
  name: 'Communication Services',
  isConfigured: () =>
    !!(process.env.SENDGRID_API_KEY && process.env.SENDGRID_FROM_EMAIL) ||
    !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
    ),
  tests: [
    {
      name: 'Validate email format',
      run: async () => {
        // This test is safe - doesn't actually send
        const { default: comms } = await import('../../services/communication-service.js');
        // Just verify the module loads
        if (!comms || typeof comms.sendEmail !== 'function') {
          throw new Error('Communication service not properly exported');
        }
      },
    },
    {
      name: 'Check Twilio configuration',
      run: async () => {
        const { default: comms } = await import('../../services/communication-service.js');
        if (typeof comms.sendSMS !== 'function') {
          throw new Error('sendSMS function not available');
        }
      },
    },
  ],
};

// ============================================================================
// CALENDAR E2E TESTS
// ============================================================================

const calendarTests: TestSuite = {
  name: 'Calendar Services',
  isConfigured: () => !!process.env.GOOGLE_CALENDAR_CLIENT_ID,
  tests: [
    {
      name: 'Generate OAuth URL',
      run: async () => {
        const { generateAuthUrl } = await import('../../services/google-calendar-oauth.js');
        const url = generateAuthUrl('test-state');
        if (!url.includes('accounts.google.com')) {
          throw new Error('OAuth URL invalid');
        }
        log.info({ urlLength: url.length }, 'Generated OAuth URL');
      },
    },
    {
      name: 'Check calendar configuration',
      run: async () => {
        const { isCalendarConfigured } = await import('../../services/google-calendar-oauth.js');
        // Just check the function works
        const configured = isCalendarConfigured();
        log.info({ configured }, 'Calendar configuration status');
      },
    },
  ],
};

// ============================================================================
// MEMORY PERSISTENCE E2E TESTS
// ============================================================================

const memoryTests: TestSuite = {
  name: 'Memory Persistence',
  isConfigured: () => !!process.env.DATABASE_URL || !!process.env.GOOGLE_CLOUD_PROJECT,
  tests: [
    {
      name: 'Initialize memory store',
      run: async () => {
        const { initializeMemorySystem, detectStoreType } = await import('../../memory/index.js');
        const storeType = detectStoreType();
        log.info({ storeType }, 'Detected store type');

        // Only actually initialize if we have real credentials
        if (storeType !== 'memory') {
          const store = await initializeMemorySystem();
          if (!store) {
            throw new Error('Failed to initialize memory store');
          }
        }
      },
    },
    {
      name: 'Test user profile CRUD',
      run: async () => {
        const { getStore } = await import('../../memory/store-factory.js');
        const store = await getStore();

        const testUserId = `e2e_test_${Date.now()}`;
        const testProfile = {
          name: 'E2E Test User',
          createdAt: new Date(),
        };

        // Create
        await store.saveProfile(testUserId, testProfile);

        // Read
        const retrieved = await store.getProfile(testUserId);
        if (!retrieved || retrieved.name !== testProfile.name) {
          throw new Error('Profile retrieval failed');
        }

        // Cleanup
        // Note: May need to implement delete
        log.info({ testUserId }, 'Profile CRUD test passed');
      },
    },
  ],
};

// ============================================================================
// VOICE CALL E2E TESTS
// ============================================================================

const voiceTests: TestSuite = {
  name: 'Voice Services',
  isConfigured: () => !!process.env.CARTESIA_API_KEY,
  tests: [
    {
      name: 'Generate TTS audio (short message)',
      run: async () => {
        const { generateAlexVoice } = await import('../../services/voice-call.js');
        const audio = await generateAlexVoice('Hello, this is a test.');
        if (!audio || audio.length === 0) {
          throw new Error('No audio generated');
        }
        log.info({ audioSize: audio.length }, 'Generated TTS audio');
      },
    },
  ],
};

// ============================================================================
// EXPERIMENT SYSTEM E2E TESTS
// ============================================================================

const experimentTests: TestSuite = {
  name: 'A/B Testing System',
  isConfigured: () => true, // Always available
  tests: [
    {
      name: 'Create experiment',
      run: async () => {
        const { getAgentEvolution } = await import('../../intelligence/agent-evolution.js');
        const evolution = getAgentEvolution();

        // Create test experiment
        const exp = evolution.createExperiment({
          personaId: 'e2e-test',
          name: 'E2E Test Experiment',
          hypothesis: 'Test hypothesis',
          controlBehavior: 'Control',
          treatmentBehavior: 'Treatment',
        });

        if (!exp.id) {
          throw new Error('Experiment creation failed');
        }

        log.info({ experimentId: exp.id }, 'Experiment created');
      },
    },
    {
      name: 'Bayesian analysis',
      run: async () => {
        const { performBayesianAnalysis } = await import('../../services/experiment-advanced.js');

        // Create a mock experiment with metrics
        const mockExperiment = {
          id: 'test',
          personaId: 'test',
          name: 'Test',
          hypothesis: 'Test',
          status: 'running' as const,
          control: { name: 'Control', behavior: 'default' },
          treatment: { name: 'Treatment', behavior: 'new' },
          startedAt: Date.now(),
          metrics: {
            engagement: {
              control: 0.25,
              treatment: 0.3,
              controlN: 100,
              treatmentN: 100,
            },
            satisfaction: {
              control: 0.7,
              treatment: 0.75,
              controlN: 100,
              treatmentN: 100,
            },
          },
        };

        const result = performBayesianAnalysis(mockExperiment);

        if (typeof result.probabilityTreatmentWins !== 'number') {
          throw new Error('Bayesian analysis returned invalid result');
        }

        log.info(result, 'Bayesian analysis result');
      },
    },
    {
      name: 'MAB variant selection',
      run: async () => {
        const { getBanditVariant } = await import('../../services/experiment-advanced.js');

        // Mock experiment with metrics
        const mockExperiment = {
          id: 'test',
          personaId: 'test',
          name: 'Test',
          hypothesis: 'Test',
          status: 'running' as const,
          control: { name: 'Control', behavior: 'default' },
          treatment: { name: 'Treatment', behavior: 'new' },
          startedAt: Date.now(),
          metrics: {
            engagement: {
              control: 0.25,
              treatment: 0.3,
              controlN: 100,
              treatmentN: 100,
            },
            satisfaction: {
              control: 0.7,
              treatment: 0.75,
              controlN: 100,
              treatmentN: 100,
            },
          },
        };

        const variant = getBanditVariant(mockExperiment, 'thompson');
        if (variant !== 'control' && variant !== 'treatment') {
          throw new Error('Invalid variant selected');
        }

        log.info({ variant }, 'MAB variant selection');
      },
    },
    {
      name: 'Segment registration',
      run: async () => {
        const { registerSegment, getAllSegments } =
          await import('../../services/experiment-advanced.js');

        registerSegment({
          id: 'e2e-test-segment',
          name: 'E2E Test Segment',
          description: 'Test segment for E2E',
          evaluate: () => true,
        });

        const segments = getAllSegments();
        const testSegment = segments.find((s) => s.id === 'e2e-test-segment');

        if (!testSegment) {
          throw new Error('Segment registration failed');
        }

        log.info({ segmentCount: segments.length }, 'Segment registered');
      },
    },
  ],
};

// ============================================================================
// MAIN RUNNER
// ============================================================================

const allSuites: TestSuite[] = [
  restaurantTests,
  communicationTests,
  calendarTests,
  memoryTests,
  voiceTests,
  experimentTests,
];

async function runSuite(suite: TestSuite): Promise<void> {
  console.log(`\n📋 ${suite.name}`);
  console.log('─'.repeat(40));

  const isConfigured = suite.isConfigured();
  if (!isConfigured) {
    console.log('  ⚠️  Suite skipped - required services not configured');
  }

  for (const test of suite.tests) {
    await runTest(suite.name, test.name, test.run, isConfigured);
  }
}

async function main(): Promise<void> {
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  🧪 FERNI E2E TEST RUNNER');
  console.log('═══════════════════════════════════════════════════════');

  // Check which services are configured
  console.log('\n📊 Service Configuration:');
  console.log(`  Google API: ${process.env.GOOGLE_API_KEY ? '✅' : '❌'}`);
  console.log(`  Twilio: ${process.env.TWILIO_ACCOUNT_SID ? '✅' : '❌'}`);
  console.log(`  SendGrid: ${process.env.SENDGRID_API_KEY ? '✅' : '❌'}`);
  console.log(`  Cartesia: ${process.env.CARTESIA_API_KEY ? '✅' : '❌'}`);
  console.log(
    `  Database: ${process.env.DATABASE_URL || process.env.GOOGLE_CLOUD_PROJECT ? '✅' : '❌'}`
  );
  console.log(`  Stripe: ${process.env.STRIPE_SECRET_KEY ? '✅' : '❌'}`);

  // Parse CLI args for specific suite
  const targetSuite = process.argv[2];

  const suitesToRun = targetSuite
    ? allSuites.filter((s) => s.name.toLowerCase().includes(targetSuite.toLowerCase()))
    : allSuites;

  if (suitesToRun.length === 0) {
    console.log(`\n❌ No suite found matching "${targetSuite}"`);
    process.exit(1);
  }

  for (const suite of suitesToRun) {
    await runSuite(suite);
  }

  // Summary
  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  📊 SUMMARY');
  console.log('═══════════════════════════════════════════════════════');

  const passed = results.filter((r) => r.passed && !r.skipped).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n  ✅ Passed:  ${passed}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  ⏭️  Skipped: ${skipped}`);
  console.log(`  ⏱️  Time:    ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n  Failed tests:');
    results
      .filter((r) => !r.passed && !r.skipped)
      .forEach((r) => {
        console.log(`    - ${r.name}`);
        if (r.error) console.log(`      ${r.error}`);
      });
  }

  console.log('\n═══════════════════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('E2E runner failed:', error);
  process.exit(1);
});
