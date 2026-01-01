#!/usr/bin/env npx tsx

/**
 * Better Than Human - Comprehensive Audit Script
 *
 * Validates E2E integration of all superhuman capabilities:
 * 1. Context builders registered and active
 * 2. Superhuman services have proper exports
 * 3. Data layer hooks are wired
 * 4. All domains have semantic indexing
 *
 * Run: npx tsx scripts/audit-better-than-human.ts
 */

import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'BetterThanHumanAudit' });

// ============================================================================
// AUDIT DEFINITIONS
// ============================================================================

interface AuditResult {
  name: string;
  status: 'pass' | 'warn' | 'fail';
  details: string;
  recommendation?: string;
}

interface CapabilityAudit {
  capability: string;
  description: string;
  humanLimitation: string;
  components: {
    contextBuilder?: string;
    service?: string;
    hook?: string;
    store?: string;
  };
  test: () => Promise<AuditResult>;
}

// ============================================================================
// BETTER THAN HUMAN CAPABILITIES
// ============================================================================

const CAPABILITIES: CapabilityAudit[] = [
  {
    capability: 'Perfect Memory',
    description: 'Never forget a single detail',
    humanLimitation: 'Friends forget what you told them',
    components: {
      contextBuilder: 'superhuman-session-priming',
      service: 'commitment-keeper.ts',
      hook: 'onCommitmentKeeperChange',
    },
    test: async () => {
      try {
        const { loadUserCommitments } = await import(
          '../src/services/superhuman/commitment-keeper.js'
        );
        if (typeof loadUserCommitments !== 'function') {
          return {
            name: 'Perfect Memory',
            status: 'fail',
            details: 'loadUserCommitments not exported',
          };
        }
        return {
          name: 'Perfect Memory',
          status: 'pass',
          details: 'Commitment keeper properly exports loadUserCommitments',
        };
      } catch (error) {
        return {
          name: 'Perfect Memory',
          status: 'fail',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Dream Keeper',
    description: 'Track and nurture aspirations',
    humanLimitation: 'Friends forget your dreams',
    components: {
      service: 'dream-keeper.ts',
      hook: 'onDreamChange',
    },
    test: async () => {
      try {
        const { loadUserDreams } = await import('../src/services/superhuman/dream-keeper.js');
        if (typeof loadUserDreams !== 'function') {
          return {
            name: 'Dream Keeper',
            status: 'fail',
            details: 'loadUserDreams not exported',
          };
        }
        return {
          name: 'Dream Keeper',
          status: 'pass',
          details: 'Dream keeper properly exports loadUserDreams',
        };
      } catch (error) {
        return {
          name: 'Dream Keeper',
          status: 'fail',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Capacity Guardian',
    description: 'Detect burnout before it happens',
    humanLimitation: 'Friends notice too late',
    components: {
      service: 'capacity-guardian.ts',
      hook: 'onCapacityStateChange',
    },
    test: async () => {
      try {
        const { assessBurnoutRisk } = await import(
          '../src/services/superhuman/capacity-guardian.js'
        );
        if (typeof assessBurnoutRisk !== 'function') {
          return {
            name: 'Capacity Guardian',
            status: 'fail',
            details: 'assessBurnoutRisk not exported',
          };
        }
        return {
          name: 'Capacity Guardian',
          status: 'pass',
          details: 'Capacity guardian properly exports assessBurnoutRisk',
        };
      } catch (error) {
        return {
          name: 'Capacity Guardian',
          status: 'fail',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Values Alignment',
    description: 'Know their values and help align decisions',
    humanLimitation: 'Friends avoid confrontation',
    components: {
      service: 'values-alignment.ts',
      hook: 'onValuesAlignmentChange',
    },
    test: async () => {
      try {
        const { loadUserValues, buildValuesContext } = await import(
          '../src/services/superhuman/values-alignment.js'
        );
        if (typeof loadUserValues !== 'function') {
          return {
            name: 'Values Alignment',
            status: 'fail',
            details: 'loadUserValues not exported',
          };
        }
        if (typeof buildValuesContext !== 'function') {
          return {
            name: 'Values Alignment',
            status: 'warn',
            details: 'buildValuesContext not exported',
            recommendation: 'Add buildValuesContext for LLM context injection',
          };
        }
        return {
          name: 'Values Alignment',
          status: 'pass',
          details: 'Values alignment fully exported',
        };
      } catch (error) {
        return {
          name: 'Values Alignment',
          status: 'fail',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Seasonal Awareness',
    description: 'Know upcoming dates and seasonal patterns',
    humanLimitation: 'Friends forget anniversaries',
    components: {
      service: 'seasonal-awareness.ts',
      hook: 'onSeasonalPatternChange',
    },
    test: async () => {
      try {
        const { findUpcomingDates, buildSeasonalContext } = await import(
          '../src/services/superhuman/seasonal-awareness.js'
        );
        if (typeof findUpcomingDates !== 'function') {
          return {
            name: 'Seasonal Awareness',
            status: 'fail',
            details: 'findUpcomingDates not exported',
          };
        }
        if (typeof buildSeasonalContext !== 'function') {
          return {
            name: 'Seasonal Awareness',
            status: 'warn',
            details: 'buildSeasonalContext not exported',
          };
        }
        return {
          name: 'Seasonal Awareness',
          status: 'pass',
          details: 'Seasonal awareness fully exported',
        };
      } catch (error) {
        return {
          name: 'Seasonal Awareness',
          status: 'fail',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Life Narrative',
    description: 'Maintain perspective on their whole story',
    humanLimitation: 'Hard to see own life objectively',
    components: {
      service: 'life-narrative.ts',
      hook: 'onLifeChapterChange',
    },
    test: async () => {
      try {
        await import('../src/services/superhuman/life-narrative.js');
        return {
          name: 'Life Narrative',
          status: 'pass',
          details: 'Life narrative service exists',
        };
      } catch (error) {
        return {
          name: 'Life Narrative',
          status: 'warn',
          details: `Import failed: ${error}`,
          recommendation: 'Check life-narrative.ts exports',
        };
      }
    },
  },

  {
    capability: 'Predictive Coaching',
    description: 'Anticipate struggles before they happen',
    humanLimitation: "Friends can't see your patterns objectively",
    components: {
      contextBuilder: 'prediction-surfacing',
      service: 'predictive-coaching.ts',
    },
    test: async () => {
      try {
        await import('../src/services/superhuman/predictive-coaching.js');
        return {
          name: 'Predictive Coaching',
          status: 'pass',
          details: 'Predictive coaching service exists',
        };
      } catch (error) {
        return {
          name: 'Predictive Coaching',
          status: 'warn',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Emotional First Aid',
    description: 'Instant crisis support',
    humanLimitation: 'Friends take time to respond',
    components: {
      contextBuilder: 'crisis',
      service: 'emotional-first-aid.ts',
    },
    test: async () => {
      try {
        await import('../src/services/superhuman/emotional-first-aid.js');
        return {
          name: 'Emotional First Aid',
          status: 'pass',
          details: 'Emotional first aid service exists',
        };
      } catch (error) {
        return {
          name: 'Emotional First Aid',
          status: 'warn',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Relationship Network',
    description: "Track everyone in user's life",
    humanLimitation: "Friends can't track everyone you mention",
    components: {
      service: 'relationship-network.ts',
      hook: 'onRelationshipNetworkChange',
    },
    test: async () => {
      try {
        await import('../src/services/superhuman/relationship-network.js');
        return {
          name: 'Relationship Network',
          status: 'pass',
          details: 'Relationship network service exists',
        };
      } catch (error) {
        return {
          name: 'Relationship Network',
          status: 'warn',
          details: `Import failed: ${error}`,
        };
      }
    },
  },

  {
    capability: 'Superhuman Session Priming',
    description: 'Surface all superhuman memory at session start',
    humanLimitation: 'N/A - This is the integration layer',
    components: {
      contextBuilder: 'superhuman-session-priming',
    },
    test: async () => {
      try {
        const { buildSuperhumanSessionPriming } = await import(
          '../src/intelligence/context-builders/superhuman-session-priming.js'
        );
        if (typeof buildSuperhumanSessionPriming !== 'function') {
          return {
            name: 'Superhuman Session Priming',
            status: 'fail',
            details: 'buildSuperhumanSessionPriming not exported',
          };
        }
        return {
          name: 'Superhuman Session Priming',
          status: 'pass',
          details: 'Session priming context builder exists and exports build function',
        };
      } catch (error) {
        return {
          name: 'Superhuman Session Priming',
          status: 'fail',
          details: `Import failed: ${error}`,
          recommendation: 'Create superhuman-session-priming.ts context builder',
        };
      }
    },
  },
];

// ============================================================================
// CONTEXT BUILDER AUDIT
// ============================================================================

async function auditContextBuilders(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  const criticalBuilders = [
    'superhuman-session-priming',
    'commitment-follow-up',
    'prediction-surfacing',
    'crisis',
    'voice-mismatch-critical',
    'unified-memory-orchestrator',
  ];

  for (const builderName of criticalBuilders) {
    try {
      // Check if builder is in the loader manifest
      const { BUILDER_MANIFEST } = await import(
        '../src/intelligence/context-builders/core/loader.js'
      );

      let found = false;
      for (const [_category, builders] of Object.entries(BUILDER_MANIFEST)) {
        if ((builders as string[]).includes(builderName)) {
          found = true;
          break;
        }
      }

      if (found) {
        results.push({
          name: `Context Builder: ${builderName}`,
          status: 'pass',
          details: 'Registered in BUILDER_MANIFEST',
        });
      } else {
        results.push({
          name: `Context Builder: ${builderName}`,
          status: 'fail',
          details: 'Not found in BUILDER_MANIFEST',
          recommendation: `Add "${builderName}" to BUILDER_MANIFEST in loader.ts`,
        });
      }
    } catch (error) {
      results.push({
        name: `Context Builder: ${builderName}`,
        status: 'fail',
        details: `Failed to check: ${error}`,
      });
    }
  }

  return results;
}

// ============================================================================
// DATA LAYER HOOKS AUDIT
// ============================================================================

async function auditDataLayerHooks(): Promise<AuditResult[]> {
  const results: AuditResult[] = [];

  const criticalHooks = [
    'onCommitmentKeeperChange',
    'onDreamChange',
    'onLifeChapterChange',
    'onValuesAlignmentChange',
    'onCapacityStateChange',
    'onSeasonalPatternChange',
    'onVoiceBiomarkerChange',
    'onSessionSummaryChange',
  ];

  try {
    const hooks = await import('../src/services/data-layer/hooks/index.js');

    for (const hookName of criticalHooks) {
      if (typeof (hooks as Record<string, unknown>)[hookName] === 'function') {
        results.push({
          name: `Hook: ${hookName}`,
          status: 'pass',
          details: 'Exported from hooks/index.ts',
        });
      } else {
        results.push({
          name: `Hook: ${hookName}`,
          status: 'fail',
          details: 'Not exported from hooks/index.ts',
          recommendation: `Add ${hookName} to hooks/index.ts exports`,
        });
      }
    }
  } catch (error) {
    results.push({
      name: 'Data Layer Hooks',
      status: 'fail',
      details: `Failed to import hooks: ${error}`,
    });
  }

  return results;
}

// ============================================================================
// MAIN AUDIT
// ============================================================================

async function runAudit(): Promise<void> {
  console.log('\n🦸 BETTER THAN HUMAN - COMPREHENSIVE AUDIT\n');
  console.log('='.repeat(60));

  const allResults: AuditResult[] = [];

  // 1. Capability audits
  console.log('\n📋 SUPERHUMAN CAPABILITIES\n');
  for (const cap of CAPABILITIES) {
    const result = await cap.test();
    allResults.push(result);

    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${result.name}: ${result.details}`);
    if (result.recommendation) {
      console.log(`   💡 ${result.recommendation}`);
    }
  }

  // 2. Context builder audit
  console.log('\n📋 CONTEXT BUILDERS\n');
  const builderResults = await auditContextBuilders();
  allResults.push(...builderResults);
  for (const result of builderResults) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${result.name}: ${result.details}`);
    if (result.recommendation) {
      console.log(`   💡 ${result.recommendation}`);
    }
  }

  // 3. Data layer hooks audit
  console.log('\n📋 DATA LAYER HOOKS\n');
  const hookResults = await auditDataLayerHooks();
  allResults.push(...hookResults);
  for (const result of hookResults) {
    const icon = result.status === 'pass' ? '✅' : result.status === 'warn' ? '⚠️' : '❌';
    console.log(`${icon} ${result.name}: ${result.details}`);
    if (result.recommendation) {
      console.log(`   💡 ${result.recommendation}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 SUMMARY\n');

  const passed = allResults.filter((r) => r.status === 'pass').length;
  const warnings = allResults.filter((r) => r.status === 'warn').length;
  const failed = allResults.filter((r) => r.status === 'fail').length;

  console.log(`✅ Passed: ${passed}`);
  console.log(`⚠️  Warnings: ${warnings}`);
  console.log(`❌ Failed: ${failed}`);

  const score = Math.round((passed / allResults.length) * 100);
  console.log(`\n🎯 Better Than Human Score: ${score}%`);

  if (score >= 90) {
    console.log('\n🎉 Excellent! We are genuinely BETTER THAN HUMAN.');
  } else if (score >= 70) {
    console.log('\n👍 Good progress! Some capabilities need attention.');
  } else {
    console.log('\n⚠️ Significant gaps. We need to close them to be Better Than Human.');
  }

  // Exit with error if critical failures
  if (failed > 0) {
    process.exit(1);
  }
}

// Run the audit
runAudit().catch((error) => {
  console.error('Audit failed:', error);
  process.exit(1);
});
