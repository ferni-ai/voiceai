#!/usr/bin/env npx tsx
/**
 * FERNI - Unified CLI
 *
 * One command to rule them all. Routes to all other CLIs.
 *
 * Usage:
 *   ferni                          # Interactive mode
 *   ferni deploy ui                # Deploy UI
 *   ferni test quick               # Run quick tests
 *   ferni setup local              # Setup local dev
 *   ferni generate all             # Generate all
 *   ferni validate all             # Run validations
 *   ferni audit all                # Run audits
 *   ferni build apps               # Build native apps
 *   ferni rollout start feature    # Start feature rollout
 *   ferni health                   # Check system health
 *
 * Or via npm:
 *   npm run ferni deploy ui
 */

import { spawn, spawnSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

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

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
};

// ============================================================================
// CLI REGISTRY
// ============================================================================

interface CliCommand {
  name: string;
  description: string;
  script: string;
  subcommands?: string[];
  examples?: string[];
}

const COMMANDS: Record<string, CliCommand> = {
  deploy: {
    name: 'Deploy',
    description: 'Deploy services to cloud',
    script: 'scripts/deploy.ts',
    subcommands: ['ui', 'agent', 'brand', 'landing', 'joel', 'evolution', 'all'],
    examples: ['ferni deploy ui', 'ferni deploy all --dry-run'],
  },
  setup: {
    name: 'Setup',
    description: 'Configure development environment',
    script: 'scripts/setup.ts',
    subcommands: ['local', 'icons', 'firestore', 'github', 'persistence', 'signing', 'slack', 'secrets', 'all'],
    examples: ['ferni setup local', 'ferni setup all --yes'],
  },
  test: {
    name: 'Test',
    description: 'Run test suites',
    script: 'scripts/test.ts',
    subcommands: ['unit', 'e2e', 'storage', 'comms', 'quick', 'all'],
    examples: ['ferni test quick', 'ferni test all -v'],
  },
  validate: {
    name: 'Validate',
    description: 'Run validations',
    script: 'scripts/validate.ts',
    subcommands: ['voices', 'humanization', 'integrations', 'persistence', 'all'],
    examples: ['ferni validate voices', 'ferni validate all'],
  },
  audit: {
    name: 'Audit',
    description: 'Run code quality audits',
    script: 'scripts/audit.ts',
    subcommands: ['quality', 'architecture', 'legacy', 'a11y', 'all'],
    examples: ['ferni audit quality', 'ferni audit all'],
  },
  build: {
    name: 'Build',
    description: 'Build applications',
    script: 'scripts/build.ts',
    subcommands: ['frontend', 'electron', 'ios', 'android', 'apps', 'sync', 'store-assets'],
    examples: ['ferni build frontend', 'ferni build apps'],
  },
  generate: {
    name: 'Generate',
    description: 'Generate code and assets',
    script: 'scripts/generate.ts',
    subcommands: ['personas', 'env', 'vapid', 'marketing', 'design-system', 'all'],
    examples: ['ferni generate design-system', 'ferni generate all'],
  },
  rollout: {
    name: 'Rollout',
    description: 'Manage feature rollouts',
    script: 'scripts/rollout.ts',
    subcommands: ['start', 'status', 'advance', 'rollback', 'list', 'presets'],
    examples: ['ferni rollout start feature --preset=canary', 'ferni rollout status'],
  },
};

// ============================================================================
// COMMAND EXECUTION
// ============================================================================

function runCommand(script: string, args: string[]): void {
  const result = spawnSync('npx', ['tsx', script, ...args], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: true,
  });

  process.exit(result.status || 0);
}

// ============================================================================
// INTERACTIVE MODE
// ============================================================================

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function interactiveMode(): Promise<void> {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}${colors.green}FERNI${colors.reset} - Your AI Development Assistant                    ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}

${colors.bold}What would you like to do?${colors.reset}

`);

  const commandList = Object.entries(COMMANDS);
  
  commandList.forEach(([key, cmd], index) => {
    console.log(`  ${colors.green}${(index + 1).toString().padStart(2)}${colors.reset}) ${colors.bold}${cmd.name}${colors.reset} - ${cmd.description}`);
  });
  
  console.log(`  ${colors.green}${(commandList.length + 1).toString().padStart(2)}${colors.reset}) ${colors.bold}Health Check${colors.reset} - Check system status`);
  console.log(`  ${colors.green} 0${colors.reset}) ${colors.dim}Exit${colors.reset}`);
  console.log();

  const choice = await prompt(`${colors.cyan}Enter choice [1-${commandList.length + 1}]:${colors.reset} `);
  const choiceNum = parseInt(choice, 10);

  if (choiceNum === 0 || choice.toLowerCase() === 'q' || choice.toLowerCase() === 'exit') {
    console.log('\n👋 Goodbye!\n');
    process.exit(0);
  }

  if (choiceNum === commandList.length + 1) {
    // Health check
    await runHealthCheck();
    return;
  }

  if (choiceNum < 1 || choiceNum > commandList.length) {
    log.error('Invalid choice');
    process.exit(1);
  }

  const [cmdKey, cmd] = commandList[choiceNum - 1];
  
  console.log(`\n${colors.bold}${cmd.name} Subcommands:${colors.reset}\n`);
  
  cmd.subcommands?.forEach((sub, index) => {
    console.log(`  ${colors.green}${(index + 1).toString().padStart(2)}${colors.reset}) ${sub}`);
  });
  console.log(`  ${colors.green} 0${colors.reset}) ${colors.dim}Back${colors.reset}`);
  console.log();

  const subChoice = await prompt(`${colors.cyan}Enter choice [1-${cmd.subcommands?.length || 0}]:${colors.reset} `);
  const subNum = parseInt(subChoice, 10);

  if (subNum === 0) {
    await interactiveMode();
    return;
  }

  if (subNum < 1 || subNum > (cmd.subcommands?.length || 0)) {
    log.error('Invalid choice');
    process.exit(1);
  }

  const subcommand = cmd.subcommands?.[subNum - 1];
  console.log(`\n${colors.cyan}Running: ferni ${cmdKey} ${subcommand}${colors.reset}\n`);
  
  runCommand(cmd.script, [subcommand || '']);
}

// ============================================================================
// HEALTH CHECK
// ============================================================================

async function runHealthCheck(): Promise<void> {
  console.log(`
