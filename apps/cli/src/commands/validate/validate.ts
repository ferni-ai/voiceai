#!/usr/bin/env npx tsx
/**
 * Unified Validation CLI
 *
 * Single entry point for all validation tasks.
 * Delegates to specialized validation scripts.
 *
 * Usage:
 *   npx tsx scripts/validate.ts                 # Show help
 *   npx tsx scripts/validate.ts voices          # Validate voice IDs
 *   npx tsx scripts/validate.ts humanization    # Validate humanization pipeline
 *   npx tsx scripts/validate.ts integrations    # Validate external integrations
 *   npx tsx scripts/validate.ts persistence     # Verify Firestore persistence
 *   npx tsx scripts/validate.ts all             # Run all validations
 *
 * Or via npm:
 *   npm run validate voices
 *   npm run validate all
 */

import { spawn } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

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
// VALIDATION DEFINITIONS
// ============================================================================

interface ValidationTask {
  name: string;
  description: string;
  script: string;
  category: 'core' | 'integration' | 'feature';
}

const VALIDATIONS: Record<string, ValidationTask> = {
  voices: {
    name: 'Voice IDs',
    description: 'Validate persona voice IDs are correctly configured',
    script: 'scripts/validate-voice-ids.ts',
    category: 'core',
  },
  humanization: {
    name: 'Humanization Pipeline',
    description: 'Validate conversation humanization modules',
    script: 'scripts/validate-humanization.ts',
    category: 'feature',
  },
  integrations: {
    name: 'External Integrations',
    description: 'Validate SendGrid, Twilio, Calendar, etc.',
    script: 'scripts/validate-integrations.ts',
    category: 'integration',
  },
  persistence: {
    name: 'Firestore Persistence',
    description: 'Verify Firestore connection and operations',
    script: 'scripts/verify-persistence.ts',
    category: 'core',
  },
  'memory-e2e': {
    name: 'Memory E2E',
    description: 'Run synthetic conversations to validate all memory/insight storage paths',
    script: 'apps/cli/src/commands/validate/validate-memory-e2e.ts',
    category: 'feature',
  },
};

// ============================================================================
// RUNNER
// ============================================================================

interface ValidationResult {
  name: string;
  passed: boolean;
  duration: number;
}

async function runValidation(key: string, task: ValidationTask): Promise<ValidationResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', task.script], {
      cwd: dirname(__dirname),
      stdio: 'inherit',
      shell: true,
    });

    child.on('close', (code) => {
      const duration = Date.now() - start;
      resolve({
        name: task.name,
        passed: code === 0,
        duration,
      });
    });

    child.on('error', () => {
      const duration = Date.now() - start;
      resolve({
        name: task.name,
        passed: false,
        duration,
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

async function runValidations(keys: string[]): Promise<boolean> {
  const results: ValidationResult[] = [];
  let allPassed = true;

  for (const key of keys) {
    const task = VALIDATIONS[key];
    if (!task) {
      log.error(`Unknown validation: ${key}`);
      continue;
    }

    log.step(task.name.toUpperCase());
    log.info(task.description);
    console.log();

    const result = await runValidation(key, task);
    results.push(result);

    if (!result.passed) {
      allPassed = false;
    }

    console.log();
  }

  // Summary
  log.step('VALIDATION SUMMARY');

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
    console.log(`${colors.red}Failed validations:${colors.reset}`);
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.name}`);
    }
  }

  return allPassed;
}

async function listValidations(): Promise<void> {
  console.log(`
${colors.bold}Available Validations:${colors.reset}
`);

  const categories: Record<string, string[]> = {
    core: [],
    integration: [],
    feature: [],
  };

  for (const [key, task] of Object.entries(VALIDATIONS)) {
    categories[task.category].push(key);
  }

  const categoryNames: Record<string, string> = {
    core: 'Core Validations',
    integration: 'Integration Validations',
    feature: 'Feature Validations',
  };

  for (const [category, keys] of Object.entries(categories)) {
    if (keys.length === 0) continue;

    console.log(`${colors.cyan}${categoryNames[category]}:${colors.reset}`);
    for (const key of keys) {
      const task = VALIDATIONS[key];
      console.log(`  ${colors.green}${key.padEnd(16)}${colors.reset} ${task.description}`);
    }
    console.log();
  }
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}FERNI VALIDATION CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/validate.ts <command>
  npm run validate <command>

${colors.bold}Commands:${colors.reset}
  ${colors.green}voices${colors.reset}         Validate voice IDs for all personas
  ${colors.green}humanization${colors.reset}   Validate humanization pipeline
  ${colors.green}integrations${colors.reset}   Validate external service integrations
  ${colors.green}persistence${colors.reset}    Verify Firestore persistence
  ${colors.green}all${colors.reset}            Run all validations
  ${colors.green}list${colors.reset}           Show all available validations

${colors.bold}Options:${colors.reset}
  --help, -h     Show this help

${colors.bold}Examples:${colors.reset}
  npm run validate voices        # Check voice configurations
  npm run validate all           # Run all validations
  npm run validate list          # Show available validations
`);
}

async function main() {
  const args = process.argv.slice(2);

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
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI VALIDATION${colors.reset}                                          ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let keysToRun: string[] = [];

  switch (command) {
    case 'list':
      await listValidations();
      process.exit(0);

    case 'all':
      keysToRun = Object.keys(VALIDATIONS);
      break;

    case 'core':
      keysToRun = Object.entries(VALIDATIONS)
        .filter(([, task]) => task.category === 'core')
        .map(([key]) => key);
      break;

    default:
      if (VALIDATIONS[command]) {
        keysToRun = [command];
      } else {
        log.error(`Unknown command: ${command}`);
        console.log('\nRun with --help to see available commands.');
        process.exit(1);
      }
  }

  const success = await runValidations(keysToRun);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  log.error(`Validation failed: ${error.message}`);
  process.exit(1);
});

