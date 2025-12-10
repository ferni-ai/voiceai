#!/usr/bin/env npx tsx
/**
 * Services Validation Script
 *
 * Validates all services are working correctly:
 * 1. Health checks for all major services
 * 2. Integration tests
 * 3. End-to-end user journey simulation
 *
 * Run: npx tsx scripts/validate-services.ts
 */

import { initializeLogger } from '@livekit/agents';

// Initialize logger
initializeLogger({ pretty: false, level: 'warn' });

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const NC = '\x1b[0m';

interface ValidationResult {
  category: string;
  test: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: ValidationResult[] = [];

// ============================================================================
// HELPERS
// ============================================================================

async function runValidation(
  category: string,
  test: string,
  fn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  process.stdout.write(`  [${category}] ${test}...`);

  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ category, test, passed: true, message: 'OK', duration });
    console.log(`${GREEN} ✓${NC} (${duration}ms)`);
  } catch (error) {
    const duration = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    results.push({ category, test, passed: false, message, duration });
    console.log(`${RED} ✗${NC}`);
    console.log(`    ${RED}Error: ${message}${NC}`);
  }
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

async function validateHealthChecks(): Promise<void> {
  console.log(`\n${CYAN}━━━ Health Checks ━━━${NC}`);

  await runValidation('Health', 'Run all health checks', async () => {
    const { runAllHealthChecks } = await import('../src/services/health-checks.js');
    const report = await runAllHealthChecks();

    if (report.overall === 'unhealthy') {
      const unhealthy = report.services.filter((s) => s.status === 'unhealthy');
      throw new Error(`Unhealthy services: ${unhealthy.map((s) => s.service).join(', ')}`);
    }

    // Log details
    console.log(`\n    Overall: ${report.overall}`);
    console.log(`    Healthy: ${report.summary.healthy}/${report.summary.total}`);
    if (report.summary.degraded > 0) {
      console.log(`    ${YELLOW}Degraded: ${report.summary.degraded}${NC}`);
    }
  });

  await runValidation('Health', 'Critical services healthy', async () => {
    const { runCriticalHealthChecks } = await import('../src/services/health-checks.js');
    const report = await runCriticalHealthChecks();

    if (report.overall === 'unhealthy') {
      throw new Error('Critical services are unhealthy');
    }
  });
}

// ============================================================================
// SERVICES INITIALIZATION
// ============================================================================

async function validateServicesInit(): Promise<void> {
  console.log(`\n${CYAN}━━━ Service Initialization ━━━${NC}`);

  await runValidation('Init', 'Initialize global services', async () => {
    const { initializeServices } = await import('../src/services/index.js');
    await initializeServices(false); // Don't index persona
  });

  await runValidation('Init', 'Get startup capabilities', async () => {
    const { getStartupCapabilities, validateStartup } = await import('../src/services/index.js');
    let caps = getStartupCapabilities();

    // If not available from global state, run validation directly
    if (!caps) {
      const result = validateStartup({
        requirePersistentMemory: false,
        requireSemanticSearch: false,
      });
      caps = result.capabilities;
    }

    if (!caps) {
      throw new Error('Startup capabilities not available');
    }

    console.log(`\n    Store: ${caps.storeType}`);
    console.log(`    Embeddings: ${caps.embeddingProvider}`);
    console.log(`    LLM: ${caps.llmAvailable ? '✓' : '✗'}`);
    console.log(`    Persistent: ${caps.persistentMemory ? '✓' : '⚠️ (ephemeral)'}`);
  });
}

// ============================================================================
// TRUST SYSTEMS
// ============================================================================

async function validateTrustSystems(): Promise<void> {
  console.log(`\n${CYAN}━━━ Trust Systems ━━━${NC}`);

  const testUserId = `validate-${Date.now()}`;

  await runValidation('Trust', 'Build trust context', async () => {
    const { buildTrustContext } = await import('../src/services/trust-systems/index.js');

    const context = buildTrustContext(testUserId, 'I am feeling great today', {
      detectedEmotion: 'joy',
      emotionIntensity: 0.8,
    });

    if (!context) throw new Error('Trust context not built');
  });

  await runValidation('Trust', 'Check response safety', async () => {
    const { checkResponseSafety } = await import('../src/services/trust-systems/index.js');

    const result = checkResponseSafety(testUserId, 'That sounds wonderful!');

    if (result.safe === undefined) throw new Error('Safety check failed');
  });

  await runValidation('Trust', 'Get rollout state', async () => {
    const { getRolloutState } = await import('../src/services/trust-systems/rollout.js');

    const state = getRolloutState();

    if (!state.currentStage) throw new Error('Rollout state not available');
    console.log(`\n    Stage: ${state.currentStage}`);
    console.log(`    Can advance: ${state.canAdvance}`);
  });
}

