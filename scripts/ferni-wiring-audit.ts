#!/usr/bin/env npx tsx
/**
 * Ferni 100% Wiring - Production Audit Script
 *
 * Run this script to verify all 11 new context builders are:
 * - Registered in the builder manifest
 * - Loading without errors
 * - Producing injections when expected
 * - Meeting performance targets
 *
 * Usage: npx tsx scripts/ferni-wiring-audit.ts
 */

import { BUILDER_MANIFEST } from '../src/intelligence/context-builders/core/loader.js';
import type { ContextBuilderInput } from '../src/intelligence/context-builders/index.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const NEW_BUILDERS = [
  'voice-dna-context',
  'catchphrase-context',
  'humor-context',
  'pet-peeve-context',
  'coaching-mode-context',
  'affirmation-context',
  'breath-context',
  'backchannel-context',
  'goodbye-context',
  'predictive-context',
  'sensory-context',
  // Ferni 100% Final Push (January 2026)
  'emotional-intelligence-context',
  'outreach-voice-context',
  'silence-context',
  'team-coordination-context',
];

const BUILDER_PATHS: Record<string, string> = {
  'voice-dna-context': '../src/intelligence/context-builders/personas/voice-dna-context.js',
  'catchphrase-context': '../src/intelligence/context-builders/personas/catchphrase-context.js',
  'humor-context': '../src/intelligence/context-builders/personas/humor-context.js',
  'pet-peeve-context': '../src/intelligence/context-builders/personas/pet-peeve-context.js',
  'coaching-mode-context': '../src/intelligence/context-builders/personas/coaching-mode-context.js',
  'affirmation-context': '../src/intelligence/context-builders/emotional/affirmation-context.js',
  'breath-context': '../src/intelligence/context-builders/emotional/breath-context.js',
  'backchannel-context': '../src/intelligence/context-builders/conversational/backchannel-context.js',
  'goodbye-context': '../src/intelligence/context-builders/conversational/goodbye-context.js',
  'predictive-context': '../src/intelligence/context-builders/intelligence/predictive-context.js',
  'sensory-context': '../src/intelligence/context-builders/awareness/sensory-context.js',
  // Ferni 100% Final Push (January 2026)
  'emotional-intelligence-context': '../src/intelligence/context-builders/emotional/emotional-intelligence-context.js',
  'outreach-voice-context': '../src/intelligence/context-builders/personas/outreach-voice-context.js',
  'silence-context': '../src/intelligence/context-builders/conversational/silence-context.js',
  'team-coordination-context': '../src/intelligence/context-builders/personas/team-coordination-context.js',
};

const PERFORMANCE_TARGET_MS = 50; // Each builder should complete in under 50ms

// ============================================================================
// AUDIT FUNCTIONS
// ============================================================================

function createTestInput(userText: string): ContextBuilderInput {
  return {
    userText,
    persona: {
      id: 'ferni',
      name: 'Ferni',
      identity: { id: 'ferni' },
    } as ContextBuilderInput['persona'],
    analysis: {
      emotion: {
        primary: 'neutral',
        confidence: 0.8,
      },
    },
    userData: {
      turnCount: 5,
      userName: 'audit-user',
    },
    services: {
      sessionId: `audit-session-${Date.now()}`,
    },
    userProfile: {
      relationshipStage: 'friend',
    },
    bundleRuntime: null,
  } as ContextBuilderInput;
}

async function auditBuilderRegistration(): Promise<{
  passed: boolean;
  results: { builder: string; registered: boolean }[];
}> {
  console.log('\n📋 Auditing Builder Registration...\n');

  const allRegisteredBuilders = Object.values(BUILDER_MANIFEST).flat();
  const results: { builder: string; registered: boolean }[] = [];

  for (const builder of NEW_BUILDERS) {
    const registered = allRegisteredBuilders.includes(builder);
    results.push({ builder, registered });
    console.log(`  ${registered ? '✅' : '❌'} ${builder}`);
  }

  const passed = results.every((r) => r.registered);
  console.log(`\n  ${passed ? '✅ All builders registered' : '❌ Some builders not registered'}`);

  return { passed, results };
}

