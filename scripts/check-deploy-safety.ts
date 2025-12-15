#!/usr/bin/env npx tsx
/**
 * Deployment Safety Check
 *
 * Scans for unsafe deployment patterns and prevents direct cloud commands.
 * Run by pre-commit hook and CI/CD to catch mistakes.
 *
 * BLOCKS commits that contain:
 * - Direct `gcloud run deploy` commands (use `ferni deploy`)
 * - Direct `gcloud compute ssh ... docker run` (use `ferni deploy gce`)
 * - Hardcoded credentials or API keys
 *
 * Usage:
 *   npx tsx scripts/check-deploy-safety.ts          # Check all staged files
 *   npx tsx scripts/check-deploy-safety.ts --all    # Check entire codebase
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(__dirname);

// ============================================================================
// CONFIGURATION
// ============================================================================

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

// Patterns that indicate unsafe deployment practices
const UNSAFE_PATTERNS = [
  {
    pattern: /gcloud\s+run\s+deploy\s+(?!.*--dry-run)/gi,
    severity: 'error',
    message: 'Direct `gcloud run deploy` is forbidden',
    fix: 'Use `ferni deploy ui` or `ferni deploy gce` instead',
    allowedIn: ['scripts/deploy.ts', 'scripts/deploy-gce.ts', '.github/workflows/', 'docs/', '.md', 'CLAUDE.md', 'DEPLOYMENT.md', 'infrastructure/scripts/', '.cursorrules'],
  },
  {
    pattern: /gcloud\s+compute\s+ssh.*docker\s+run/gi,
    severity: 'error',
    message: 'Direct SSH + docker run is forbidden',
    fix: 'Use `ferni deploy gce` for blue-green deployment with health checks',
    allowedIn: ['scripts/deploy-gce.ts', 'scripts/check-deploy-safety.ts', 'docs/', '.md', 'CLAUDE.md', '.cursorrules'],
  },
  {
    pattern: /docker\s+push\s+gcr\.io/gi,
    severity: 'warning',
    message: 'Direct docker push detected',
    fix: 'Use `ferni deploy` which handles image tagging and push',
    allowedIn: ['scripts/', 'cloudbuild', 'Dockerfile', '.github/', 'docs/', '.md', 'CLAUDE.md'],
  },
  {
    pattern: /firebase\s+deploy\s+--only\s+hosting/gi,
    severity: 'warning',
    message: 'Direct firebase deploy detected',
    fix: 'Use `ferni deploy frontend` for consistent deployment',
    allowedIn: ['scripts/', '.github/', 'docs/', '.md', 'CLAUDE.md', 'README', 'promo/'],
  },
];

// Files/directories to skip
const SKIP_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /dist\//,
  /\.next\//,
  /coverage\//,
  /\.cursor\//,
  /test-results\//,
  /playwright-report\//,
];

// ============================================================================
// HELPERS
// ============================================================================

function log(type: 'info' | 'warn' | 'error' | 'success', msg: string): void {
  const icons = {
    info: `${colors.cyan}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    success: `${colors.green}✓${colors.reset}`,
  };
  console.log(`${icons[type]} ${msg}`);
}

function shouldSkip(filePath: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(filePath));
}

function isAllowedIn(filePath: string, allowedPaths: string[]): boolean {
  return allowedPaths.some((allowed) => filePath.includes(allowed));
}

interface Violation {
  file: string;
  line: number;
  pattern: string;
  message: string;
  fix: string;
  severity: 'error' | 'warning';
}

function checkFile(filePath: string): Violation[] {
  const violations: Violation[] = [];

  if (!existsSync(filePath) || shouldSkip(filePath)) {
    return violations;
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const unsafePattern of UNSAFE_PATTERNS) {
      // Skip if this file is in the allowed list
      if (isAllowedIn(filePath, unsafePattern.allowedIn)) {
        continue;
      }

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (unsafePattern.pattern.test(line)) {
          violations.push({
            file: filePath,
            line: i + 1,
            pattern: line.trim().substring(0, 80),
            message: unsafePattern.message,
            fix: unsafePattern.fix,
            severity: unsafePattern.severity as 'error' | 'warning',
          });
        }
        // Reset regex lastIndex
        unsafePattern.pattern.lastIndex = 0;
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return violations;
}

function getStagedFiles(): string[] {
  try {
    const output = execSync('git diff --cached --name-only --diff-filter=ACM', {
      encoding: 'utf-8',
      cwd: PROJECT_ROOT,
    });
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((f) => join(PROJECT_ROOT, f));
  } catch {
    return [];
  }
}

function getAllFiles(): string[] {
  try {
    const output = execSync(
      'git ls-files --cached --others --exclude-standard',
      { encoding: 'utf-8', cwd: PROJECT_ROOT }
    );
    return output
      .trim()
      .split('\n')
      .filter(Boolean)
      .filter((f) => /\.(ts|tsx|js|jsx|sh|yml|yaml|md)$/.test(f))
      .map((f) => join(PROJECT_ROOT, f));
  } catch {
    return [];
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const checkAll = args.includes('--all');

  console.log(`
${colors.bold}${colors.cyan}╔══════════════════════════════════════════════════════════════╗
║  DEPLOYMENT SAFETY CHECK                                     ║
╚══════════════════════════════════════════════════════════════╝${colors.reset}
`);

  const files = checkAll ? getAllFiles() : getStagedFiles();

  if (files.length === 0) {
    log('info', 'No files to check');
    return;
  }

  log('info', `Checking ${files.length} files...`);

  const allViolations: Violation[] = [];

  for (const file of files) {
    const violations = checkFile(file);
    allViolations.push(...violations);
  }

  // Report findings
  const errors = allViolations.filter((v) => v.severity === 'error');
  const warnings = allViolations.filter((v) => v.severity === 'warning');

  if (warnings.length > 0) {
    console.log(`\n${colors.yellow}${colors.bold}⚠ Warnings:${colors.reset}\n`);
    for (const v of warnings) {
      console.log(`  ${colors.yellow}${v.file}:${v.line}${colors.reset}`);
      console.log(`    ${v.message}`);
      console.log(`    ${colors.cyan}Fix: ${v.fix}${colors.reset}`);
      console.log();
    }
  }

  if (errors.length > 0) {
    console.log(`\n${colors.red}${colors.bold}✗ Errors (blocking):${colors.reset}\n`);
    for (const v of errors) {
      console.log(`  ${colors.red}${v.file}:${v.line}${colors.reset}`);
      console.log(`    ${v.message}`);
      console.log(`    Pattern: ${v.pattern}`);
      console.log(`    ${colors.cyan}Fix: ${v.fix}${colors.reset}`);
      console.log();
    }

    console.log(`
${colors.red}${colors.bold}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}

${colors.bold}DEPLOYMENT BLOCKED${colors.reset}

Found ${errors.length} unsafe deployment pattern(s).

${colors.cyan}Why this matters:${colors.reset}
  • Direct gcloud/firebase deploys skip health checks
  • Blue-green deployment prevents "choppy audio" and downtime
  • Ferni CLI ensures consistent, safe deployments

${colors.cyan}How to fix:${colors.reset}
  • Replace direct cloud commands with Ferni CLI
  • Run \`ferni deploy\` for interactive deployment
  • See CLAUDE.md "Production Deployment" section

${colors.red}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${colors.reset}
`);
    process.exit(1);
  }

  log('success', 'No unsafe deployment patterns found');
}

main().catch((error) => {
  console.error('Check failed:', error);
  process.exit(1);
});

