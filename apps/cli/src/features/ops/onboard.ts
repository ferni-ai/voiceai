#!/usr/bin/env npx tsx
/**
 * Developer Onboarding
 * 
 * Interactive setup for new developers.
 * 
 * @module @ferni/cli/onboard
 */

import { execSync, spawnSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(dirname(__dirname));

// =============================================================================
// COLORS
// =============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

const log = {
  info: (msg: string) => console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  step: (msg: string) => console.log(`  ${colors.dim}→${colors.reset} ${msg}`),
};

// =============================================================================
// ONBOARDING CHECKS
// =============================================================================

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
  fix?: string;
}

async function checkNode(): Promise<CheckResult> {
  try {
    const version = execSync('node --version', { encoding: 'utf8' }).trim();
    const major = parseInt(version.replace('v', '').split('.')[0]);
    
    if (major >= 18) {
      return { name: 'Node.js', passed: true, message: `${version} installed` };
    }
    return { 
      name: 'Node.js', 
      passed: false, 
      message: `${version} (need v18+)`,
      fix: 'Install Node 18+: nvm install 18',
    };
  } catch {
    return { 
      name: 'Node.js', 
      passed: false, 
      message: 'Not installed',
      fix: 'Install from: https://nodejs.org',
    };
  }
}

async function checkGit(): Promise<CheckResult> {
  try {
    execSync('git --version', { stdio: 'pipe' });
    const email = execSync('git config user.email', { encoding: 'utf8', stdio: 'pipe' }).trim();
    
    if (email) {
      return { name: 'Git', passed: true, message: `Configured (${email})` };
    }
    return { 
      name: 'Git', 
      passed: false, 
      message: 'Email not configured',
      fix: 'git config --global user.email "you@example.com"',
    };
  } catch {
    return { 
      name: 'Git', 
      passed: false, 
      message: 'Not installed or not configured',
      fix: 'git config --global user.name "Your Name"',
    };
  }
}

async function checkGcloud(): Promise<CheckResult> {
  try {
    execSync('gcloud --version', { stdio: 'pipe' });
    const account = execSync('gcloud auth list --filter="status:ACTIVE" --format="value(account)"', { 
      encoding: 'utf8', 
      stdio: 'pipe' 
    }).trim();
    
    if (account) {
      return { name: 'gcloud CLI', passed: true, message: `Authenticated (${account})` };
    }
    return { 
      name: 'gcloud CLI', 
      passed: false, 
      message: 'Not authenticated',
      fix: 'gcloud auth login',
    };
  } catch {
    return { 
      name: 'gcloud CLI', 
      passed: false, 
      message: 'Not installed',
      fix: 'Install from: https://cloud.google.com/sdk/install',
    };
  }
}

async function checkEnvFile(): Promise<CheckResult> {
  const envPath = join(PROJECT_ROOT, '.env');
  const envExamplePath = join(PROJECT_ROOT, '.env.example');
  
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf8');
    const missingVars = [];
    
    const requiredVars = [
      'GOOGLE_API_KEY',
      'LIVEKIT_URL',
      'LIVEKIT_API_KEY',
      'LIVEKIT_API_SECRET',
    ];
    
    for (const v of requiredVars) {
      if (!content.includes(`${v}=`) || content.includes(`${v}=\n`) || content.includes(`${v}=""`)) {
        missingVars.push(v);
      }
    }
    
    if (missingVars.length === 0) {
      return { name: '.env file', passed: true, message: 'Configured' };
    }
    return { 
      name: '.env file', 
      passed: false, 
      message: `Missing: ${missingVars.join(', ')}`,
      fix: 'Fill in missing values in .env',
    };
  }
  
  return { 
    name: '.env file', 
    passed: false, 
    message: 'Not found',
    fix: 'cp .env.example .env',
  };
}

async function checkDependencies(): Promise<CheckResult> {
  const nodeModules = join(PROJECT_ROOT, 'node_modules');
  
  if (existsSync(nodeModules)) {
    return { name: 'Dependencies', passed: true, message: 'Installed' };
  }
  return { 
    name: 'Dependencies', 
    passed: false, 
    message: 'Not installed',
    fix: 'npm install',
  };
}

async function checkFirebase(): Promise<CheckResult> {
  try {
    execSync('firebase --version', { stdio: 'pipe' });
    
    // Check if logged in
    const projects = execSync('firebase projects:list --json', { 
      encoding: 'utf8', 
      stdio: 'pipe',
      timeout: 10000,
    });
    
    return { name: 'Firebase CLI', passed: true, message: 'Installed & authenticated' };
  } catch {
    return { 
      name: 'Firebase CLI', 
      passed: false, 
      message: 'Not installed or not authenticated',
      fix: 'npm install -g firebase-tools && firebase login',
    };
  }
}

// =============================================================================
// INTERACTIVE ONBOARDING
// =============================================================================

