#!/usr/bin/env npx tsx
/**
 * Unified Test CLI
 *
 * Single entry point for running all test suites.
 * Provides discovery, aggregation, and reporting across test types.
 *
 * Usage:
 *   npx tsx scripts/test.ts                 # Show help
 *   npx tsx scripts/test.ts unit            # Run unit tests (vitest)
 *   npx tsx scripts/test.ts e2e             # Run E2E validation
 *   npx tsx scripts/test.ts storage         # Test storage backends
 *   npx tsx scripts/test.ts comms           # Test communication features
 *   npx tsx scripts/test.ts humanization    # Test humanization pipeline
 *   npx tsx scripts/test.ts outreach        # Test outreach intelligence
 *   npx tsx scripts/test.ts all             # Run all tests
 *
 * Or via npm:
 *   npm run test:cli unit
 *   npm run test:cli all
 */

import { execSync, spawn, ChildProcess } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..", "..", "..", "..", "..");

// ============================================================================
// COLORS & LOGGING
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
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`\n${colors.bold}${colors.cyan}━━━ ${msg} ━━━${colors.reset}\n`),
};

// ============================================================================
// TEST DEFINITIONS
// ============================================================================

interface TestSuite {
  name: string;
  description: string;
  command: string;
  args?: string[];
  category: 'unit' | 'integration' | 'e2e' | 'feature';
}

const TEST_SUITES: Record<string, TestSuite> = {
  unit: {
    name: 'Unit Tests',
    description: 'Fast unit tests with vitest',
    command: 'npm',
    args: ['test'],
    category: 'unit',
  },
  e2e: {
    name: 'End-to-End Validation',
    description: 'Full system validation before deployment',
    command: 'npx',
    args: ['tsx', 'scripts/test-e2e.ts'],
    category: 'e2e',
  },
  storage: {
    name: 'Storage Tests',
    description: 'Test PostgreSQL, Redis, and Firestore backends',
    command: 'npx',
    args: ['tsx', 'scripts/test-storage.ts'],
    category: 'integration',
  },
  comms: {
    name: 'Communication Tests',
    description: 'Test SendGrid, Twilio email/SMS/calls',
    command: 'npx',
    args: ['tsx', 'scripts/test-alex-comms.ts'],
    category: 'feature',
  },
  humanization: {
    name: 'Humanization Tests',
    description: 'Test conversation humanization pipeline',
    command: 'npx',
    args: ['tsx', 'scripts/test-humanizing-e2e.ts'],
    category: 'feature',
  },
  outreach: {
    name: 'Outreach Intelligence',
    description: 'Test proactive outreach prediction',
    command: 'npx',
    args: ['tsx', 'scripts/test-outreach-intelligence.ts'],
    category: 'feature',
  },
  'outreach-proactive': {
    name: 'Proactive Outreach',
    description: 'Test proactive outreach sending',
    command: 'npx',
    args: ['tsx', 'scripts/test-proactive-outreach.ts'],
    category: 'feature',
  },
  'outreach-full': {
    name: 'Full Outreach System',
    description: 'Complete outreach system integration test',
    command: 'npx',
    args: ['tsx', 'scripts/test-full-outreach-system.ts'],
    category: 'e2e',
  },
  playwright: {
    name: 'Playwright E2E',
    description: 'Browser-based E2E tests',
    command: 'npx',
    args: ['playwright', 'test'],
    category: 'e2e',
  },
  'design-system': {
    name: 'Design System',
    description: 'Visual regression tests for design system',
    command: 'npx',
    args: ['playwright', 'test', '--config=design-system/playwright.config.ts'],
    category: 'e2e',
  },
  smoke: {
    name: 'Smoke Tests',
    description: 'Post-deploy health checks',
    command: 'npx',
    args: ['tsx', 'scripts/smoke-test.ts'],
    category: 'e2e',
  },
};

// ============================================================================
// TEST RUNNER
// ============================================================================

interface TestResult {
  suite: string;
  passed: boolean;
  duration: number;
  output: string;
}

