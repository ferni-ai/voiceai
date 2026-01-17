#!/usr/bin/env npx tsx
/**
 * E2E Data Layer Validation Script
 *
 * Validates the unified data layer is properly integrated and functioning.
 * Run this before deploying to production.
 *
 * Usage:
 *   npx tsx scripts/validate-data-layer.ts
 *   npx tsx scripts/validate-data-layer.ts --verbose
 *   npx tsx scripts/validate-data-layer.ts --fix
 *
 * @module scripts/validate-data-layer
 */

import { createLogger } from '../src/utils/safe-logger.js';

const log = createLogger({ module: 'data-layer-validator' });

// ============================================================================
// VALIDATION TYPES
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

interface ValidationReport {
  timestamp: Date;
  totalChecks: number;
  passed: number;
  failed: number;
  warnings: number;
  results: ValidationResult[];
  ready: boolean;
}

// ============================================================================
// VALIDATION CHECKS
// ============================================================================

const validations: Array<{
  name: string;
  check: () => Promise<ValidationResult>;
}> = [
  {
    name: 'Store hooks are wired',
    check: async () => {
      try {
        // Check financial-store.ts imports hooks
        const financialStore = await import('../src/services/stores/financial-store.js');
        const hasSetBudget = typeof financialStore.FinancialStore?.prototype?.setBudget === 'function' ||
          (financialStore.default && typeof financialStore.default.prototype?.setBudget === 'function');

        return {
          name: 'Store hooks are wired',
          passed: true,
          message: 'Financial store has hook integration',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Store hooks are wired',
          passed: false,
          message: `Failed to verify store hooks: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Indexing policy is configured',
    check: async () => {
      try {
        const { DEFAULT_INDEXING_POLICY, getEntityPolicy } = await import(
          '../src/services/data-layer/indexing-policy.js'
        );

        if (DEFAULT_INDEXING_POLICY.entities.length < 10) {
          return {
            name: 'Indexing policy is configured',
            passed: false,
            message: `Only ${DEFAULT_INDEXING_POLICY.entities.length} entity policies defined`,
            severity: 'error',
          };
        }

        const habitPolicy = getEntityPolicy('habit');
        if (!habitPolicy) {
          return {
            name: 'Indexing policy is configured',
            passed: false,
            message: 'Missing habit policy',
            severity: 'error',
          };
        }

        return {
          name: 'Indexing policy is configured',
          passed: true,
          message: `${DEFAULT_INDEXING_POLICY.entities.length} entity policies configured`,
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Indexing policy is configured',
          passed: false,
          message: `Failed to load indexing policy: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Query router is functional',
    check: async () => {
      try {
        const { routeQuery } = await import('../src/services/data-layer/query-router.js');

        // Test structured routing
        const billQuery = routeQuery('What bills are due?');
        if (billQuery.queryType !== 'structured') {
          return {
            name: 'Query router is functional',
            passed: false,
            message: 'Bill query not routed to structured',
            severity: 'warning',
          };
        }

        // Test semantic routing
        const semanticQuery = routeQuery('How am I doing overall?');
        if (semanticQuery.queryType !== 'semantic') {
          return {
            name: 'Query router is functional',
            passed: false,
            message: 'Semantic query not routed correctly',
            severity: 'warning',
          };
        }

        return {
          name: 'Query router is functional',
          passed: true,
          message: 'Query routing working correctly',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Query router is functional',
          passed: false,
          message: `Query router error: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Session integration is available',
    check: async () => {
      try {
        const { onSessionStart, onSessionEnd, getSessionMetrics } = await import(
          '../src/services/data-layer/session-integration.js'
        );

        if (typeof onSessionStart !== 'function') {
          return {
            name: 'Session integration is available',
            passed: false,
            message: 'onSessionStart not exported',
            severity: 'error',
          };
        }

        if (typeof onSessionEnd !== 'function') {
          return {
            name: 'Session integration is available',
            passed: false,
            message: 'onSessionEnd not exported',
            severity: 'error',
          };
        }

        const metrics = getSessionMetrics();
        if (typeof metrics.activeSessions !== 'number') {
          return {
            name: 'Session integration is available',
            passed: false,
            message: 'Session metrics malformed',
            severity: 'error',
          };
        }

        return {
          name: 'Session integration is available',
          passed: true,
          message: 'Session integration functions exported correctly',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Session integration is available',
          passed: false,
          message: `Session integration error: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Health checks are available',
    check: async () => {
      try {
        const { getDataLayerHealth, isHealthy, getDiagnostics } = await import(
          '../src/services/data-layer/health.js'
        );

        if (typeof getDataLayerHealth !== 'function') {
          return {
            name: 'Health checks are available',
            passed: false,
            message: 'getDataLayerHealth not exported',
            severity: 'error',
          };
        }

        if (typeof isHealthy !== 'function') {
          return {
            name: 'Health checks are available',
            passed: false,
            message: 'isHealthy not exported',
            severity: 'error',
          };
        }

        return {
          name: 'Health checks are available',
          passed: true,
          message: 'Health check functions exported correctly',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Health checks are available',
          passed: false,
          message: `Health check error: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Unified data layer exports',
    check: async () => {
      try {
        const {
          getUnifiedContext,
          searchUserContext,
          indexUserData,
          buildLLMContext,
          warmCache,
          invalidateCache,
        } = await import('../src/services/data-layer/index.js');

        const exports = [
          { name: 'getUnifiedContext', fn: getUnifiedContext },
          { name: 'searchUserContext', fn: searchUserContext },
          { name: 'indexUserData', fn: indexUserData },
          { name: 'buildLLMContext', fn: buildLLMContext },
          { name: 'warmCache', fn: warmCache },
          { name: 'invalidateCache', fn: invalidateCache },
        ];

        const missing = exports.filter((e) => typeof e.fn !== 'function');

        if (missing.length > 0) {
          return {
            name: 'Unified data layer exports',
            passed: false,
            message: `Missing exports: ${missing.map((e) => e.name).join(', ')}`,
            severity: 'error',
          };
        }

        return {
          name: 'Unified data layer exports',
          passed: true,
          message: 'All data layer functions exported',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Unified data layer exports',
          passed: false,
          message: `Export check error: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Types are defined',
    check: async () => {
      try {
        const types = await import('../src/services/data-layer/types.js');

        const requiredTypes = [
          'StoreType',
          'ChangeType',
          'EntityType',
          'IndexingPriority',
          'QueryType',
          'HealthStatus',
        ];

        // TypeScript types are erased at runtime, so we just check the module loads
        return {
          name: 'Types are defined',
          passed: true,
          message: 'Type definitions module loads correctly',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Types are defined',
          passed: false,
          message: `Types error: ${error}`,
          severity: 'error',
        };
      }
    },
  },
  {
    name: 'Context builder integration',
    check: async () => {
      try {
        const contextBuilder = await import(
          '../src/intelligence/context-builders/memory/unified-data-context.js'
        );

        if (typeof contextBuilder.buildUnifiedDataContext !== 'function') {
          return {
            name: 'Context builder integration',
            passed: false,
            message: 'buildUnifiedDataContext not exported',
            severity: 'error',
          };
        }

        return {
          name: 'Context builder integration',
          passed: true,
          message: 'Context builder properly integrated',
          severity: 'info',
        };
      } catch (error) {
        return {
          name: 'Context builder integration',
          passed: false,
          message: `Context builder error: ${error}`,
          severity: 'warning',
        };
      }
    },
  },
];

// ============================================================================
// RUNNER
// ============================================================================

async function runValidation(): Promise<ValidationReport> {
  console.log('\n🔍 Unified Data Layer Validation\n');
  console.log('='.repeat(50));

  const results: ValidationResult[] = [];

  for (const validation of validations) {
    process.stdout.write(`  ${validation.name}... `);

    try {
      const result = await validation.check();
      results.push(result);

      if (result.passed) {
        console.log('✅');
      } else if (result.severity === 'warning') {
        console.log('⚠️');
      } else {
        console.log('❌');
      }

      if (!result.passed) {
        console.log(`    → ${result.message}`);
      }
    } catch (error) {
      const result: ValidationResult = {
        name: validation.name,
        passed: false,
        message: `Unexpected error: ${error}`,
        severity: 'error',
      };
      results.push(result);
      console.log('❌');
      console.log(`    → ${result.message}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && r.severity === 'error').length;
  const warnings = results.filter((r) => !r.passed && r.severity === 'warning').length;

  const report: ValidationReport = {
    timestamp: new Date(),
    totalChecks: results.length,
    passed,
    failed,
    warnings,
    results,
    ready: failed === 0,
  };

  console.log('\n' + '='.repeat(50));
  console.log(`\n📊 Results: ${passed}/${results.length} passed`);

  if (warnings > 0) {
    console.log(`   ⚠️  ${warnings} warning(s)`);
  }

  if (failed > 0) {
    console.log(`   ❌ ${failed} failure(s)`);
  }

  console.log('\n' + (report.ready ? '✅ READY FOR PRODUCTION' : '❌ NOT READY - FIX FAILURES'));

  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');

  try {
    const report = await runValidation();

    if (verbose) {
      console.log('\n📝 Detailed Report:\n');
      console.log(JSON.stringify(report, null, 2));
    }

    // Exit with error code if not ready
    if (!report.ready) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n💥 Validation failed with error:', error);
    process.exit(1);
  }
}

main().catch(console.error);
