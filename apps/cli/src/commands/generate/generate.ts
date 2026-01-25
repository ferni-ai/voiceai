#!/usr/bin/env npx tsx
/**
 * Unified Generate CLI
 *
 * Single entry point for all code/asset generation tasks.
 *
 * Usage:
 *   npx tsx scripts/generate.ts                   # Show help
 *   npx tsx scripts/generate.ts personas          # Generate frontend personas
 *   npx tsx scripts/generate.ts env               # Generate .env.example
 *   npx tsx scripts/generate.ts vapid             # Generate VAPID keys
 *   npx tsx scripts/generate.ts marketing         # Generate marketing assets
 *   npx tsx scripts/generate.ts design-system     # Build design system (tokens, colors, sounds, assets)
 *
 * Or via npm:
 *   npm run generate personas
 *   npm run generate design-system
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
// GENERATOR DEFINITIONS
// ============================================================================

interface GeneratorTask {
  name: string;
  description: string;
  command: string;
  args: string[];
}

const GENERATORS: Record<string, GeneratorTask> = {
  personas: {
    name: 'Frontend Personas',
    description: 'Generate persona TypeScript files for frontend',
    command: 'npx',
    args: ['tsx', 'apps/cli/src/commands/generate/generate-frontend-personas.ts'],
  },
  vapid: {
    name: 'VAPID Keys',
    description: 'Generate VAPID keys for web push notifications',
    command: 'npx',
    args: ['tsx', 'apps/cli/src/commands/generate/generate-vapid-keys.ts'],
  },
  marketing: {
    name: 'Marketing Assets',
    description: 'Generate marketing images using AI',
    command: 'npx',
    args: ['tsx', 'apps/cli/src/commands/generate/generate-marketing-assets.ts'],
  },
  'design-system': {
    name: 'Design System',
    description: 'Build tokens, persona colors, sounds, and assets',
    command: 'npm',
    args: ['run', 'build:design-system'],
  },
  tokens: {
    name: 'Design Tokens',
    description: 'Build CSS/JS tokens from JSON definitions',
    command: 'npm',
    args: ['run', 'build:tokens'],
  },
  'persona-colors': {
    name: 'Persona Colors',
    description: 'Generate persona-colors.generated.ts',
    command: 'npm',
    args: ['run', 'build:persona-colors'],
  },
  sounds: {
    name: 'Sounds Manifest',
    description: 'Generate sounds.generated.ts',
    command: 'npm',
    args: ['run', 'build:sounds'],
  },
  assets: {
    name: 'Design Assets',
    description: 'Generate PNGs from SVGs and copy assets',
    command: 'npm',
    args: ['run', 'build:assets'],
  },
};

// ============================================================================
// RUNNER
// ============================================================================

interface GeneratorResult {
  name: string;
  passed: boolean;
  duration: number;
}

async function runGenerator(key: string, task: GeneratorTask): Promise<GeneratorResult> {
  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn(task.command, task.args, {
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

async function runGenerators(keys: string[]): Promise<boolean> {
  const results: GeneratorResult[] = [];
  let allPassed = true;

  for (const key of keys) {
    const task = GENERATORS[key];
    if (!task) {
      log.error(`Unknown generator: ${key}`);
      continue;
    }

    log.step(task.name.toUpperCase());
    log.info(task.description);
    console.log();

    const result = await runGenerator(key, task);
    results.push(result);

    if (result.passed) {
      log.success(`${task.name} complete (${formatDuration(result.duration)})`);
    } else {
      log.error(`${task.name} failed (${formatDuration(result.duration)})`);
      allPassed = false;
    }

    console.log();
  }

  // Summary
  if (results.length > 1) {
    log.step('GENERATION SUMMARY');

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
  }

  return allPassed;
}

async function listGenerators(): Promise<void> {
  console.log(`
${colors.bold}Available Generators:${colors.reset}
`);

  for (const [key, task] of Object.entries(GENERATORS)) {
    console.log(`  ${colors.green}${key.padEnd(16)}${colors.reset} ${task.description}`);
  }
  console.log();
}

// ============================================================================
// CLI
// ============================================================================

function printHelp() {
  console.log(`
${colors.bold}${colors.cyan}FERNI GENERATE CLI${colors.reset}

${colors.bold}Usage:${colors.reset}
  npx tsx scripts/generate.ts <command>
  npm run generate <command>

${colors.bold}Commands:${colors.reset}
  ${colors.green}personas${colors.reset}       Generate frontend persona TypeScript files
  ${colors.green}vapid${colors.reset}          Generate VAPID keys for push notifications
  ${colors.green}marketing${colors.reset}      Generate marketing assets with AI
  ${colors.green}design-system${colors.reset}  Build complete design system
  ${colors.green}tokens${colors.reset}         Build design tokens only
  ${colors.green}persona-colors${colors.reset} Generate persona colors TypeScript
  ${colors.green}sounds${colors.reset}         Generate sounds manifest
  ${colors.green}assets${colors.reset}         Generate PNGs and copy assets
  ${colors.green}all${colors.reset}            Run all generators
  ${colors.green}list${colors.reset}           Show all available generators

${colors.bold}Options:${colors.reset}
  --help, -h     Show this help

${colors.bold}Examples:${colors.reset}
  npm run generate personas       # Generate frontend personas
  npm run generate design-system  # Build design system
  npm run generate vapid          # Generate VAPID keys
  npm run generate all            # Run all generators
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
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI GENERATE${colors.reset}                                            ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  let keysToRun: string[] = [];

  switch (command) {
    case 'list':
      await listGenerators();
      process.exit(0);

    case 'all':
      keysToRun = ['design-system', 'personas', 'vapid'];
      break;

    default:
      if (GENERATORS[command]) {
        keysToRun = [command];
      } else {
        log.error(`Unknown command: ${command}`);
        console.log('\nRun with --help to see available commands.');
        process.exit(1);
      }
  }

  const success = await runGenerators(keysToRun);
  process.exit(success ? 0 : 1);
}

main().catch((error) => {
  log.error(`Generation failed: ${error.message}`);
  process.exit(1);
});