// ============================================================================
// OUTREACH SYSTEM
// ============================================================================

async function validateOutreachSystem(): Promise<void> {
  console.log(`\n${CYAN}━━━ Outreach System ━━━${NC}`);

  await runValidation('Outreach', 'Generate text message', async () => {
    const { generateTextMessage } = await import('../src/services/outreach/index.js');

    const message = generateTextMessage(
      'ferni',
      {
        userId: 'test',
        userName: 'Test',
        relationshipStage: 'building',
        trigger: { type: 'thinking_of_you', reason: 'Test', urgency: 'low' },
        context: {},
      },
      'casual'
    );

    if (!message || message.length < 10) {
      throw new Error('Message generation failed');
    }
  });

  await runValidation('Outreach', 'Select persona for outreach', async () => {
    const { selectPersonaForOutreach } = await import('../src/services/outreach/index.js');

    const persona = selectPersonaForOutreach('commitment_check');

    if (!persona) throw new Error('Persona selection failed');
  });

  await runValidation('Outreach', 'Get timing profile', async () => {
    const { getTimingProfile } = await import('../src/services/outreach/index.js');

    const profile = getTimingProfile('test-user');

    if (!profile) throw new Error('Timing profile not available');
  });
}

// ============================================================================
// THERAPEUTIC FRAMEWORKS
// ============================================================================

async function validateTherapeuticFrameworks(): Promise<void> {
  console.log(`\n${CYAN}━━━ Therapeutic Frameworks ━━━${NC}`);

  await runValidation('Therapy', 'Detect change talk', async () => {
    const { detectChangeTalk } =
      await import('../src/services/therapeutic-frameworks/motivational-interviewing.js');

    const talk = detectChangeTalk('I want to exercise more and be healthier');

    if (!Array.isArray(talk)) throw new Error('Change talk detection failed');
    console.log(`\n    Detected ${talk.length} change talk instances`);
  });

  await runValidation('Therapy', 'Check values alignment', async () => {
    const { checkValuesAlignment } =
      await import('../src/services/therapeutic-frameworks/act-values.js');

    const alignment = checkValuesAlignment('test-user', 'I want to spend time with family');

    if (!alignment) throw new Error('Values alignment check failed');
  });
}

// ============================================================================
// COGNITIVE INTELLIGENCE
// ============================================================================

async function validateCognitiveIntelligence(): Promise<void> {
  console.log(`\n${CYAN}━━━ Cognitive Intelligence ━━━${NC}`);

  await runValidation('Cognitive', 'Detect distortions', async () => {
    const { detectDistortions } = await import('../src/services/cognitive-intelligence/index.js');

    const distortions = detectDistortions('test-user', 'I always fail at everything');

    if (!Array.isArray(distortions)) throw new Error('Distortion detection failed');
    console.log(`\n    Detected ${distortions.length} distortions`);
  });

  await runValidation('Cognitive', 'Record ANT pattern', async () => {
    const { recordANT, getANTPatterns } =
      await import('../src/services/cognitive-intelligence/index.js');

    recordANT('test-user', {
      type: 'should-statement',
      thought: 'I should have done better',
      trigger: 'work',
    });

    const patterns = getANTPatterns('test-user');
    if (!patterns) throw new Error('ANT tracking failed');
  });
}

// ============================================================================
// OBSERVABILITY
// ============================================================================