async function runOnboarding(): Promise<void> {
  console.log(`
${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║  🌱 Welcome to Ferni!                                        ║
║                                                              ║
║  Let's get you set up for development.                       ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const question = (prompt: string) => new Promise<string>(resolve => rl.question(prompt, resolve));

  // Run checks
  console.log(`${colors.bold}Running environment checks...${colors.reset}\n`);

  const checks = [
    await checkNode(),
    await checkGit(),
    await checkGcloud(),
    await checkFirebase(),
    await checkEnvFile(),
    await checkDependencies(),
  ];

  // Display results
  let failedCount = 0;
  for (const check of checks) {
    const icon = check.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`  ${icon} ${check.name.padEnd(15)} ${check.passed ? colors.dim : colors.yellow}${check.message}${colors.reset}`);
    
    if (!check.passed) failedCount++;
  }

  console.log();

  if (failedCount === 0) {
    log.success('All checks passed! You\'re ready to go.\n');
    
    console.log(`${colors.bold}Quick Start:${colors.reset}\n`);
    console.log(`  ${colors.cyan}ferni dev start${colors.reset}     Start development servers`);
    console.log(`  ${colors.cyan}ferni status${colors.reset}        Check deployment status`);
    console.log(`  ${colors.cyan}ferni doctor${colors.reset}        Run diagnostics`);
    console.log();
  } else {
    log.warn(`${failedCount} check(s) need attention.\n`);
    
    const autoFix = await question(`${colors.cyan}Would you like me to fix what I can? (y/n): ${colors.reset}`);
    
    if (autoFix.toLowerCase() === 'y') {
      console.log();
      
      for (const check of checks) {
        if (!check.passed && check.fix) {
          log.info(`Fixing: ${check.name}`);
          log.step(check.fix);
          
          try {
            // Auto-fix certain things
            if (check.fix.startsWith('cp ')) {
              const [, src, dst] = check.fix.split(' ');
              copyFileSync(join(PROJECT_ROOT, src), join(PROJECT_ROOT, dst));
              log.success(`Created ${dst}`);
            } else if (check.fix === 'npm install') {
              log.info('Installing dependencies (this may take a minute)...');
              execSync('npm install', { cwd: PROJECT_ROOT, stdio: 'inherit' });
              log.success('Dependencies installed');
            } else {
              console.log(`  ${colors.dim}Run manually: ${check.fix}${colors.reset}`);
            }
          } catch (error) {
            log.error(`Failed: ${error}`);
          }
          console.log();
        }
      }
    }
  }

  // Show helpful resources
  console.log(`${colors.bold}📚 Helpful Resources:${colors.reset}\n`);
  console.log(`  ${colors.dim}•${colors.reset} README.md               Project overview`);
  console.log(`  ${colors.dim}•${colors.reset} CONTRIBUTING.md         Contribution guidelines`);
  console.log(`  ${colors.dim}•${colors.reset} docs/                   Documentation`);
  console.log(`  ${colors.dim}•${colors.reset} design-system/          Design system & tokens`);
  console.log(`  ${colors.dim}•${colors.reset} CLAUDE.md               AI assistant guidelines`);
  console.log();

  console.log(`${colors.bold}🤝 Need help?${colors.reset}\n`);
  console.log(`  ${colors.dim}•${colors.reset} Run ${colors.cyan}ferni doctor${colors.reset} for diagnostics`);
  console.log(`  ${colors.dim}•${colors.reset} Check #engineering in Slack`);
  console.log(`  ${colors.dim}•${colors.reset} Ask Ferni! 🌿`);
  console.log();

  rl.close();
}

async function checkEnvironment(): Promise<void> {
  console.log(`\n${colors.bold}${colors.cyan}🔍 Environment Check${colors.reset}\n`);

  const checks = [
    await checkNode(),
    await checkGit(),
    await checkGcloud(),
    await checkFirebase(),
    await checkEnvFile(),
    await checkDependencies(),
  ];

  let allPassed = true;
  for (const check of checks) {
    const icon = check.passed ? `${colors.green}✓${colors.reset}` : `${colors.red}✗${colors.reset}`;
    console.log(`  ${icon} ${check.name.padEnd(15)} ${check.message}`);
    
    if (!check.passed) {
      allPassed = false;
      if (check.fix) {
        console.log(`    ${colors.dim}Fix: ${check.fix}${colors.reset}`);
      }
    }
  }

  console.log();
  if (allPassed) {
    log.success('All checks passed!');
  } else {
    log.warn('Some checks failed. Run ferni onboard to fix.');
  }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function handleOnboard(args: string[]): Promise<void> {
  const subcommand = args[0] || 'start';

  switch (subcommand) {
    case 'start':
    case 'setup':
      await runOnboarding();
      break;
    
    case 'check':
    case 'status':
      await checkEnvironment();
      break;
    
    default:
      console.log(`${colors.bold}Onboarding Commands:${colors.reset}\n`);
      console.log(`  ${colors.cyan}start${colors.reset}   Interactive onboarding`);
      console.log(`  ${colors.cyan}check${colors.reset}   Check environment status`);
  }
}

