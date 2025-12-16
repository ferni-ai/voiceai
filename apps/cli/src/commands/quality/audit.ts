#!/usr/bin/env npx tsx
/**
 * Unified Audit CLI
 *
 * Single entry point for all code quality and audit tasks.
 * Delegates to specialized audit scripts.
 *
 * Usage:
 *   npx tsx scripts/audit.ts                 # Show help
 *   npx tsx scripts/audit.ts quality         # Run code quality checks
 *   npx tsx scripts/audit.ts architecture    # Validate layer boundaries
 *   npx tsx scripts/audit.ts legacy          # Find legacy/deprecated code
 *   npx tsx scripts/audit.ts a11y [url]      # Run accessibility audit
 *   npx tsx scripts/audit.ts all             # Run all audits
 *
 * Or via npm:
 *   npm run audit quality
 *   npm run audit all
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
// AUDIT DEFINITIONS
// ============================================================================

interface AuditTask {
  name: string;
  description: string;
  script: string;
  category: 'quality' | 'architecture' | 'accessibility';
  acceptsArgs?: boolean;
}

const AUDITS: Record<string, AuditTask> = {
  quality: {
    name: 'Code Quality',
    description: 'Check for any types, console.log, file size limits',
    script: 'scripts/code-quality-check.ts',
    category: 'quality',
  },
  architecture: {
    name: 'Architecture Layers',
    description: 'Validate import direction and layer boundaries',
    script: 'scripts/architecture-validator.ts',
    category: 'architecture',
  },
  legacy: {
    name: 'Legacy Code',
    description: 'Find deprecated code and backward compatibility shims',
    script: 'scripts/audit-legacy.ts',
    category: 'quality',
  },
  a11y: {
    name: 'Accessibility',
    description: 'WCAG 2.1 AA accessibility audit (requires URL)',
    script: 'scripts/accessibility-audit.ts',
    category: 'accessibility',
    acceptsArgs: true,
  },
};

// ============================================================================
// RUNNER
// ============================================================================

interface AuditResult {
  name: string;
  passed: boolean;
  duration: number;
}

async function runAudit(key: string, task: AuditTask, extraArgs: string[] = []): Promise<AuditResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    const args = ['tsx', task.script, ...extraArgs];
    
    const child = spawn('npx', args, {
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

async function runAudits(keys: string[], extraArgs: string[] = []): Promise<boolean> {
  const results: AuditResult[] = [];
  let allPassed = true;

  for (const key of keys) {
    const task = AUDITS[key];
    if (!task) {
      log.error(`Unknown audit: ${key}`);
      continue;
    }

    log.step(task.name.toUpperCase());
    log.info(task.description);
    console.log();

    const argsToPass = task.acceptsArgs ? extraArgs : [];
    const result = await runAudit(key, task, argsToPass);
    results.push(result);

    if (!result.passed) {
      allPassed = false;
    }

    console.log();
  }

  // Summary
  log.step('AUDIT SUMMARY');

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
    console.log(`${colors.red}Failed audits:${colors.reset}`);
    for (const result of results.filter(r => !r.passed)) {
      console.log(`  ${colors.red}✗${colors.reset} ${result.name}`);
    }
  }

  return allPassed;
}

async function listAudits(): Promise<void> {
  console.log(`
${colors.bold}Available Audits:${colors.reset}
`);

  const categories: Record<string, string[]> = {
    quality: [],
    architecture: [],
    accessibility: [],
  };

  for (const [key, task] of Object.entries(AUDITS)) {
    categories[task.category].push(key);
  }

  const categoryNames: Record<string, string> = {
    quality: 'Code Quality',
    architecture: 'Architecture',
    accessibility: 'Accessibility',
  };

  for (const [category, keys] of Object.entries(categories)) {
    if (keys.length === 0) continue;

    console.log(`${colors.cyan}${categoryNames[category]}:${colors.reset}`);
    for (const key of keys) {
      const task = AUDITS[key];
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
${colors.bold}${colors.cyan}FERNI AUDIT CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/audit.ts <command> [args]
  npm run audit <command> [args]

${colors.bold}Commands:${colors.reset}
  ${colors.green}quality${colors.reset}        Run code quality checks (any types, console.log, etc.)
  ${colors.green}architecture${colors.reset}   Validate layer boundaries and imports
  ${colors.green}legacy${colors.reset}         Find deprecated and legacy code
  ${colors.green}a11y${colors.reset} [url]     Run accessibility audit on URL
  ${colors.green}all${colors.reset}            Run all audits (except a11y)
  ${colors.green}list${colors.reset}           Show all available audits

${colors.bold}Options:${colors.reset}
  --help, -h     Show this help

${colors.bold}Examples:${colors.reset}
  npm run audit quality                      # Check code quality
  npm run audit architecture                 # Check layer boundaries
  npm run audit a11y http://localhost:3005   # Accessibility audit
  npm run audit all                          # Run all audits
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
  const extraArgs = commands.slice(1);

  // Banner
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI AUDIT${colors.reset}                                               ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let keysToRun: string[] = [];

  switch (command) {
    case 'list':
      await listAudits();
      process.exit(0);

    case 'all':
      // Run all except a11y which requires a URL
      keysToRun = Object.entries(AUDITS)
        .filter(([, task]) => !task.acceptsArgs)
        .map(([key]) => key);
      break;

    default:
      if (AUDITS[command]) {
        keysToRun = [command];
      } else {
        log.error(`Unknown command: ${command}`);
        console.log('\nRun with --help to see available commands.');
        process.exit(1);
      }
  }

  const success = await runAudits(keysToRun, extraArgs);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  log.error(`Audit failed: ${error.message}`);
  process.exit(1);
});