async function validateObservability(): Promise<void> {
  console.log(`\n${CYAN}━━━ Observability ━━━${NC}`);

  await runValidation('Observability', 'Get snapshot', async () => {
    const { observabilityHub } = await import('../src/services/observability/hub.js');

    const snapshot = observabilityHub.getSnapshot(5);

    if (typeof snapshot.overallHealth !== 'number') {
      throw new Error('Snapshot incomplete');
    }

    console.log(`\n    Overall Health: ${snapshot.overallHealth}%`);
    console.log(`    LLM Health: ${snapshot.llmHealth}%`);
    console.log(
      `    Alerts: ${snapshot.criticalAlerts} critical, ${snapshot.warningAlerts} warning`
    );
  });
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

async function validateFeatureFlags(): Promise<void> {
  console.log(`\n${CYAN}━━━ Feature Flags ━━━${NC}`);

  await runValidation('Flags', 'Get feature flags', async () => {
    const { getFeatureFlags } = await import('../src/services/feature-flags.js');

    const flags = getFeatureFlags();
    const allFlags = flags.getAllFlags();
    const count = Object.keys(allFlags).length;

    if (count === 0) throw new Error('No feature flags loaded');
    console.log(`\n    Loaded ${count} feature flags`);
  });

  await runValidation('Flags', 'Feature rollout presets', async () => {
    const { ROLLOUT_PRESETS } = await import('../src/services/feature-rollout.js');

    if (!ROLLOUT_PRESETS.standard || !ROLLOUT_PRESETS.conservative) {
      throw new Error('Rollout presets not available');
    }
  });
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

async function validateSessionManagement(): Promise<void> {
  console.log(`\n${CYAN}━━━ Session Management ━━━${NC}`);

  const testUserId = `session-validate-${Date.now()}`;
  const testSessionId = `session-${Date.now()}`;

  await runValidation('Session', 'Create session', async () => {
    const { createSessionServices } = await import('../src/services/index.js');

    const session = await createSessionServices({
      userId: testUserId,
      sessionId: testSessionId,
      personaId: 'ferni',
    });

    if (!session) throw new Error('Session not created');
  });

  await runValidation('Session', 'Get active sessions', async () => {
    const { getActiveSessionCount, getActiveSessionIds } =
      await import('../src/services/session-manager.js');

    const count = getActiveSessionCount();
    const ids = getActiveSessionIds();

    console.log(`\n    Active sessions: ${count}`);
    if (count > 0) {
      console.log(`    Session IDs: ${ids.slice(0, 3).join(', ')}${ids.length > 3 ? '...' : ''}`);
    }
  });
}

// ============================================================================
// CLEANUP
// ============================================================================

async function cleanup(): Promise<void> {
  console.log(`\n${CYAN}━━━ Cleanup ━━━${NC}`);

  await runValidation('Cleanup', 'Reset global services', async () => {
    const { resetGlobalServices } = await import('../src/services/index.js');
    await resetGlobalServices();
  });
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log(`\n${CYAN}╔════════════════════════════════════════════════════════════╗${NC}`);
  console.log(`${CYAN}║            Services Validation Suite                        ║${NC}`);
  console.log(`${CYAN}╚════════════════════════════════════════════════════════════╝${NC}`);

  const startTime = Date.now();

  // Run all validations
  await validateServicesInit();
  await validateHealthChecks();
  await validateTrustSystems();
  await validateOutreachSystem();
  await validateTherapeuticFrameworks();
  await validateCognitiveIntelligence();
  await validateObservability();
  await validateFeatureFlags();
  await validateSessionManagement();
  await cleanup();

  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\n${CYAN}━━━ Summary ━━━${NC}`);
  console.log(`  Total validations: ${results.length}`);
  console.log(`  ${GREEN}Passed: ${passed}${NC}`);

  if (failed > 0) {
    console.log(`  ${RED}Failed: ${failed}${NC}`);
    console.log(`\n${RED}Failed validations:${NC}`);
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ${RED}✗ [${r.category}] ${r.test}: ${r.message}${NC}`);
    }
  }

  console.log(`  Duration: ${totalDuration}ms`);

  // By category
  const categories = [...new Set(results.map((r) => r.category))];
  console.log(`\n${CYAN}By Category:${NC}`);
  for (const cat of categories) {
    const catResults = results.filter((r) => r.category === cat);
    const catPassed = catResults.filter((r) => r.passed).length;
    const status = catPassed === catResults.length ? GREEN + '✓' : RED + '✗';
    console.log(`  ${status} ${cat}: ${catPassed}/${catResults.length}${NC}`);
  }

  // Exit
  if (failed > 0) {
    console.log(`\n${RED}❌ Services validation failed${NC}\n`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}✅ All services validated successfully!${NC}\n`);
    process.exit(0);
  }
}

main().catch((error) => {
  console.error(`${RED}Fatal error: ${error}${NC}`);
  process.exit(1);
});
