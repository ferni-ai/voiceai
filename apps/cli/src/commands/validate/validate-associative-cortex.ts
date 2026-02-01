/**
 * Associative Cortex Validation CLI
 *
 * Validates the Associative Cortex system components:
 * - Spreading activation (memory graph traversal)
 * - Link detection (auto-linking memories)
 * - Narrative building (story arc construction)
 * - Connection discovery (finding related memories)
 *
 * Usage:
 *   ferni validate cortex                    # Full validation
 *   ferni validate cortex activation         # Test spreading activation only
 *   ferni validate cortex links              # Test link detection only
 *   ferni validate cortex narratives         # Test narrative building only
 *   ferni validate cortex --report json      # Output JSON report
 *
 * @module cli/commands/validate/validate-associative-cortex
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
  brain: '🧠',
  link: '🔗',
  story: '📖',
  spark: '⚡',
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
    id: 'mem-1',
    userId: 'test-user',
    type: 'insight' as const,
    content: 'User mentioned they are training for a marathon in April',
    topics: ['fitness', 'marathon', 'goals'],
    peopleMentioned: [],
    emotionalWeight: 0.6,
    strength: 0.9,
    importance: 0.7,
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 3,
    isProtected: false,
    isActiveCommitment: false,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
  {
    id: 'mem-2',
    userId: 'test-user',
    type: 'fact' as const,
    content: 'User works as a software engineer and enjoys running',
    topics: ['career', 'fitness', 'hobbies'],
    peopleMentioned: [],
    emotionalWeight: 0.4,
    strength: 0.85,
    importance: 0.6,
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(),
    lastAccessedAt: new Date(),
    accessCount: 5,
    isProtected: false,
    isActiveCommitment: false,
    personaIds: ['ferni'],
    storageLayer: 'firestore' as const,
    embedding: [],
    metadata: {},
  },
  {
    id: 'mem-3',
    userId: 'test-user',
    type: 'insight' as const,
    content: 'User mentioned stress from work deadlines affecting their training',
    topics: ['stress', 'work', 'fitness'],
    peopleMentioned: [],
    emotionalWeight: 0.8,
    strength: 0.9,
    importance: 0.8,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
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
];

// ============================================================================
// ACTIVATION VALIDATION
// ============================================================================

async function validateActivation(): Promise<ValidationResult[]> {
  log.header(`${icons.spark} Spreading Activation Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getAssociativeCortex } = await import(
      '../../../../../src/memory/associative-cortex/index.js'
    );

    const cortex = getAssociativeCortex();

    // Test 1: Cortex singleton
    results.push({
      name: 'Cortex singleton',
      passed: cortex !== null && cortex !== undefined,
      message: cortex ? 'Available' : 'Failed to get singleton',
    });

    if (!cortex) {
      log.error('Cortex singleton not available');
      return results;
    }

    log.success('Cortex singleton: Available');

    // Cache test memories for activation tests
    cortex.cacheMemories('test-user', TEST_MEMORIES);
    log.step('Cached test memories for activation');

    // Test 2: Spreading activation execution
    try {
      const activation = await cortex.spreadActivation(['mem-1'], {
        maxIterations: 2,
        minActivation: 0.1,
        decayFactor: 0.7,
      });

      results.push({
        name: 'Spreading activation execution',
        passed: activation !== null && activation.nodes !== undefined,
        message: activation ? `Activated ${activation.nodes.size} nodes` : 'Failed to execute',
        details: activation?.ranked
          ? `Top: ${activation.ranked.slice(0, 3).map((n) => n.memoryId).join(', ')}`
          : undefined,
      });

      if (activation && activation.nodes) {
        log.success(`Spreading activation: ${activation.nodes.size} nodes activated`);
        if (activation.ranked.length > 0) {
          log.step(`Top activated: ${activation.ranked.slice(0, 3).map((n) => `${n.memoryId}(${n.activation.toFixed(2)})`).join(', ')}`);
        }
      } else {
        log.error('Spreading activation: Failed');
      }
    } catch (err) {
      results.push({
        name: 'Spreading activation execution',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Spreading activation error: ${err}`);
    }

    // Test 3: Activation with multiple seeds
    try {
      const multiActivation = await cortex.spreadActivation(['mem-1', 'mem-2'], {
        maxIterations: 3,
        minActivation: 0.05,
      });

      results.push({
        name: 'Multi-seed activation',
        passed: multiActivation !== null && multiActivation.nodes.size >= 2,
        message: `Activated from multiple seeds: ${multiActivation.nodes.size} nodes`,
      });

      log.success(`Multi-seed activation: ${multiActivation.nodes.size} nodes`);
    } catch (err) {
      results.push({
        name: 'Multi-seed activation',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Multi-seed activation error: ${err}`);
    }

    // Clear caches after test
    cortex.clearCaches();
  } catch (error) {
    results.push({
      name: 'Activation validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Activation validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// LINK DETECTION VALIDATION
// ============================================================================

async function validateLinks(): Promise<ValidationResult[]> {
  log.header(`${icons.link} Link Detection Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getAssociativeCortex } = await import(
      '../../../../../src/memory/associative-cortex/index.js'
    );
    const { getLinkDetector } = await import(
      '../../../../../src/memory/associative-cortex/graph/link-detector.js'
    );

    // Test 1: Link detector singleton
    const detector = getLinkDetector();
    results.push({
      name: 'Link detector singleton',
      passed: detector !== null && detector !== undefined,
      message: detector ? 'Available' : 'Failed to get singleton',
    });

    if (!detector) {
      log.error('Link detector not available');
      return results;
    }

    log.success('Link detector: Available');

    // Test 2: Detect links between related memories
    try {
      const newMemory = {
        ...TEST_MEMORIES[0],
        id: 'mem-new',
        content: 'User completed their first 10K run as part of marathon training',
        topics: ['fitness', 'running', 'achievement'],
      };

      const detections = await detector.detectLinks(newMemory as never, TEST_MEMORIES as never);

      results.push({
        name: 'Link detection (topic match)',
        passed: detections.length > 0,
        message: detections.length > 0 ? `Detected ${detections.length} links` : 'No links detected',
        details: detections.length > 0
          ? `Types: ${detections.map((d) => d.link.type).join(', ')}`
          : 'Expected links based on topic overlap',
      });

      if (detections.length > 0) {
        log.success(`Link detection: ${detections.length} links found`);
        log.step(`Types: ${detections.map((d) => `${d.link.type}(${d.confidence.toFixed(2)})`).join(', ')}`);
      } else {
        log.warn('Link detection: No links found (may be expected for test data)');
      }
    } catch (err) {
      results.push({
        name: 'Link detection (topic match)',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Link detection error: ${err}`);
    }

    // Test 3: Auto-link via cortex
    const cortex = getAssociativeCortex();
    cortex.cacheMemories('test-user', TEST_MEMORIES);

    try {
      const newMemory = {
        ...TEST_MEMORIES[0],
        id: 'mem-autolink',
        content: 'User mentioned their running schedule conflicts with work meetings',
        topics: ['fitness', 'work', 'scheduling'],
      };

      const links = await cortex.autoLink(newMemory as never, TEST_MEMORIES as never);

      results.push({
        name: 'Auto-link via cortex',
        passed: true, // Just needs to not throw
        message: `Auto-linked: ${links.length} new links created`,
      });

      log.success(`Auto-link: ${links.length} links created`);
    } catch (err) {
      results.push({
        name: 'Auto-link via cortex',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Auto-link error: ${err}`);
    }

    cortex.clearCaches();
  } catch (error) {
    results.push({
      name: 'Link validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Link validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// NARRATIVE VALIDATION
// ============================================================================

async function validateNarratives(): Promise<ValidationResult[]> {
  log.header(`${icons.story} Narrative Building Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getAssociativeCortex } = await import(
      '../../../../../src/memory/associative-cortex/index.js'
    );
    const { getNarrativeBuilder } = await import(
      '../../../../../src/memory/associative-cortex/discovery/narrative-builder.js'
    );

    // Test 1: Narrative builder singleton
    const builder = getNarrativeBuilder();
    results.push({
      name: 'Narrative builder singleton',
      passed: builder !== null && builder !== undefined,
      message: builder ? 'Available' : 'Failed to get singleton',
    });

    if (!builder) {
      log.error('Narrative builder not available');
      return results;
    }

    log.success('Narrative builder: Available');

    // Test 2: Build narrative from test memories
    try {
      const narrative = await builder.buildNarrative('test-user', 'fitness journey', TEST_MEMORIES as never);

      results.push({
        name: 'Narrative building',
        passed: narrative !== null,
        message: narrative ? `Built narrative with ${narrative.keyMoments?.length || 0} moments` : 'No narrative built',
        details: narrative?.theme ? `Theme: ${narrative.theme}` : undefined,
      });

      if (narrative) {
        log.success(`Narrative built: ${narrative.keyMoments?.length || 0} moments`);
        log.step(`Theme: ${narrative.theme}`);
        if (narrative.emotionalTrajectory) {
          log.step(`Emotional trajectory: ${narrative.emotionalTrajectory.direction}`);
        }
      } else {
        log.warn('Narrative building: No narrative generated (may need more memories)');
      }
    } catch (err) {
      results.push({
        name: 'Narrative building',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Narrative building error: ${err}`);
    }

    // Test 3: Find narratives via cortex
    const cortex = getAssociativeCortex();
    cortex.cacheMemories('test-user', TEST_MEMORIES);

    try {
      const narratives = await cortex.getUserNarratives('test-user');

      results.push({
        name: 'User narratives discovery',
        passed: true, // Just needs to not throw
        message: `Found ${narratives.length} narratives for user`,
      });

      log.success(`User narratives: ${narratives.length} found`);
      for (const narr of narratives.slice(0, 3)) {
        log.step(`- ${narr.theme} (${narr.keyMoments?.length || 0} moments)`);
      }
    } catch (err) {
      results.push({
        name: 'User narratives discovery',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`User narratives error: ${err}`);
    }

    cortex.clearCaches();
  } catch (error) {
    results.push({
      name: 'Narrative validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Narrative validation error: ${error}`);
  }

  return results;
}

// ============================================================================
// CONNECTION DISCOVERY VALIDATION
// ============================================================================

async function validateConnections(): Promise<ValidationResult[]> {
  log.header(`${icons.brain} Connection Discovery Validation`);

  const results: ValidationResult[] = [];

  try {
    const { getAssociativeCortex } = await import(
      '../../../../../src/memory/associative-cortex/index.js'
    );
    const { getConnectionFinder } = await import(
      '../../../../../src/memory/associative-cortex/discovery/connection-finder.js'
    );

    // Test 1: Connection finder singleton
    const finder = getConnectionFinder();
    results.push({
      name: 'Connection finder singleton',
      passed: finder !== null && finder !== undefined,
      message: finder ? 'Available' : 'Failed to get singleton',
    });

    if (!finder) {
      log.error('Connection finder not available');
      return results;
    }

    log.success('Connection finder: Available');

    // Test 2: Find connections via cortex
    const cortex = getAssociativeCortex();
    cortex.cacheMemories('test-user', TEST_MEMORIES);

    try {
      const connections = await cortex.findConnections('mem-1', { maxConnections: 5 });

      results.push({
        name: 'Connection discovery',
        passed: true, // Just needs to not throw
        message: `Found ${connections.length} connections`,
        details: connections.length > 0
          ? `Types: ${connections.map((c) => c.connectionType).join(', ')}`
          : 'No connections found (may be expected)',
      });

      log.success(`Connection discovery: ${connections.length} connections`);
      for (const conn of connections.slice(0, 3)) {
        log.step(`- ${conn.connectionType}: ${conn.description?.slice(0, 50) || 'No description'}...`);
      }
    } catch (err) {
      results.push({
        name: 'Connection discovery',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Connection discovery error: ${err}`);
    }

    // Test 3: Graph statistics
    try {
      const stats = await cortex.getStats('test-user');

      results.push({
        name: 'Graph statistics',
        passed: stats !== null && stats.totalMemories !== undefined,
        message: `Stats: ${stats.totalMemories} memories, ${stats.totalLinks} links`,
        details: `Avg links/memory: ${stats.averageLinksPerMemory.toFixed(2)}`,
      });

      log.success(`Graph stats: ${stats.totalMemories} memories, ${stats.totalLinks} links`);
      log.step(`Average links per memory: ${stats.averageLinksPerMemory.toFixed(2)}`);
    } catch (err) {
      results.push({
        name: 'Graph statistics',
        passed: false,
        message: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
      log.error(`Graph statistics error: ${err}`);
    }

    cortex.clearCaches();
  } catch (error) {
    results.push({
      name: 'Connection validation error',
      passed: false,
      message: `Error: ${error instanceof Error ? error.message : String(error)}`,
    });
    log.error(`Connection validation error: ${error}`);
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

export async function runAssociativeCortexValidation(options: {
  mode?: 'activation' | 'links' | 'narratives' | 'connections' | 'all';
  reportFormat?: 'console' | 'json';
}): Promise<ValidationReport[]> {
  const mode = options.mode || 'all';
  const reports: ValidationReport[] = [];

  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}ASSOCIATIVE CORTEX VALIDATION${colors.reset}                              ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  log.info(`Mode: ${mode}`);

  // Run selected validations
  if (mode === 'all' || mode === 'activation') {
    const results = await validateActivation();
    reports.push(generateReport('Spreading Activation', results));
  }

  if (mode === 'all' || mode === 'links') {
    const results = await validateLinks();
    reports.push(generateReport('Link Detection', results));
  }

  if (mode === 'all' || mode === 'narratives') {
    const results = await validateNarratives();
    reports.push(generateReport('Narrative Building', results));
  }

  if (mode === 'all' || mode === 'connections') {
    const results = await validateConnections();
    reports.push(generateReport('Connection Discovery', results));
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
  const options: Parameters<typeof runAssociativeCortexValidation>[0] = {
    mode: 'all',
    reportFormat: 'console',
  };

  // Parse args
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === 'activation') options.mode = 'activation';
    else if (arg === 'links') options.mode = 'links';
    else if (arg === 'narratives') options.mode = 'narratives';
    else if (arg === 'connections') options.mode = 'connections';
    else if (arg === 'all') options.mode = 'all';
    else if (arg === '--report' && args[i + 1] === 'json') {
      options.reportFormat = 'json';
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Associative Cortex Validation

Validates the Associative Cortex system components.

Usage:
  ferni validate cortex                    # Full validation (all modes)
  ferni validate cortex activation         # Test spreading activation only
  ferni validate cortex links              # Test link detection only
  ferni validate cortex narratives         # Test narrative building only
  ferni validate cortex connections        # Test connection discovery only

Options:
  --report json    Output JSON report
  --help, -h       Show this help

Validates:
  - Spreading activation (memory graph traversal)
  - Link detection (auto-linking memories)
  - Narrative building (story arc construction)
  - Connection discovery (finding related memories)
`);
      return;
    }
  }

  const reports = await runAssociativeCortexValidation(options);

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