${colors.cyan}╔══════════════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║${colors.reset}  ${colors.bold}FERNI HEALTH CHECK${colors.reset}                                        ${colors.cyan}║${colors.reset}
${colors.cyan}╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const checks = [
    { name: 'Node.js', cmd: 'node --version', expected: /v\d+/ },
    { name: 'npm', cmd: 'npm --version', expected: /\d+\.\d+/ },
    { name: 'TypeScript', cmd: 'npx tsc --version', expected: /Version \d+/ },
    { name: 'gcloud', cmd: 'gcloud --version 2>/dev/null | head -1', expected: /Google Cloud SDK/ },
    { name: 'Docker', cmd: 'docker --version 2>/dev/null', expected: /Docker version/ },
  ];

  console.log(`${colors.bold}Environment:${colors.reset}\n`);

  for (const check of checks) {
    try {
      const result = spawnSync('sh', ['-c', check.cmd], { encoding: 'utf-8' });
      const output = result.stdout?.trim() || '';
      
      if (check.expected.test(output)) {
        console.log(`  ${colors.green}✓${colors.reset} ${check.name}: ${colors.dim}${output.split('\n')[0]}${colors.reset}`);
      } else {
        console.log(`  ${colors.yellow}⚠${colors.reset} ${check.name}: ${colors.dim}not found${colors.reset}`);
      }
    } catch {
      console.log(`  ${colors.red}✗${colors.reset} ${check.name}: ${colors.dim}error${colors.reset}`);
    }
  }

  console.log(`\n${colors.bold}Project:${colors.reset}\n`);

  // Check key files
  const files = [
    { name: 'package.json', path: 'package.json' },
    { name: '.env', path: '.env' },
    { name: 'Frontend', path: 'frontend-typescript/package.json' },
    { name: 'Design System', path: 'design-system/dist/tokens.css' },
  ];

  for (const file of files) {
    const result = spawnSync('test', ['-f', file.path], { cwd: PROJECT_ROOT });
    if (result.status === 0) {
      console.log(`  ${colors.green}✓${colors.reset} ${file.name}`);
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} ${file.name}: ${colors.dim}missing${colors.reset}`);
    }
  }

  console.log(`\n${colors.bold}Quick Commands:${colors.reset}\n`);
  console.log(`  ${colors.cyan}ferni setup local${colors.reset}     - Set up development environment`);
  console.log(`  ${colors.cyan}ferni test quick${colors.reset}      - Run quick validation tests`);
  console.log(`  ${colors.cyan}ferni generate all${colors.reset}    - Generate all code/assets`);
  console.log(`  ${colors.cyan}ferni deploy all${colors.reset}      - Deploy everything`);
  console.log();
}

// ============================================================================
// HELP
// ============================================================================

function printHelp(): void {
  console.log(`
${colors.bold}${colors.green}FERNI${colors.reset} - Unified CLI for Ferni AI

${colors.bold}Usage:${colors.reset}
  ferni                            Interactive mode
  ferni <command> [subcommand]     Run a specific command
  ferni health                     Check system health

${colors.bold}Commands:${colors.reset}
`);

  for (const [key, cmd] of Object.entries(COMMANDS)) {
    console.log(`  ${colors.green}${key.padEnd(12)}${colors.reset} ${cmd.description}`);
    if (cmd.subcommands) {
      console.log(`  ${colors.dim}             → ${cmd.subcommands.join(', ')}${colors.reset}`);
    }
  }

  console.log(`
${colors.bold}Examples:${colors.reset}
  ferni                          # Start interactive mode
  ferni deploy ui                # Deploy UI to cloud
  ferni test quick               # Run quick tests
  ferni setup local              # Set up local environment
  ferni generate design-system   # Build design system
  ferni audit all                # Run all audits
  ferni health                   # Check system health

${colors.bold}Tips:${colors.reset}
  • Run ${colors.cyan}ferni${colors.reset} without arguments for interactive mode
  • Add ${colors.cyan}--help${colors.reset} to any command for details
  • Use ${colors.cyan}--dry-run${colors.reset} with deploy commands to preview
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // No args = interactive mode
  if (args.length === 0) {
    await interactiveMode();
    return;
  }

  // Help
  if (args.includes('--help') || args.includes('-h') || args[0] === 'help') {
    printHelp();
    return;
  }

  // Health check
  if (args[0] === 'health' || args[0] === 'status') {
    await runHealthCheck();
    return;
  }

  // Find command
  const cmdKey = args[0];
  const cmd = COMMANDS[cmdKey];

  if (!cmd) {
    log.error(`Unknown command: ${cmdKey}`);
    console.log(`\nRun ${colors.cyan}ferni --help${colors.reset} to see available commands.\n`);
    process.exit(1);
  }

  // Run the command with remaining args
  runCommand(cmd.script, args.slice(1));
}

main().catch((error) => {
  log.error(`Failed: ${error.message}`);
  process.exit(1);
});