async function runTestSuite(name: string, suite: TestSuite, verbose: boolean): Promise<TestResult> {
  const start = Date.now();
  
  return new Promise((resolve) => {
    const args = suite.args || [];
    
    if (verbose) {
      log.info(`Running: ${suite.command} ${args.join(' ')}`);
    }

    const child = spawn(suite.command, args, {
      cwd: PROJECT_ROOT,
      stdio: verbose ? 'inherit' : 'pipe',
      shell: true,
    });

    let output = '';

    if (!verbose) {
      child.stdout?.on('data', (data) => {
        output += data.toString();
      });
      child.stderr?.on('data', (data) => {
        output += data.toString();
      });
    }

    child.on('close', (code) => {
      const duration = Date.now() - start;
      resolve({
        suite: name,
        passed: code === 0,
        duration,
        output,
      });
    });

    child.on('error', (error) => {
      const duration = Date.now() - start;
      resolve({
        suite: name,
        passed: false,
        duration,
        output: error.message,
      });
    });
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

// ============================================================================
// COMMANDS
// ============================================================================

interface TestOptions {
  verbose: boolean;
  parallel: boolean;
  filter?: string;
}

async function runTests(suites: string[], options: TestOptions): Promise<boolean> {
  const results: TestResult[] = [];
  let allPassed = true;

  for (const suiteName of suites) {
    const suite = TEST_SUITES[suiteName];
    if (!suite) {
      log.error(`Unknown test suite: ${suiteName}`);
      continue;
    }

    log.step(`${suite.name}`);
    log.info(suite.description);

    const result = await runTestSuite(suiteName, suite, options.verbose);
    results.push(result);

    if (result.passed) {
      log.success(`${suite.name} passed (${formatDuration(result.duration)})`);
    } else {
      log.error(`${suite.name} failed (${formatDuration(result.duration)})`);
      allPassed = false;

      if (!options.verbose && result.output) {
        console.log('\n--- Output ---');
        console.log(result.output.slice(-2000)); // Last 2000 chars
        console.log('--- End Output ---\n');
      }
    }
  }

  // Summary
  log.step('TEST SUMMARY');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`
${colors.bold}Results:${colors.reset}
  ${colors.green}Passed:${colors.reset} ${passed}
  ${colors.red}Failed:${colors.reset} ${failed}
  ${colors.dim}Total:${colors.reset}  ${results.length}
  ${colors.dim}Time:${colors.reset}   ${formatDuration(totalTime)}
`);

  if (failed > 0) {
    console.log(`${colors.red}Failed suites:${colors.reset}`);
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.suite}`);
    }
  }

  return allPassed;
}

async function listTests(): Promise<void> {
  console.log(`
${colors.bold}Available Test Suites:${colors.reset}
`);

  const categories: Record<string, string[]> = {
    unit: [],
    integration: [],
    e2e: [],
    feature: [],
  };

  for (const [name, suite] of Object.entries(TEST_SUITES)) {
    categories[suite.category].push(name);
  }

  const categoryNames: Record<string, string> = {
    unit: 'Unit Tests',
    integration: 'Integration Tests',
    e2e: 'End-to-End Tests',
    feature: 'Feature Tests',
  };

  for (const [category, names] of Object.entries(categories)) {
    if (names.length === 0) continue;

    console.log(`${colors.cyan}${categoryNames[category]}:${colors.reset}`);
    for (const name of names) {
      const suite = TEST_SUITES[name];
      console.log(`  ${colors.green}${name.padEnd(20)}${colors.reset} ${suite.description}`);
    }
    console.log();
  }
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}FERNI TEST CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/test.ts <command> [options]
  npm run test:cli <command> [options]

${colors.bold}Commands:${colors.reset}
  ${colors.green}unit${colors.reset}            Run unit tests (vitest)
  ${colors.green}e2e${colors.reset}             Run E2E validation suite
  ${colors.green}storage${colors.reset}         Test storage backends
  ${colors.green}comms${colors.reset}           Test communication features
  ${colors.green}humanization${colors.reset}    Test humanization pipeline
  ${colors.green}outreach${colors.reset}        Test outreach intelligence
  ${colors.green}playwright${colors.reset}      Run Playwright browser tests
  ${colors.green}design-system${colors.reset}   Run design system visual tests
  ${colors.green}all${colors.reset}             Run all tests
  ${colors.green}quick${colors.reset}           Run unit + e2e (fast validation)
  ${colors.green}list${colors.reset}            Show all available test suites

${colors.bold}Options:${colors.reset}
  --verbose, -v   Show full test output
  --help, -h      Show this help

${colors.bold}Test Groups:${colors.reset}
  ${colors.green}all${colors.reset}             All test suites
  ${colors.green}quick${colors.reset}           unit, e2e
  ${colors.green}integration${colors.reset}     storage, comms
  ${colors.green}features${colors.reset}        humanization, outreach

${colors.bold}Examples:${colors.reset}
  npm run test:cli unit           # Run unit tests
  npm run test:cli quick          # Fast pre-deploy validation
  npm run test:cli all -- -v      # Run all with verbose output
  npm run test:cli list           # Show available suites
`);
}

async function main() {
  const args = process.argv.slice(2);

  // Parse options
  const options: TestOptions = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    parallel: args.includes('--parallel'),
  };

  // Get command
  const commands = args.filter(arg => !arg.startsWith('--') && !arg.startsWith('-'));

  if (commands.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const command = commands[0];

  // Banner
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI TEST RUNNER${colors.reset}                                        ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let suitesToRun: string[] = [];

  switch (command) {
    case 'list':
      await listTests();
      process.exit(0);

    case 'all':
      suitesToRun = Object.keys(TEST_SUITES);
      break;

    case 'quick':
      suitesToRun = ['unit', 'e2e'];
      break;

    case 'integration':
      suitesToRun = ['storage', 'comms'];
      break;

    case 'features':
      suitesToRun = ['humanization', 'outreach'];
      break;

    default:
      if (TEST_SUITES[command]) {
        suitesToRun = [command];
      } else {
        log.error(`Unknown command: ${command}`);
        console.log('\nRun with --help to see available commands.');
        process.exit(1);
      }
  }

  const success = await runTests(suitesToRun, options);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  log.error(`Test runner failed: ${error.message}`);
  process.exit(1);
});