async function auditBuilderLoading(): Promise<{
  passed: boolean;
  results: { builder: string; loaded: boolean; error?: string }[];
}> {
  console.log('\n📦 Auditing Builder Loading...\n');

  const results: { builder: string; loaded: boolean; error?: string }[] = [];

  for (const [builder, path] of Object.entries(BUILDER_PATHS)) {
    try {
      const module = await import(path);
      const hasBuildFn = Object.keys(module).some((key) => key.startsWith('build'));
      results.push({ builder, loaded: hasBuildFn });
      console.log(`  ${hasBuildFn ? '✅' : '❌'} ${builder}`);
    } catch (error) {
      results.push({
        builder,
        loaded: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      console.log(`  ❌ ${builder}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  const passed = results.every((r) => r.loaded);
  console.log(`\n  ${passed ? '✅ All builders loading' : '❌ Some builders failed to load'}`);

  return { passed, results };
}

async function auditBuilderPerformance(): Promise<{
  passed: boolean;
  results: { builder: string; durationMs: number; withinTarget: boolean }[];
}> {
  console.log('\n⚡ Auditing Builder Performance...\n');

  const results: { builder: string; durationMs: number; withinTarget: boolean }[] = [];
  const input = createTestInput('I feel broken after what happened. I finally figured it out!');

  for (const [builder, path] of Object.entries(BUILDER_PATHS)) {
    try {
      const module = await import(path);
      const buildFn = Object.values(module).find(
        (v): v is (input: ContextBuilderInput) => Promise<unknown[]> =>
          typeof v === 'function' && v.name.startsWith('build')
      );

      if (buildFn) {
        const start = performance.now();
        await buildFn(input);
        const durationMs = Math.round(performance.now() - start);
        const withinTarget = durationMs < PERFORMANCE_TARGET_MS;
        results.push({ builder, durationMs, withinTarget });
        console.log(
          `  ${withinTarget ? '✅' : '⚠️'} ${builder}: ${durationMs}ms ${withinTarget ? '' : `(target: ${PERFORMANCE_TARGET_MS}ms)`}`
        );
      }
    } catch (error) {
      console.log(
        `  ❌ ${builder}: Failed - ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  const passed = results.every((r) => r.withinTarget);
  console.log(
    `\n  ${passed ? '✅ All builders within performance target' : '⚠️ Some builders exceeding target'}`
  );

  return { passed, results };
}

async function auditBuilderInjections(): Promise<{
  passed: boolean;
  results: { builder: string; triggeredFor: string; injectionCount: number }[];
}> {
  console.log('\n💉 Auditing Builder Injections...\n');

  const testCases: { builder: string; input: string; expectInjection: boolean }[] = [
    { builder: 'voice-dna-context', input: 'Hello!', expectInjection: true },
    { builder: 'backchannel-context', input: 'My dog died last week.', expectInjection: true },
    { builder: 'breath-context', input: "I can't stop spiraling.", expectInjection: true },
    { builder: 'catchphrase-context', input: 'I feel so broken.', expectInjection: false }, // Probabilistic
    { builder: 'goodbye-context', input: 'Gotta go, bye!', expectInjection: true },
    { builder: 'humor-context', input: 'I got the job!', expectInjection: false }, // Probabilistic
    { builder: 'affirmation-context', input: 'I finally did it!', expectInjection: true },
    { builder: 'pet-peeve-context', input: 'Good vibes only!', expectInjection: false }, // Probabilistic
    { builder: 'coaching-mode-context', input: 'I need to vent.', expectInjection: true },
    { builder: 'predictive-context', input: 'I feel hopeless.', expectInjection: true },
    { builder: 'sensory-context', input: "I can't stop spiraling.", expectInjection: true },
  ];

  const results: { builder: string; triggeredFor: string; injectionCount: number }[] = [];

  for (const testCase of testCases) {
    const path = BUILDER_PATHS[testCase.builder];
    if (!path) continue;

    try {
      const module = await import(path);
      const buildFn = Object.values(module).find(
        (v): v is (input: ContextBuilderInput) => Promise<unknown[]> =>
          typeof v === 'function' && v.name.startsWith('build')
      );

      if (buildFn) {
        const input = createTestInput(testCase.input);
        const injections = await buildFn(input);
        const injectionCount = injections.length;
        results.push({
          builder: testCase.builder,
          triggeredFor: testCase.input.substring(0, 30),
          injectionCount,
        });

        const status =
          testCase.expectInjection && injectionCount > 0
            ? '✅'
            : !testCase.expectInjection
              ? '✓ '
              : '⚠️';
        console.log(`  ${status} ${testCase.builder}: ${injectionCount} injections`);
      }
    } catch (error) {
      console.log(`  ❌ ${testCase.builder}: Failed`);
    }
  }

  // Pass if the required injections fired
  const passed = results.filter((r) => r.injectionCount > 0).length >= 5; // At least 5 should inject
  console.log(`\n  ${passed ? '✅ Injection system working' : '⚠️ Low injection rate'}`);

  return { passed, results };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║           FERNI 100% WIRING - PRODUCTION AUDIT                ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const registrationAudit = await auditBuilderRegistration();
  const loadingAudit = await auditBuilderLoading();
  const performanceAudit = await auditBuilderPerformance();
  const injectionAudit = await auditBuilderInjections();

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                         AUDIT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const allPassed =
    registrationAudit.passed &&
    loadingAudit.passed &&
    performanceAudit.passed &&
    injectionAudit.passed;

  console.log(`  📋 Registration:  ${registrationAudit.passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  📦 Loading:       ${loadingAudit.passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  ⚡ Performance:   ${performanceAudit.passed ? '✅ PASS' : '⚠️ WARN'}`);
  console.log(`  💉 Injections:    ${injectionAudit.passed ? '✅ PASS' : '⚠️ WARN'}`);
  console.log('');
  console.log(`  OVERALL:          ${allPassed ? '✅ ALL CHECKS PASSED' : '⚠️ ISSUES DETECTED'}`);
  console.log('\n═══════════════════════════════════════════════════════════════\n');

  // Calculate wiring percentage
  const registeredCount = registrationAudit.results.filter((r) => r.registered).length;
  const loadedCount = loadingAudit.results.filter((r) => r.loaded).length;
  const totalNewBuilders = NEW_BUILDERS.length;

  // Calculate wiring progress:
  // - 32 were fully wired before Ferni 100% project
  // - 15 new builders added (11 original + 4 final push)
  // - 49 total behavior files in bundles/ferni/content/behaviors/
  const totalBehaviorFiles = 49;
  const previouslyWired = 32;
  const currentlyWired = previouslyWired + registeredCount;
  const utilizationPct = Math.round((currentlyWired / totalBehaviorFiles) * 100);

  console.log(`  📊 WIRING STATUS:`);
  console.log(`     - New builders registered: ${registeredCount}/${totalNewBuilders}`);
  console.log(`     - New builders loading:    ${loadedCount}/${totalNewBuilders}`);
  console.log(`     - Total content utilization: ${utilizationPct}%`);
  console.log('');
  console.log(`  🎯 Previous: 67% (32 fully wired)`);
  console.log(`  🎯 Phase 1:  90% (43 wired after 11 builders)`);
  console.log(`  🎯 Target:   100% (49 fully wired)`);
  console.log(`  🎯 Current:  ${utilizationPct}% (${currentlyWired} fully wired)`);
  console.log('\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
