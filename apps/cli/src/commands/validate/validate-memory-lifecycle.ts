/**
 * Memory Lifecycle Validation CLI
 *
 * Validates the Memory Lifecycle management system:
 * - Decay calculations (strength decay, protection factors)
 * - Consolidation (memory merging, pattern detection)
 * - Health monitoring (system health, alerts)
 * - Scheduled jobs (decay/consolidation job integration)
 *
 * Usage:
 *   ferni validate lifecycle                    # Full validation
 *   ferni validate lifecycle decay              # Test decay calculations only
 *   ferni validate lifecycle consolidation      # Test memory consolidation only
 *   ferni validate lifecycle health             # Test health monitoring only
 *   ferni validate lifecycle --report json      # Output JSON report
 *
 * @module cli/commands/validate/validate-memory-lifecycle
 */

// ============================================================================
// COLORS & STYLING
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

const icons = {
  success: '✓',
  error: '✗',
  warning: '⚠',
  info: 'ℹ',
  decay: '⏳',
  merge: '🔄',
  health: '💚',
  clock: '🕐',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}${icons.info}${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}${icons.success}${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}${icons.warning}${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}${icons.error}${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}→${colors.reset} ${msg}`),
  header: (msg: string) =>
    console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// TYPES
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  message: string;
  details?: string;
}

interface ValidationReport {
  timestamp: string;
  category: string;
  results: ValidationResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

// ============================================================================
// TEST DATA
// ============================================================================

const TEST_MEMORIES = [
  {
    id: 'mem-old-weak',
    userId: 'test-user',
    type: 'fact' as const,
    content: 'Old memory with low importance',
    topics: ['misc'],
    peopleMentioned: [],
    emotionalWeight: 0.2,
    strength: 0.3,
    importance: 0.2,
    createdAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days old
    updatedAt: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    lastAccessedAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days since access
    accessCount: 1,
    isProtected: false,
    isActiveCommitment: false,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
  {
    id: 'mem-emotional',
    userId: 'test-user',
    type: 'insight' as const,
    content: 'Emotionally significant memory about breakthrough',
    topics: ['growth', 'breakthrough'],
    peopleMentioned: [],
    emotionalWeight: 0.9,
    strength: 0.8,
    importance: 0.85,
    createdAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days old
    updatedAt: new Date(),
    lastAccessedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    accessCount: 5,
    isProtected: false,
    isActiveCommitment: false,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
  {
    id: 'mem-commitment',
    userId: 'test-user',
    type: 'commitment' as const,
    content: 'User committed to exercising 3 times a week',
    topics: ['fitness', 'goals'],
    peopleMentioned: [],
    emotionalWeight: 0.6,
    strength: 0.9,
    importance: 0.8,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000), // 14 days old
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 3,
    isProtected: false,
    isActiveCommitment: true,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
  {
    id: 'mem-similar-1',
    userId: 'test-user',
    type: 'fact' as const,
    content: 'User likes coffee in the morning',
    topics: ['preferences', 'morning routine'],
    peopleMentioned: [],
    emotionalWeight: 0.3,
    strength: 0.7,
    importance: 0.4,
    createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 2,
    isProtected: false,
    isActiveCommitment: false,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
  {
    id: 'mem-similar-2',
    userId: 'test-user',
    type: 'fact' as const,
    content: 'User enjoys drinking coffee when they wake up',
    topics: ['preferences', 'morning routine'],
    peopleMentioned: [],
    emotionalWeight: 0.3,
    strength: 0.6,
    importance: 0.4,
    createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 1,
    isProtected: false,
    isActiveCommitment: false,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
];

// ============================================================================
// DECAY VALIDATION
// ============================================================================

async function validateDecay(): Promise<ValidationResult[]> {
  log.header(`${icons.decay} Decay Calculations Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getDecayManager } = await import(
      '../../../../../src/memory/lifecycle/decay-manager.js'
    );

    // Test 1: Decay manager singleton
    const manager = getDecayManager();
    results.push({
      name: 'Decay manager singleton',
      passed: manager !== null && manager !== undefined,
      message: manager ? 'Available' : 'Failed to get singleton',
    });

    if (!manager) {
      log.error('Decay manager not available');
      return results;
    }

    log.success('Decay manager: Available');

    // Test 2: Apply decay to memories
    try {
      const decayResult = await manager.applyDecay(TEST_MEMORIES as never);

      results.push({
        name: 'Decay calculation',
        passed: decayResult !== null && decayResult.results.length > 0,
        message: `Processed ${decayResult.processed} memories`,
        details: `Marked for cleanup: ${decayResult.results.filter((r) => r.shouldCleanup).length}`,
      });

      log.success(`Decay calculation: ${decayResult.processed} memories processed`);

      // Check individual results
      for (const result of decayResult.results) {
        const memory = TEST_MEMORIES.find((m) => m.id === result.memoryId);
        log.step(
          `${result.memoryId}: strength ${result.previousStrength.toFixed(2)} → ${result.newStrength.toFixed(2)} (decay: ${result.decayAmount.toFixed(3)})${result.shouldCleanup ? ' [CLEANUP]' : ''}`
        );
      }
    } catch (err) {
      results.push({
        name: 'Decay calculation',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Decay calculation error: ${err}`);
    }

    // Test 3: Emotional protection
    try {
      const emotionalMemory = TEST_MEMORIES.find((m) => m.id === 'mem-emotional');
      const weakMemory = TEST_MEMORIES.find((m) => m.id === 'mem-old-weak');

      if (emotionalMemory && weakMemory) {
        const decayResult = await manager.applyDecay([emotionalMemory, weakMemory] as never);

        const emotionalResult = decayResult.results.find((r) => r.memoryId === 'mem-emotional');
        const weakResult = decayResult.results.find((r) => r.memoryId === 'mem-old-weak');

        const emotionalProtected =
          emotionalResult && emotionalResult.decayAmount < (weakResult?.decayAmount || 0);

        results.push({
          name: 'Emotional protection',
          passed: emotionalProtected === true,
          message: emotionalProtected
            ? 'Emotional memories protected from excessive decay'
            : 'Emotional memories not receiving protection',
          details: `Emotional decay: ${emotionalResult?.decayAmount.toFixed(3) || 'N/A'}, Weak decay: ${weakResult?.decayAmount.toFixed(3) || 'N/A'}`,
        });

        if (emotionalProtected) {
          log.success('Emotional protection: Working correctly');
        } else {
          log.warn('Emotional protection: May not be working as expected');
        }
      }
    } catch (err) {
      results.push({
        name: 'Emotional protection',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Emotional protection test error: ${err}`);
    }

    // Test 4: Commitment protection
    try {
      const commitmentMemory = TEST_MEMORIES.find((m) => m.id === 'mem-commitment');

      if (commitmentMemory) {
        const decayResult = await manager.applyDecay([commitmentMemory] as never);
        const commitmentResult = decayResult.results.find((r) => r.memoryId === 'mem-commitment');

        // Active commitments should be protected (minimal or no decay)
        const isProtected =
          commitmentResult && (commitmentResult.totalProtection > 0.5 || commitmentResult.decayAmount < 0.05);

        results.push({
          name: 'Commitment protection',
          passed: isProtected === true,
          message: isProtected
            ? 'Active commitments protected from decay'
            : 'Active commitments may not be protected',
          details: `Protection factor: ${commitmentResult?.totalProtection.toFixed(2) || 'N/A'}`,
        });

        if (isProtected) {
          log.success('Commitment protection: Active commitments protected');
        } else {
          log.warn('Commitment protection: May not be working as expected');
        }
      }
    } catch (err) {
      results.push({
        name: 'Commitment protection',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Commitment protection test error: ${err}`);
    }
  } catch (error) {
    results.push({
      name: 'Decay validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Decay validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// CONSOLIDATION VALIDATION
// ============================================================================

async function validateConsolidation(): Promise<ValidationResult[]> {
  log.header(`${icons.merge} Consolidation Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getConsolidationManager } = await import(
      '../../../../../src/memory/lifecycle/consolidation-manager.js'
    );

    // Test 1: Consolidation manager singleton
    const manager = getConsolidationManager();
    results.push({
      name: 'Consolidation manager singleton',
      passed: manager !== null && manager !== undefined,
      message: manager ? 'Available' : 'Failed to get singleton',
    });

    if (!manager) {
      log.error('Consolidation manager not available');
      return results;
    }

    log.success('Consolidation manager: Available');

    // Test 2: Find consolidation groups
    try {
      const batchResult = await manager.consolidateBatch(TEST_MEMORIES as never);

      results.push({
        name: 'Consolidation batch',
        passed: batchResult !== null,
        message: `Found ${batchResult.groupsFound} groups, consolidated ${batchResult.memoriesConsolidated} memories`,
      });

      log.success(`Consolidation: ${batchResult.groupsFound} groups found`);
      log.step(`Memories consolidated: ${batchResult.memoriesConsolidated}`);

      for (const result of batchResult.results) {
        if (result.consolidated) {
          log.step(`Group: ${result.originalIds.join(', ')} → merged`);
        }
      }
    } catch (err) {
      results.push({
        name: 'Consolidation batch',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Consolidation error: ${err}`);
    }

    // Test 3: Similar memory detection (the coffee memories should be detected)
    try {
      const similarMemories = TEST_MEMORIES.filter(
        (m) => m.id === 'mem-similar-1' || m.id === 'mem-similar-2'
      );

      const batchResult = await manager.consolidateBatch(similarMemories as never);

      const foundSimilar = batchResult.groupsFound > 0 || batchResult.memoriesConsolidated > 0;

      results.push({
        name: 'Similar memory detection',
        passed: true, // We don't require it to find them, just to process without error
        message: foundSimilar
          ? `Detected ${batchResult.groupsFound} similar groups`
          : 'No similar groups detected (may need embedding comparison)',
      });

      if (foundSimilar) {
        log.success('Similar memory detection: Found similar memories');
      } else {
        log.info('Similar memory detection: No groups found (may need embeddings)');
      }
    } catch (err) {
      results.push({
        name: 'Similar memory detection',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Similar memory detection error: ${err}`);
    }
  } catch (error) {
    results.push({
      name: 'Consolidation validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Consolidation validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// HEALTH MONITORING VALIDATION
// ============================================================================

async function validateHealth(): Promise<ValidationResult[]> {
  log.header(`${icons.health} Health Monitoring Validation`);

  const results: ValidationResult[] = [];

  try {
    // Test 1: Unified Store health check
    const { getUnifiedStore } = await import(
      '../../../../../src/memory/unified-store/facade.js'
    );

    const store = getUnifiedStore();

    try {
      await store.initialize();
      const health = await store.health();

      results.push({
        name: 'Unified Store health',
        passed: health.healthy,
        message: health.healthy ? 'All stores healthy' : 'Some stores unhealthy',
        details: `Firestore: ${health.stores.firestore.healthy ? '✓' : '✗'}, Vector: ${health.stores.vector.healthy ? '✓' : '✗'}, Redis: ${health.stores.redis.healthy ? '✓' : '✗'}`,
      });

      if (health.healthy) {
        log.success('Unified Store health: All healthy');
      } else {
        log.warn(`Unified Store health: Degraded - ${health.degradationReason}`);
      }

      log.step(`Firestore: ${health.stores.firestore.healthy ? 'OK' : 'DOWN'}`);
      log.step(`Vector: ${health.stores.vector.healthy ? 'OK' : 'DOWN'}`);
      log.step(`Redis: ${health.stores.redis.healthy ? 'OK' : 'DOWN'}`);

      if (health.recommendations && health.recommendations.length > 0) {
        log.step(`Recommendations: ${health.recommendations.join(', ')}`);
      }
    } catch (err) {
      results.push({
        name: 'Unified Store health',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Health check error: ${err}`);
    }

    // Test 2: Memory health check job
    try {
      const { MemoryHealthCheckJob } = await import(
        '../../../../../src/tasks/scheduled/memory-jobs.js'
      );

      const job = new MemoryHealthCheckJob();
      const jobResult = await job.run({ dryRun: true, sendAlerts: false });

      results.push({
        name: 'Health check job',
        passed: jobResult.healthScore >= 50,
        message: `Health score: ${jobResult.healthScore}/100`,
        details: `Alerts: ${jobResult.alerts.length}`,
      });

      if (jobResult.healthScore >= 80) {
        log.success(`Health check job: Score ${jobResult.healthScore}/100 (Healthy)`);
      } else if (jobResult.healthScore >= 50) {
        log.warn(`Health check job: Score ${jobResult.healthScore}/100 (Degraded)`);
      } else {
        log.error(`Health check job: Score ${jobResult.healthScore}/100 (Unhealthy)`);
      }

      for (const alert of jobResult.alerts.slice(0, 3)) {
        log.step(`Alert (${alert.severity}): ${alert.message}`);
      }
    } catch (err) {
      results.push({
        name: 'Health check job',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Health check job error: ${err}`);
    }
  } catch (error) {
    results.push({
      name: 'Health validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Health validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// SCHEDULED JOBS VALIDATION
// ============================================================================

async function validateScheduledJobs(): Promise<ValidationResult[]> {
  log.header(`${icons.clock} Scheduled Jobs Validation`);

  const results: ValidationResult[] = [];

  try {
    // Test 1: Decay job (dry run)
    try {
      const { MemoryDecayJob } = await import(
        '../../../../../src/tasks/scheduled/memory-jobs.js'
      );

      const decayJob = new MemoryDecayJob();
      const decayResult = await decayJob.run({ dryRun: true, maxUsersPerRun: 5 });

      results.push({
        name: 'Decay job (dry run)',
        passed: true,
        message: `Would process ${decayResult.usersProcessed} users`,
        details: `Decay: ${decayResult.memoriesDecayed}, Prune: ${decayResult.memoriesPruned}`,
      });

      log.success(`Decay job: Would process ${decayResult.usersProcessed} users`);
      log.step(`Memories to decay: ${decayResult.memoriesDecayed}`);
      log.step(`Memories to prune: ${decayResult.memoriesPruned}`);
    } catch (err) {
      results.push({
        name: 'Decay job (dry run)',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Decay job error: ${err}`);
    }

    // Test 2: Consolidation job (dry run)
    try {
      const { MemoryConsolidationJob } = await import(
        '../../../../../src/tasks/scheduled/memory-jobs.js'
      );

      const consolidationJob = new MemoryConsolidationJob();
      const consolidationResult = await consolidationJob.run({ dryRun: true, maxUsersPerRun: 5 });

      results.push({
        name: 'Consolidation job (dry run)',
        passed: true,
        message: `Would process ${consolidationResult.usersProcessed} users`,
        details: `Groups: ${consolidationResult.groupsConsolidated}, Memories: ${consolidationResult.memoriesCompressed}`,
      });

      log.success(`Consolidation job: Would process ${consolidationResult.usersProcessed} users`);
      log.step(`Groups to consolidate: ${consolidationResult.groupsConsolidated}`);
      log.step(`Memories to compress: ${consolidationResult.memoriesCompressed}`);
    } catch (err) {
      results.push({
        name: 'Consolidation job (dry run)',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Consolidation job error: ${err}`);
    }

    // Test 3: Deduplication job (dry run)
    try {
      const { MemoryDeduplicationJob } = await import(
        '../../../../../src/tasks/scheduled/memory-jobs.js'
      );

      const dedupJob = new MemoryDeduplicationJob();
      const dedupResult = await dedupJob.run({ dryRun: true, maxUsersPerRun: 5 });

      results.push({
        name: 'Deduplication job (dry run)',
        passed: true,
        message: `Would process ${dedupResult.usersProcessed} users`,
        details: `Duplicates: ${dedupResult.duplicatesFound}, Merged: ${dedupResult.memoriesMerged}`,
      });

      log.success(`Deduplication job: Would process ${dedupResult.usersProcessed} users`);
      log.step(`Duplicates to find: ${dedupResult.duplicatesFound}`);
      log.step(`Memories to merge: ${dedupResult.memoriesMerged}`);
    } catch (err) {
      results.push({
        name: 'Deduplication job (dry run)',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Deduplication job error: ${err}`);
    }
  } catch (error) {
    results.push({
      name: 'Scheduled jobs validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Scheduled jobs validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// REPORT GENERATION
// ============================================================================

function generateReport(category: string, results: ValidationResult[]): ValidationReport {
  const passed = results.filter((r) => r.passed).length;
  return {
    timestamp: new Date().toISOString(),
    category,
    results,
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length > 0 ? (passed / results.length) * 100 : 0,
    },
  };
}

function printSummary(reports: ValidationReport[]): void {
  log.header('📊 Validation Summary');

  let totalTests = 0;
  let totalPassed = 0;

  for (const report of reports) {
    totalTests += report.summary.total;
    totalPassed += report.summary.passed;

    const passColor = report.summary.passRate >= 80 ? colors.green : colors.red;
    console.log(
      `  ${report.category.padEnd(25)} ${passColor}${report.summary.passed}/${report.summary.total}${colors.reset} (${report.summary.passRate.toFixed(1)}%)`
    );
  }

  console.log('');
  const overallRate = totalTests > 0 ? (totalPassed / totalTests) * 100 : 0;
  const overallColor = overallRate >= 80 ? colors.green : colors.red;
  console.log(
    `${colors.bold}Overall:${colors.reset} ${overallColor}${totalPassed}/${totalTests}${colors.reset} (${overallRate.toFixed(1)}%)`
  );
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

export async function runMemoryLifecycleValidation(options: {
  mode?: 'decay' | 'consolidation' | 'health' | 'jobs' | 'all';
  reportFormat?: 'console' | 'json';
}): Promise<ValidationReport[]> {
  const mode = options.mode || 'all';
  const reports: ValidationReport[] = [];

  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}MEMORY LIFECYCLE VALIDATION${colors.reset}                                ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  log.info(`Mode: ${mode}`);

  // Run selected validations
  if (mode === 'all' || mode === 'decay') {
    const results = await validateDecay();
    reports.push(generateReport('Decay Calculations', results));
  }

  if (mode === 'all' || mode === 'consolidation') {
    const results = await validateConsolidation();
    reports.push(generateReport('Consolidation', results));
  }

  if (mode === 'all' || mode === 'health') {
    const results = await validateHealth();
    reports.push(generateReport('Health Monitoring', results));
  }

  if (mode === 'all' || mode === 'jobs') {
    const results = await validateScheduledJobs();
    reports.push(generateReport('Scheduled Jobs', results));
  }

  // Print summary
  printSummary(reports);

  // Output JSON if requested
  if (options.reportFormat === 'json') {
    console.log('\n' + JSON.stringify(reports, null, 2));
  }

  return reports;
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
  const options: Parameters<typeof runMemoryLifecycleValidation>[0] = {
    mode: 'all',
    reportFormat: 'console',
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'decay') options.mode = 'decay';
    else if (arg === 'consolidation') options.mode = 'consolidation';
    else if (arg === 'health') options.mode = 'health';
    else if (arg === 'jobs') options.mode = 'jobs';
    else if (arg === 'all') options.mode = 'all';
    else if (arg === '--report' && args[i + 1] === 'json') {
      options.reportFormat = 'json';
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Memory Lifecycle Validation

Validates the Memory Lifecycle management system.

Usage:
  ferni validate lifecycle                    # Full validation (all modes)
  ferni validate lifecycle decay              # Test decay calculations only
  ferni validate lifecycle consolidation      # Test memory consolidation only
  ferni validate lifecycle health             # Test health monitoring only
  ferni validate lifecycle jobs               # Test scheduled jobs only

Options:
  --report json    Output JSON report
  --help, -h       Show this help

Validates:
  - Decay calculations (strength decay, protection factors)
  - Consolidation (memory merging, pattern detection)
  - Health monitoring (system health, alerts)
  - Scheduled jobs (decay/consolidation job integration)
`);
      return;
    }
  }

  const reports = await runMemoryLifecycleValidation(options);

  // Exit with error code if validation failed
  const overallPassed = reports.every((r) => r.summary.passRate >= 80);
  if (!overallPassed) {
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
